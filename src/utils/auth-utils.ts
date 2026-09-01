/**
 * Authentication utilities for handling JWT tokens and automatic refresh.
 *
 * Token resolution priority in getValidToken():
 * 1. Valid (non-expired) backend JWT in memory
 * 2. Refresh the backend JWT via /api/auth/refresh-token
 * 3. Fallback: acquire a fresh token from the MSAL session (ssoSilent / acquireTokenSilent)
 *    and exchange it for a new backend JWT
 */

import { API_BASE_URL } from '@/config/api';
import { msalInstance, acquireBackendToken } from '@/auth/msal';

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// In-memory storage for the backend JWT to prevent XSS theft 
let memoryAuthToken: string | null = null;

export function setMemoryAuthToken(token: string | null) {
  memoryAuthToken = token;
}

export function clearAuthMemory() {
  memoryAuthToken = null;
}

/**
 * Check if a JWT token is expired.
 * Returns true if expired or unparseable.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    // Add 60-second buffer to avoid race conditions with nearly-expired tokens
    return payload.exp < currentTime + 60;
  } catch (error) {
    return true; // Assume expired if we can't parse
  }
}

/**
 * Refresh the access token via the backend refresh endpoint.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const currentToken = memoryAuthToken;
    if (!currentToken) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If credentials are invalid (401/403), clear token and force logout
      if (response.status === 401 || response.status === 403) {
        clearAuthMemory();
        // best-effort redirect to login/root so RequireAuth kicks in
        try {
          if (typeof window !== 'undefined') {
            window.location.href = '/';
          }
        } catch {}
      }
      return null;
    }

    const tokenData: TokenResponse = await response.json();
    setMemoryAuthToken(tokenData.access_token);
    return tokenData.access_token;
  } catch (error) {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 *
 * Resolution order:
 * 1. Non-expired token in memory → return immediately
 * 2. Expired token → attempt backend refresh
 * 3. No token or refresh failed → attempt MSAL silent acquire + backend exchange
 *    (this keeps API calls working when the user has a valid MSAL session
 *    but the backend JWT has expired and refresh also failed)
 */
export async function getValidToken(): Promise<string | null> {
  const currentToken = memoryAuthToken;

  // Fast path: valid token in storage
  if (currentToken && !isTokenExpired(currentToken)) {
    return currentToken;
  }

  // Try backend refresh first (uses the existing backend JWT)
  if (currentToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
  }

  // Fallback: acquire a fresh token from the MSAL session.
  // This covers the case where the backend JWT has fully expired but the
  // user still has a valid Microsoft session (e.g., they're signed in via
  // SharePoint / Microsoft 365).
  try {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      const backendToken = await acquireBackendToken(accounts[0]);
      if (backendToken) {
        return backendToken;
      }
    }
  } catch (error) {
    console.warn('[auth-utils] MSAL fallback token acquisition failed:', error);
  }

  return null;
}

// Transient infrastructure failures (single ECS task recycling, ALB 5xx,
// throttling) surface as these statuses or as a thrown network error. They are
// safe to retry ONLY for idempotent requests.
const TRANSIENT_RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 2; // 3 attempts total

function isIdempotentMethod(method?: string): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

async function fetchWithTransientRetry(url: string, init: RequestInit): Promise<Response> {
  const canRetry = isIdempotentMethod(init.method);
  let attempt = 0;

  for (;;) {
    try {
      const res = await fetch(url, init);
      if (canRetry && attempt < MAX_TRANSIENT_RETRIES && TRANSIENT_RETRY_STATUS.has(res.status)) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1) + Math.random() * 200));
        continue;
      }
      return res;
    } catch (err) {
      if (canRetry && attempt < MAX_TRANSIENT_RETRIES) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1) + Math.random() * 200));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Make an authenticated request with automatic token refresh.
 *
 * On 401 responses, attempts a single token refresh + retry before giving up.
 * Idempotent requests are also retried a couple of times on transient
 * infrastructure errors (network failure, 429/502/503/504).
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();

  if (!token) {
    throw new Error('No valid authentication token available');
  }

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  const response = await fetchWithTransientRetry(url, {
    ...options,
    headers,
  });

  // If we get a 401, try refreshing the token once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    
    if (newToken) {
      // Retry the request with the new token
      const retryHeaders = {
        ...options.headers,
        'Authorization': `Bearer ${newToken}`,
      };

      return fetchWithTransientRetry(url, {
        ...options,
        headers: retryHeaders,
      });
    }
  }

  return response;
}
