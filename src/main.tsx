
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance, initializeMsal } from './auth/msal'

// Check for user's theme preference before rendering
const userTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

// Apply theme class immediately before render
if (userTheme === "dark" || (!userTheme && prefersDark)) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

/**
 * Initialize MSAL before rendering React.
 *
 * This ensures:
 * 1. msalInstance.initialize() completes (required by MSAL v4)
 * 2. handleRedirectPromise() resolves — captures the auth result when
 *    returning from a loginRedirect() flow
 * 3. The app never renders in a half-initialized state where the login
 *    page flashes before the redirect result is processed
 */
async function bootstrap(): Promise<void> {
  // Initialize MSAL and handle any pending redirect response.
  // Errors are caught inside initializeMsal — it never throws.
  await initializeMsal();

  createRoot(document.getElementById("root")!).render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  );
}

bootstrap();
