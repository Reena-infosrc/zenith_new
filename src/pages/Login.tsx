import { useState, useRef, useEffect, createElement } from "react";
import { useNavigate } from "react-router-dom";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { getFirstAvailableModuleRoute } from "@/utils/navigation";
import { useMsal } from "@azure/msal-react";
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";
import { Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/config/api";
import {
  extractLoginHintFromUrl,
  attemptSsoSilent,
  getRedirectResult,
  LOGIN_SCOPES,
} from "@/auth/msal";
import { setMemoryAuthToken, clearAuthMemory, getValidToken } from "@/utils/auth-utils";

const INTRO_VIDEO_SOURCES = [
  "/video/Start.mp4",
  "/video/Start Old.mp4",
  "/public/video/Start.mp4",
] as const;

const LOGIN_SUCCESS_VIDEO_SOURCES = [
  "/video/After_login.mp4",
  "/video/After_Login.mp4",
  "/video/after_login.mp4",
  "/public/video/After_login.mp4",
] as const;

export default function Login() {
  const [loginClicked, setLoginClicked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  // NEW: Track whether an SSO silent attempt is in progress (shows spinner, hides button)
  const [isSsoAttempting, setIsSsoAttempting] = useState(false);
  const navigate = useNavigate();
  const { featureFlagStatus, isLoading: flagsLoading } = useFeatureFlags();
  const { instance, accounts } = useMsal();
  
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const loginVideoRef = useRef<HTMLVideoElement>(null);
  const loginCompletedRef = useRef(false);
  // NEW: Prevent duplicate SSO attempts
  const ssoAttemptedRef = useRef(false);
  
  // Set a timeout to navigate to first available module if video playback takes too long
  useEffect(() => {
    if (loginClicked && !flagsLoading) {
      // Fallback navigation after 5 seconds if video doesn't complete
      const fallbackTimer = setTimeout(() => {
        if (loginVideoRef.current) {
          const firstAvailableRoute = getFirstAvailableModuleRoute(featureFlagStatus);
          navigate(firstAvailableRoute);
        }
      }, 5000);
      
      return () => clearTimeout(fallbackTimer);
    }
  }, [loginClicked, navigate, flagsLoading, featureFlagStatus]);
  
  // Monitor the login video's completion
  useEffect(() => {
    const loginVideo = loginVideoRef.current;
    
    if (!loginVideo || flagsLoading) return;
    
    const handleLoginVideoEnd = () => {
      const firstAvailableRoute = getFirstAvailableModuleRoute(featureFlagStatus);
      navigate(firstAvailableRoute);
    };
    
    const handleLoginVideoError = () => {
      console.error("Login video playback error");
      const firstAvailableRoute = getFirstAvailableModuleRoute(featureFlagStatus);
      navigate(firstAvailableRoute);
    };
    
    loginVideo.addEventListener('ended', handleLoginVideoEnd);
    loginVideo.addEventListener('error', handleLoginVideoError);
    
    return () => {
      loginVideo.removeEventListener('ended', handleLoginVideoEnd);
      loginVideo.removeEventListener('error', handleLoginVideoError);
    };
  }, [navigate, flagsLoading, featureFlagStatus]);

  const completeLoginWithToken = async (
    accessToken: string,
    idToken: string,
    clearTimeout?: () => void
  ) => {
    // Prevent duplicate invocations (MSAL can trigger the accounts effect twice)
    if (loginCompletedRef.current) return;
    loginCompletedRef.current = true;

    if (clearTimeout) {
      clearTimeout();
    }
    
    setIsProcessingLogin(true);
    
    // Fetch user profile from Microsoft Graph (use access token)
    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!graphRes.ok) {
      loginCompletedRef.current = false;
      setIsProcessingLogin(false);
      throw new Error("Failed to fetch profile from Microsoft Graph");
    }
    const profile = await graphRes.json();

    // First, clear any old/invalid tokens
    clearAuthMemory();
    let backendAuthToken = "";

    // Exchange MSAL ID token for backend token (backend validates by audience=client_id; access token has audience=graph.microsoft.com)
    try {
      const backendRes = await fetch(`${API_BASE_URL}/auth/msal-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ msal_token: idToken }),
      });
      
      
      if (backendRes.ok) {
        const tokenData = await backendRes.json();
        
        // Store the backend token in secure memory
        backendAuthToken = tokenData.access_token;
        setMemoryAuthToken(backendAuthToken);
        
        // Token stored successfully
      } else {
        const errorText = await backendRes.text();
        clearAuthMemory();
        loginCompletedRef.current = false;
        setIsProcessingLogin(false);
        alert('Authentication failed. Please try again.');
        return;
      }
    } catch (error) {
      clearAuthMemory();
      loginCompletedRef.current = false;
      setIsProcessingLogin(false);
      alert('Authentication failed. Please try again.');
      return;
    }

    // Wait a moment to ensure state updates
    await new Promise(resolve => setTimeout(resolve, 50));

    // Pre-fetch only feature-flags (tiny, fast) so the router knows which
    // modules are enabled. Employees + dashboard are heavy (full table scan +
    // KMS decrypt) — let the destination page load them; blocking login on
    // those caused a 3-min wait.
    const preFetchFlags = async () => {
      // Keep heavy directory/dashboard payloads in localStorage across login so first paint
      // is not empty; still drop other keys (e.g. stale feature-flags) before refetching.
      apiCache.clearExcept([CACHE_KEYS.EMPLOYEES, CACHE_KEYS.DASHBOARD]);
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (backendAuthToken) headers['Authorization'] = `Bearer ${backendAuthToken}`;

      try {
        const res = await fetch(`${API_BASE_URL}/feature-flags/`, { headers });
        if (res.ok) {
          const data = await res.json();
          apiCache.set(CACHE_KEYS.FEATURE_FLAGS, data, 10 * 60 * 1000);
          window.dispatchEvent(new CustomEvent('feature-flags-cache-updated'));
        }
      } catch (e) {
        console.warn("Feature-flags pre-fetch failed:", e);
      }
    };

    await preFetchFlags();

    // Performance preload is deferred to RequireAuth / the destination page
    // so it doesn't block navigation after login.

    // Trigger success transition and navigation/video
    setLoginClicked(true);
    if (introVideoRef.current) {
      introVideoRef.current.pause();
      introVideoRef.current.style.display = 'none';
    }
    if (loginVideoRef.current) {
      loginVideoRef.current.style.display = 'block';
      loginVideoRef.current.play().catch(err => {
        console.error("Could not play login video:", err);
        const firstAvailableRoute = getFirstAvailableModuleRoute(featureFlagStatus);
        navigate(firstAvailableRoute);
      });
    }
    toast.success("Login successful! Redirecting to dashboard...");
  };

  const handleLogin = async () => {
    setIsLoading(true);
    
    // Set a timeout to reset loading state in case of issues
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
      setIsProcessingLogin(false);
      toast.error("Sign-in is taking longer than expected. Please try again.");
    }, 30000); // 30 seconds timeout
    
    try {
      // Prefer redirect to avoid popup/cookie issues
      await instance.loginRedirect({ scopes: [...LOGIN_SCOPES] });
      // Flow continues after redirect back
    } catch (err: unknown) {
      clearTimeout(loadingTimeout);
      // Fallback to popup if redirect fails for some reason
      try {
        const loginResponse = await instance.loginPopup({ scopes: [...LOGIN_SCOPES] });
        await completeLoginWithToken(
          loginResponse.accessToken,
          loginResponse.idToken,
          () => clearTimeout(loadingTimeout)
        );
      } catch (popupErr) {
        console.error("SSO login error:", popupErr);
        toast.error("Microsoft sign-in failed or was cancelled.");
        setIsLoading(false);
        setIsProcessingLogin(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // NEW: SSO Silent Login Attempt on Mount
  //
  // When the URL contains ?login_hint=user@company.com (set by SharePoint),
  // attempt ssoSilent() to authenticate the user without any prompt.
  // This is the core of the zero-login UX from SharePoint.
  //
  // Also handles the redirect result from initializeMsal() — if the user
  // was returning from a loginRedirect(), the redirect result is already
  // captured and we just need to complete the login.
  // -----------------------------------------------------------------------
  useEffect(() => {
    // Only attempt once per page load
    if (ssoAttemptedRef.current || loginCompletedRef.current) return;
    ssoAttemptedRef.current = true;

    const doSsoAttempt = async () => {
      // Check 1: Was there a redirect result from initializeMsal()?
      // (This handles the return from loginRedirect — already processed
      // by handleRedirectPromise in msal.ts, but we still need to
      // exchange tokens and navigate.)
      const redirectResult = getRedirectResult();
      if (redirectResult?.accessToken && redirectResult?.idToken) {
        setIsSsoAttempting(true);
        try {
          await completeLoginWithToken(
            redirectResult.accessToken,
            redirectResult.idToken,
          );
          return; // Done — completeLoginWithToken handles navigation
        } catch (error) {
          console.error("[SSO] Failed to complete redirect login:", error);
          setIsSsoAttempting(false);
          // Fall through to try ssoSilent
        }
      }

      // Check 2: Is there a login_hint in the URL? (SharePoint flow)
      const loginHint = extractLoginHintFromUrl();

      // Check 3: Is there already an account from a previous session?
      const hasExistingAccount = accounts && accounts.length > 0;

      // Check 4: Did the user originate from SharePoint? (naked redirect without login_hint)
      const referrer = document.referrer || '';
      const isFromSharePoint = referrer.toLowerCase().includes('sharepoint.com');

      // Always try ssoSilent on mount. This ensures seamless "zero-click" SSO
      // from naked intranet links (e.g. SharePoint apps without login_hint).
      // Don't re-attempt if user explicitly logged out
      const hasLoggedOut = sessionStorage.getItem('user_logged_out');
      if (hasLoggedOut) {
        sessionStorage.removeItem('user_logged_out');
        return;
      }

      setIsSsoAttempting(true);

      try {
        const ssoResult = await attemptSsoSilent(
          loginHint || undefined,
        );

        if (ssoResult?.accessToken && ssoResult?.idToken) {
          await completeLoginWithToken(
            ssoResult.accessToken,
            ssoResult.idToken,
          );
          return; // Success — navigation handled by completeLoginWithToken
        } else if (loginHint || isFromSharePoint) {
          // Fallback: If ssoSilent returned null (e.g., 3rd-party cookies blocked)
          // and we originated from SharePoint or have a login_hint, forcefully redirect to identity provider
          console.info("[SSO] ssoSilent returned null, falling back to loginRedirect for bypass");
          await instance.loginRedirect({ scopes: [...LOGIN_SCOPES], loginHint: loginHint || undefined });
          return;
        }
      } catch (error) {
        console.info("[SSO] Silent login failed:", error);
        if (loginHint || isFromSharePoint) {
          // Fallback: If ssoSilent threw an error
          console.info("[SSO] ssoSilent threw an error, falling back to loginRedirect for bypass");
          await instance.loginRedirect({ scopes: [...LOGIN_SCOPES], loginHint: loginHint || undefined });
          return;
        }
      }

      setIsSsoAttempting(false);
    };

    doSsoAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After redirect, if we have an account, acquire token silently and continue
  // (This handles the case where the user returns from loginRedirect but
  // the redirect result was not captured — e.g., page state was lost.)
  useEffect(() => {
    const acquireAndProceed = async () => {
      // Already completed or in progress — skip
      if (loginCompletedRef.current) return;

      if (!accounts || accounts.length === 0) {
        if (!loginClicked && !isProcessingLogin && !isSsoAttempting) {
          setIsLoading(false);
        }
        return;
      }
      
      const hasLoggedOut = sessionStorage.getItem('user_logged_out');
      if (hasLoggedOut) {
        sessionStorage.removeItem('user_logged_out');
        setIsLoading(false);
        setIsProcessingLogin(false);
        return;
      }
      
      try {
        const result = await instance.acquireTokenSilent({
          scopes: [...LOGIN_SCOPES],
          account: accounts[0],
        });
        await completeLoginWithToken(result.accessToken, result.idToken);
      } catch (silentErr) {
        setIsLoading(false);
        setIsProcessingLogin(false);
      }
    };
    acquireAndProceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts?.[0]?.homeAccountId]);

  // Storage event listener removed for security

  // Animation elements for the background
  const circles = Array.from({ length: 6 }, (_, i) => i);
  
  // Show a full-screen loading state during SSO attempt to prevent
  // the login button from flashing before SSO completes (zero-flicker UX)
  const showingSsoLoader = isSsoAttempting && !loginClicked;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-hr-primary/10 to-hr-secondary/5 dark:from-slate-900 dark:to-slate-800 py-4">
      {/* Background Animation Elements */}
      <div className="absolute inset-0 z-0 opacity-50">
        {circles.map((i) => (
          <div
            key={i}
            className={`absolute rounded-full bg-gradient-hr-primary opacity-${20 + i * 10} animate-float animation-delay-${i * 200}`}
            style={{
              width: `${50 + i * 40}px`,
              height: `${50 + i * 40}px`,
              top: `${10 + (i % 3) * 30}%`,
              left: `${5 + (i % 4) * 25}%`,
            }}
          />
        ))}
      </div>
      
      {/* Mode Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>
      
      {/* Main Content - Split into two columns */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Right side - Video container */}
          <div className="hidden lg:flex items-center justify-center rounded-xl glass-effect p-8 relative overflow-hidden dark:bg-gray-800/30 h-[600px] min-h-[500px]">
            {/* Intro Video - Always playing until login */}
            <video 
              ref={introVideoRef}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover absolute inset-0"
              style={{ display: loginClicked ? 'none' : 'block' }}
              onError={() => {
                console.error('Intro video failed to load');
              }}
            >
              {INTRO_VIDEO_SOURCES.map((src) =>
                createElement("source", { key: src, src, type: "video/mp4" })
              )}
              Your browser does not support the video tag.
            </video>
            
            {/* Login Success Video - Plays after clicking login */}
            <video 
              ref={loginVideoRef}
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover absolute inset-0"
              style={{ display: 'none' }}
              onError={() => {
                console.error('After login video failed to load');
              }}
            >
              {LOGIN_SUCCESS_VIDEO_SOURCES.map((src) =>
                createElement("source", { key: src, src, type: "video/mp4" })
              )}
              Your browser does not support the video tag.
            </video>
          </div>
          
          {/* Left side - SSO login */}
          <div className="flex flex-col justify-center min-h-[500px]">
            <div className="mb-10 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-gradient-primary dark:text-white">ZENITH</h1>
              <p className="mt-2 text-sm text-muted-foreground">InfoServices HR Management System</p>
            </div>
            
            <div className="glass-effect rounded-xl p-6 sm:p-8 dark:bg-gray-800/30 dark:border-gray-700/30">
              <div className="space-y-6">
                {showingSsoLoader ? (
                  /* SSO in progress — show a spinner instead of the login button */
                  <div className="flex flex-col items-center justify-center py-4 space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Signing you in automatically...
                    </p>
                  </div>
                ) : (
                  <Button 
                    type="button" 
                    className="w-full bg-gradient-hr-primary hover:opacity-90" 
                    size="lg"
                    onClick={handleLogin}
                    disabled={isLoading || isProcessingLogin || loginClicked}
                  >
                    {(isLoading || isProcessingLogin) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : loginClicked ? (
                      "Signed In"
                    ) : (
                      "Sign in with Microsoft"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
