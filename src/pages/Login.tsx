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
  const navigate = useNavigate();
  const { featureFlagStatus, isLoading: flagsLoading } = useFeatureFlags();
  const { instance, accounts } = useMsal();
  
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const loginVideoRef = useRef<HTMLVideoElement>(null);
  const loginCompletedRef = useRef(false);
  
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
    localStorage.removeItem('auth_token');
    
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
        
        // Store the backend token instead of MSAL token
        localStorage.setItem('auth_token', tokenData.access_token);
        
        // Token stored successfully
      } else {
        const errorText = await backendRes.text();
        localStorage.removeItem('auth_token');
        loginCompletedRef.current = false;
        setIsProcessingLogin(false);
        alert('Authentication failed. Please try again.');
        return;
      }
    } catch (error) {
      localStorage.removeItem('auth_token');
      loginCompletedRef.current = false;
      setIsProcessingLogin(false);
      alert('Authentication failed. Please try again.');
      return;
    }

    // Wait a moment to ensure token is stored before proceeding
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify token is still stored after the delay
    const finalToken = localStorage.getItem('auth_token');

    // Pre-fetch only feature-flags (tiny, fast) so the router knows which
    // modules are enabled. Employees + dashboard are heavy (full table scan +
    // KMS decrypt) — let the destination page load them; blocking login on
    // those caused a 3-min wait.
    const preFetchFlags = async () => {
      apiCache.clear();
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

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
      await instance.loginRedirect({ scopes: ["User.Read"] });
      // Flow continues after redirect back
    } catch (err: unknown) {
      clearTimeout(loadingTimeout);
      // Fallback to popup if redirect fails for some reason
      try {
        const loginResponse = await instance.loginPopup({ scopes: ["User.Read"] });
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

  // After redirect, if we have an account, acquire token silently and continue
  useEffect(() => {
    const acquireAndProceed = async () => {
      // Already completed or in progress — skip
      if (loginCompletedRef.current) return;

      if (!accounts || accounts.length === 0) {
        if (!loginClicked && !isProcessingLogin) {
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
          scopes: ["User.Read"],
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
