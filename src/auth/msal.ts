/**
 * MSAL Authentication Configuration & SSO Engine
 *
 * This module handles:
 * - PublicClientApplication configuration for Microsoft Entra ID
 * - MSAL initialization lifecycle (initialize → handleRedirectPromise)
 * - Silent SSO via ssoSilent() for SharePoint → Zenith zero-prompt login
 * - login_hint extraction from URL query params
 * - Backend token acquisition (MSAL token → backend JWT exchange)
 */

import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  type AccountInfo,
  type SilentRequest,
  type SsoSilentRequest,
  InteractionRequiredAuthError,
  BrowserAuthError
} from "@azure/msal-browser";
import { API_BASE_URL } from "@/config/api";
import { setMemoryAuthToken } from "@/utils/auth-utils";

// ---------------------------------------------------------------------------
// Scopes used for all login / token requests
// ---------------------------------------------------------------------------
export const LOGIN_SCOPES = ["User.Read"] as const;

// ---------------------------------------------------------------------------
// MSAL Configuration
// ---------------------------------------------------------------------------
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID as string,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID as string}`,
    redirectUri: window.location.origin,
    // Prevent MSAL from navigating to the original request URL after redirect;
    // our own router handles navigation after token exchange.
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
    // Enable cookie storage for cross-domain SSO (SharePoint → Zenith).
    // The cookie is small (auth state only) and required for ssoSilent()
    // to work when the app is opened from a different origin.
    storeAuthStateInCookie: true,
  },
};

// Singleton MSAL instance — shared across the app
export const msalInstance = new PublicClientApplication(msalConfig);

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Track whether initialization has completed (success or failure). */
let _initialized = false;
/** The result from handleRedirectPromise, if any (only set on redirect return). */
let _redirectResult: AuthenticationResult | null = null;

/**
 * Initialize MSAL and handle any pending redirect response.
 *
 * MUST be called **before** React renders so that:
 * 1. `msalInstance.initialize()` completes (required by MSAL v4).
 * 2. `handleRedirectPromise()` resolves — otherwise the redirect response
 *    from loginRedirect() is silently dropped, causing the user to see the
 *    login page again.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initializeMsal(): Promise<AuthenticationResult | null> {
  if (_initialized) return _redirectResult;

  try {
    // MSAL v4 requires explicit initialization before any interaction
    await msalInstance.initialize();

    // handleRedirectPromise() resolves with the AuthenticationResult when
    // returning from a loginRedirect() flow, or null otherwise.
    _redirectResult = await msalInstance.handleRedirectPromise();

    if (_redirectResult?.account) {
      // Set the returning account as the active account so subsequent
      // acquireTokenSilent() calls use it automatically.
      msalInstance.setActiveAccount(_redirectResult.account);
    }
  } catch (error) {
    // Log but don't throw — the app can still show the login button
    console.error("[MSAL] Initialization error:", error);
  } finally {
    _initialized = true;
  }

  return _redirectResult;
}

/**
 * Returns true once initializeMsal() has completed (success or failure).
 * Useful for RequireAuth to avoid premature redirects.
 */
export function isMsalInitialized(): boolean {
  return _initialized;
}

/**
 * Returns the redirect result captured during initialization, if any.
 */
export function getRedirectResult(): AuthenticationResult | null {
  return _redirectResult;
}

// ---------------------------------------------------------------------------
// login_hint Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the `login_hint` query parameter from the current URL.
 *
 * SharePoint links to Zenith like:
 *   https://zenith-app.com?login_hint=user@company.com
 *   https://zenith-app.com/home?login_hint=user@company.com
 *
 * Returns the email string, or null if not present.
 */
export function extractLoginHintFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const hint = params.get("login_hint");
    // Basic validation: must look like an email
    if (hint && hint.includes("@") && hint.includes(".")) {
      return hint.trim().toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSO Silent Login
// ---------------------------------------------------------------------------

/**
 * Attempt a silent SSO login using `ssoSilent()`.
 *
 * This is the core of the SharePoint → Zenith zero-prompt experience.
 * When the user is already signed in to Microsoft 365 (same Entra ID tenant),
 * `ssoSilent()` can authenticate them without any UI — no popup, no redirect.
 *
 * @param loginHint — Optional email hint (from URL param or known account).
 *                    Significantly improves success rate of ssoSilent().
 * @returns AuthenticationResult on success, or null if silent login fails.
 */
export async function attemptSsoSilent(
  loginHint?: string,
): Promise<AuthenticationResult | null> {
  if (!_initialized) {
    console.warn("[MSAL] attemptSsoSilent called before initialization");
    return null;
  }

  try {
    const ssoRequest: SsoSilentRequest = {
      scopes: [...LOGIN_SCOPES],
    };

    // login_hint tells Entra ID which account to target — critical for
    // multi-account scenarios and for SharePoint SSO where the user's
    // email is passed in the URL.
    if (loginHint) {
      ssoRequest.loginHint = loginHint;
    }

    // If there's already an active account, use it as a hint
    const activeAccount = msalInstance.getActiveAccount();
    if (activeAccount && !loginHint) {
      ssoRequest.loginHint = activeAccount.username;
    }

    const result = await msalInstance.ssoSilent(ssoRequest);

    if (result?.account) {
      msalInstance.setActiveAccount(result.account);
    }

    return result;
  } catch (error) {
    // InteractionRequiredAuthError is expected when:
    //  - No shared session exists (user hasn't signed in to this browser)
    //  - Consent is required
    //  - MFA is required
    // These are NOT errors — they just mean we need interactive login.
    if (error instanceof InteractionRequiredAuthError) {
      console.info("[MSAL] ssoSilent requires interaction — will show login UI");
      return null;
    }

    // BrowserAuthError with "no_account_error" — no cached accounts at all
    if (error instanceof BrowserAuthError) {
      console.info("[MSAL] ssoSilent: no cached accounts");
      return null;
    }

    console.warn("[MSAL] ssoSilent failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token Acquisition & Backend Exchange
// ---------------------------------------------------------------------------

/**
 * Acquire a valid backend JWT for the given MSAL account.
 *
 * Flow:
 * 1. acquireTokenSilent() → gets a fresh MSAL ID token + access token
 * 2. POST /api/auth/msal-token → exchanges MSAL ID token for backend JWT
 * 3. Stores the backend JWT in localStorage as `auth_token`
 *
 * @returns The backend JWT string, or null on failure.
 */
export async function acquireBackendToken(
  account: AccountInfo,
): Promise<string | null> {
  try {
    const silentRequest: SilentRequest = {
      scopes: [...LOGIN_SCOPES],
      account,
    };

    const result = await msalInstance.acquireTokenSilent(silentRequest);

    if (!result?.idToken) {
      console.warn("[MSAL] acquireTokenSilent returned no ID token");
      return null;
    }

    // Exchange the MSAL ID token for a backend JWT
    const backendRes = await fetch(`${API_BASE_URL}/auth/msal-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msal_token: result.idToken }),
    });

    if (!backendRes.ok) {
      console.error("[MSAL] Backend token exchange failed:", backendRes.status);
      return null;
    }

    const tokenData = await backendRes.json();
    const backendToken = tokenData.access_token;

    // Persist in memory for authenticatedFetch() and subsequent API calls
    setMemoryAuthToken(backendToken);

    return backendToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      console.info("[MSAL] acquireTokenSilent requires interaction");
      return null;
    }
    console.error("[MSAL] acquireBackendToken failed:", error);
    return null;
  }
}
