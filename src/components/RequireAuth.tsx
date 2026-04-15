import { ReactNode, useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { isMsalInitialized, msalInstance } from "@/auth/msal";

type RequireAuthProps = {
  children: ReactNode;
};

/**
 * Auth guard that protects routes behind authentication.
 *
 * Checks three sources for a valid session:
 * 1. MSAL accounts from the React provider (primary)
 * 2. Fallback: msalInstance.getAllAccounts() (provider state may lag)
 * 3. Backend JWT in localStorage (for API calls)
 *
 * During MSAL initialization (first ~100ms on page load), this component
 * returns null instead of redirecting to login — this prevents a flash
 * redirect when SSO or handleRedirectPromise is still resolving.
 */
export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { accounts } = useMsal();
  const [initReady, setInitReady] = useState(isMsalInitialized());

  // Poll briefly for MSAL initialization if not yet ready.
  // initializeMsal() in main.tsx should complete before React renders,
  // but this is a safety net for edge cases (slow network, etc.)
  useEffect(() => {
    if (initReady) return;

    const check = setInterval(() => {
      if (isMsalInitialized()) {
        setInitReady(true);
        clearInterval(check);
      }
    }, 50);

    // Give up after 3 seconds — if MSAL hasn't initialized by then,
    // treat as unauthenticated and redirect to login
    const timeout = setTimeout(() => {
      setInitReady(true);
      clearInterval(check);
    }, 3000);

    return () => {
      clearInterval(check);
      clearTimeout(timeout);
    };
  }, [initReady]);

  // While MSAL is still initializing, render nothing (prevents flash redirect)
  if (!initReady) {
    return null;
  }

  const hasMsalAccount = (accounts && accounts.length > 0) ||
    msalInstance.getAllAccounts().length > 0;

  // We rely completely on the MSAL session as the source of truth for persistent auth.
  // The actual backend JWT is stored in memory and acquired automatically on demand.
  if (!hasMsalAccount) {
    return <Navigate to={`/${location.search}`} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
