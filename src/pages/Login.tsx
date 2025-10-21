import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { getFirstAvailableModuleRoute } from "@/utils/navigation";
import { useMsal } from "@azure/msal-react";
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";
import { Loader2 } from "lucide-react";
import { Employee } from "@/hooks/use-employees";

export default function Login() {
  const [loginClicked, setLoginClicked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false); // New state to track login processing
  const navigate = useNavigate();
  const { featureFlagStatus, isLoading: flagsLoading } = useFeatureFlags();
  const { instance, accounts } = useMsal();
  
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const loginVideoRef = useRef<HTMLVideoElement>(null);
  
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

  const completeLoginWithToken = async (accessToken: string, clearTimeout?: () => void) => {
    // Clear the loading timeout if provided
    if (clearTimeout) {
      clearTimeout();
    }
    
    // Set processing state to maintain loading UI during API calls
    setIsProcessingLogin(true);
    
    // Fetch user profile from Microsoft Graph
    const graphRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!graphRes.ok) {
      setIsProcessingLogin(false);
      throw new Error("Failed to fetch profile from Microsoft Graph");
    }
    const profile = await graphRes.json();

    // Exchange MSAL token for backend token
    try {
      
      const backendRes = await fetch("https://zenith-hr-api.apps.infoservices.com/api/auth/msal-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ msal_token: accessToken }),
      });
      
      
      if (backendRes.ok) {
        const tokenData = await backendRes.json();
        
        // Store the backend token instead of MSAL token
        localStorage.setItem('auth_token', tokenData.access_token);
        
        // Verify the token was stored correctly
        const storedToken = localStorage.getItem('auth_token');
      } else {
        const errorText = await backendRes.text();
        console.error("Failed to get backend token:", backendRes.status, errorText);
        // Fallback: store MSAL token (will cause 401 errors)
        localStorage.setItem('auth_token', accessToken);
      }
    } catch (error) {
      console.error("Error exchanging MSAL token:", error);
      // Fallback: store MSAL token (will cause 401 errors)
      localStorage.setItem('auth_token', accessToken);
    }

    // Wait a moment to ensure token is stored before proceeding
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify token is still stored after the delay
    const finalToken = localStorage.getItem('auth_token');

    // Pre-fetch critical APIs BEFORE navigation to ensure data is available
    const preFetchAPIs = async () => {
      // Clear cache to ensure fresh data
      apiCache.clear();
      
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Create parallel API calls
      const apiCalls = [
        // Feature Flags API
        fetch('https://zenith-hr-api.apps.infoservices.com/api/feature-flags/', { headers })
          .then(async response => {
            if (response.ok) {
              const data = await response.json();
              apiCache.set(CACHE_KEYS.FEATURE_FLAGS, data, 10 * 60 * 1000); // Cache for 10 minutes
              return data;
            } else {
              console.warn("⚠️ Feature Flags API pre-fetch failed:", response.status);
              return null;
            }
          })
          .catch(error => {
            console.warn("⚠️ Feature Flags API pre-fetch error:", error);
            return null;
          }),

        // Employees API
        fetch('https://zenith-hr-api.apps.infoservices.com/api/employees', { headers })
          .then(async response => {
            if (response.ok) {
              const data = await response.json();
              console.log("🔍 Pre-fetch Employees API response:", {
                length: data.length,
                firstEmployee: data[0] ? {
                  id: data[0].id,
                  employee_id: data[0].employee_id,
                  name: data[0].name,
                  date_of_birth: data[0].date_of_birth,
                  date_of_joining: data[0].date_of_joining,
                  experience_years: data[0].experience_years
                } : null
              });
              
              // Transform the data the same way useEmployees does
              const transformedData = data.map((emp: Record<string, unknown>) => ({
                id: emp.id || "temp-" + Math.random().toString(36).substr(2, 9),
                employeeId: emp.employee_id || "",
                name: emp.name || "Unknown",
                position: emp.position || "Not specified",
                department: emp.department || "Not specified",
                photoUrl: emp.photo_url || "",
                email: emp.email || "",
                phone: emp.phone || "",
                mobile: emp.mobile || "",
                bio: emp.bio || "",
                startDate: emp.start_date || "",
                manager: emp.reporting_to || "",
                reporting_to: emp.reporting_to || "",
                skills: emp.skills || [],
                expertise: emp.expertise || "",
                experienceYears: emp.experience_years !== null ? emp.experience_years : undefined,
                location: emp.location || "",
                dateOfBirth: emp.date_of_birth || "",
                dateOfJoining: emp.date_of_joining || "",
                gender: emp.gender || ""
              }));
              
              console.log("🔍 Transformed Employees data:", {
                                length: transformedData.length,
                firstEmployee: transformedData[0] ? {
                  id: transformedData[0].id,
                  employeeId: transformedData[0].employeeId,
                  name: transformedData[0].name,
                  dateOfBirth: transformedData[0].dateOfBirth,
                  dateOfJoining: transformedData[0].dateOfJoining,
                  experienceYears: transformedData[0].experienceYears
                } : null
              });
              
              // Cache the transformed data
              apiCache.set(CACHE_KEYS.EMPLOYEES, transformedData, 5 * 60 * 1000);
              return transformedData;
            } else {
              console.warn("⚠️ Employees API pre-fetch failed:", response.status);
              return null;
            }
          })
          .catch(error => {
            console.warn("⚠️ Employees API pre-fetch error:", error);
            return null;
          }),

        // Dashboard API
        fetch('https://zenith-hr-api.apps.infoservices.com/api/employees-dashboard/', { headers })
          .then(async response => {
            if (response.ok) {
              const data = await response.json();
              apiCache.set(CACHE_KEYS.DASHBOARD, data, 5 * 60 * 1000); // Cache for 5 minutes
              return data;
            } else {
              console.warn("⚠️ Dashboard API pre-fetch failed:", response.status);
              return null;
            }
          })
          .catch(error => {
            console.warn("⚠️ Dashboard API pre-fetch error:", error);
            return null;
          })
      ];

      // Wait for all API calls to complete (or fail gracefully)
      try {
        const results = await Promise.allSettled(apiCalls);
        console.log("🚀 Pre-fetch API Results:", {
                    featureFlags: results[0].status === 'fulfilled' ? '✅' : '❌',
          employees: results[1].status === 'fulfilled' ? '✅' : '❌',
          dashboard: results[2].status === 'fulfilled' ? '✅' : '❌'
        });
        return results;
      } catch (error) {
        console.warn("⚠️ Some API pre-fetch calls failed:", error);
        return null;
      }
    };

    // Wait for API pre-fetching to complete before proceeding
    await preFetchAPIs();

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
        await completeLoginWithToken(loginResponse.accessToken, () => clearTimeout(loadingTimeout));
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
      if (!accounts || accounts.length === 0) {
        // Only reset loading state if we're not in the middle of a login process
        // This prevents flickering when accounts are initially empty during redirect
        if (!loginClicked && !isProcessingLogin) {
          setIsLoading(false);
        }
        return;
      }
      
      // Check if user explicitly logged out - if so, don't auto-login
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
        await completeLoginWithToken(result.accessToken);
      } catch (silentErr) {
        // If silent fails, let user click button again
        console.warn("Silent token acquisition failed:", silentErr);
        setIsLoading(false);
        setIsProcessingLogin(false);
      }
    };
    acquireAndProceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts?.[0]?.homeAccountId]);

  // Add storage event listener to track auth_token changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        console.log("🔑 Auth token changed:", {
        oldValue: e.oldValue ? e.oldValue.substring(0, 20) + "..." : null,
          newValue: e.newValue ? e.newValue.substring(0, 20) + "..." : null,
          url: e.url
        });
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
              {/* Public assets live under /public, accessible at /video/... */}
              <source src="/video/Start.mp4" type="video/mp4" />
              {/* Fallback variants for case/filename differences */}
              <source src="/video/Start Old.mp4" type="video/mp4" />
              <source src="/public/video/Start.mp4" type="video/mp4" />
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
              {/* Use unified public path with multiple filename casing fallbacks */}
              <source src="/video/After_login.mp4" type="video/mp4" />
              <source src="/video/After_Login.mp4" type="video/mp4" />
              <source src="/video/after_login.mp4" type="video/mp4" />
              <source src="/public/video/After_login.mp4" type="video/mp4" />
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
