import { useState, useEffect, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { AdminPerformanceView } from "@/components/performance/AdminPerformanceView";
import { ManagerPerformanceView } from "@/components/performance/ManagerPerformanceView";
import { UserPerformanceView } from "@/components/performance/UserPerformanceView";
import { Button } from "@/components/ui/button";
import { UserCheck, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/utils/auth-utils";
import { useAuth } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/config/api";
import { getCachedViewMode } from "@/hooks/use-performance-preload";

type ViewMode = 'admin' | 'manager' | 'user';

// Cache for check-team-members API result to prevent repeated calls
const viewModeCache = new Map<string, { viewMode: ViewMode; timestamp: number }>();
const VIEW_MODE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const pendingViewModeChecks = new Map<string, Promise<ViewMode>>();

export default function Performance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingViewMode, setIsLoadingViewMode] = useState(false);
  const hasCheckedViewMode = useRef(false);
  const previousPathname = useRef<string | null>(null);
  
  // Get view mode from URL params
  const urlViewMode = searchParams.get('view') as ViewMode | null;
  const [viewMode, setViewMode] = useState<ViewMode>(
    (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) ? urlViewMode : 'user'
  );
  
  // Only set activeModule to "Performance" when not in admin view
  // Admin view should not highlight the Performance sidebar item
  const activeModule = viewMode === 'admin' ? '' : 'Performance';
  
  // Check team members and set view mode if no URL param is provided
  // OPTIMIZED: Always use preload cache first, never make API call if cache exists
  useEffect(() => {
    const checkTeamMembersAndSetView = async () => {
      // If view is explicitly set in URL, use it (no API call needed)
      if (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) {
        setViewMode(urlViewMode);
        hasCheckedViewMode.current = true;
        return;
      }
      
      // If no view param, check cache first, then API to determine view mode
      if (!user?.email) {
        // Default to user view if no user
        setViewMode('user');
        hasCheckedViewMode.current = true;
        return;
      }
      
      // PRIORITY 1: Check preload cache first (from use-performance-preload hook)
      // This cache is populated during login, so it should always be available
      const cachedViewMode = getCachedViewMode(user.email);
      if (cachedViewMode && ['admin', 'manager', 'user'].includes(cachedViewMode)) {
        console.log('📦 Using cached view mode from preload (NO API CALL):', cachedViewMode);
        setViewMode(cachedViewMode);
        // Update URL to reflect the cached view mode
        setSearchParams({ view: cachedViewMode }, { replace: true });
        hasCheckedViewMode.current = true;
        // Also update in-memory cache for consistency
        viewModeCache.set(user.email, { viewMode: cachedViewMode, timestamp: Date.now() });
        return;
      }
      
      
      // PRIORITY 2: Check in-memory cache (from previous API calls in this session)
      const cached = viewModeCache.get(user.email);
      const now = Date.now();
      if (cached && (now - cached.timestamp < VIEW_MODE_CACHE_TTL)) {
        console.log('📦 Using cached view mode from session (NO API CALL):', cached.viewMode);
        setViewMode(cached.viewMode);
        setSearchParams({ view: cached.viewMode }, { replace: true });
        hasCheckedViewMode.current = true;
        return;
      }
      
      // PRIORITY 3: Check if there's already a pending request for this user
      const pendingCheck = pendingViewModeChecks.get(user.email);
      if (pendingCheck) {
        console.log('⏳ Waiting for pending view mode check...');
        try {
          const result = await pendingCheck;
          setViewMode(result);
          setSearchParams({ view: result }, { replace: true });
          hasCheckedViewMode.current = true;
        } catch {
          setViewMode('user');
          hasCheckedViewMode.current = true;
        }
        return;
      }
      
      // LAST RESORT: Only fetch from API if cache is completely unavailable
      // This should rarely happen if preload is working correctly
      console.warn('⚠️ No cached view mode found, making API call (should be rare)');
      const checkPromise = (async (): Promise<ViewMode> => {
        try {
          setIsLoadingViewMode(true);
          const response = await authenticatedFetch(`${API_BASE_URL}/employees/check-team-members`);
          
          if (!response.ok) {
            console.error('Failed to check team members:', response.status);
            return 'user'; // Default to user view on error
          }
          
          const data = await response.json();
          const suggestedView = data.view_mode as ViewMode;
          
          if (suggestedView && ['admin', 'manager', 'user'].includes(suggestedView)) {
            // Cache the result in both caches
            viewModeCache.set(user.email, { viewMode: suggestedView, timestamp: now });
            return suggestedView;
          } else {
            return 'user';
          }
        } catch (error) {
          console.error('Error checking team members:', error);
          return 'user'; // Default to user view on error
        } finally {
          setIsLoadingViewMode(false);
          pendingViewModeChecks.delete(user.email);
        }
      })();
      
      pendingViewModeChecks.set(user.email, checkPromise);
      
      try {
        const result = await checkPromise;
        setViewMode(result);
        setSearchParams({ view: result }, { replace: true });
      } catch {
        setViewMode('user');
      } finally {
        hasCheckedViewMode.current = true;
      }
    };
    
    // Check when URL param changes or when component mounts
    if (!hasCheckedViewMode.current) {
      checkTeamMembersAndSetView();
    }
  }, [user?.email, urlViewMode, setSearchParams]);
  
  // Reset hasCheckedViewMode when navigating to /performance without view param
  // This handles the case when clicking Performance link from sidebar while on /performance?view=admin
  useEffect(() => {
    const currentSearch = location.search;
    const previousSearch = previousPathname.current?.split('?')[1] || '';
    const hadViewParam = previousSearch.includes('view=');
    const hasViewParam = searchParams.has('view');
    
    // If we navigated from a URL with view param to one without, reset the flag
    if (hadViewParam && !hasViewParam && location.pathname === '/performance') {
      console.log('🔄 View param removed, resetting view mode check');
      hasCheckedViewMode.current = false;
      
      // Trigger the existing check function
      if (user?.email) {
        const cachedViewMode = getCachedViewMode(user.email);
        if (cachedViewMode && ['admin', 'manager', 'user'].includes(cachedViewMode)) {
          console.log('📦 Using cached view mode after param removal:', cachedViewMode);
          setViewMode(cachedViewMode);
          setSearchParams({ view: cachedViewMode }, { replace: true });
          hasCheckedViewMode.current = true;
          return;
        }
        
        const cached = viewModeCache.get(user.email);
        const now = Date.now();
        if (cached && (now - cached.timestamp < VIEW_MODE_CACHE_TTL)) {
          console.log('📦 Using session cached view mode after param removal:', cached.viewMode);
          setViewMode(cached.viewMode);
          setSearchParams({ view: cached.viewMode }, { replace: true });
          hasCheckedViewMode.current = true;
          return;
        }
        
        // Make API call if needed
        const checkPromise = (async (): Promise<ViewMode> => {
          try {
            setIsLoadingViewMode(true);
            const response = await authenticatedFetch(`${API_BASE_URL}/employees/check-team-members`);
            if (!response.ok) {
              return 'user';
            }
            const data = await response.json();
            const suggestedView = data.view_mode as ViewMode;
            if (suggestedView && ['admin', 'manager', 'user'].includes(suggestedView)) {
              viewModeCache.set(user.email, { viewMode: suggestedView, timestamp: Date.now() });
              return suggestedView;
            }
            return 'user';
          } catch (error) {
            console.error('Error checking team members:', error);
            return 'user';
          } finally {
            setIsLoadingViewMode(false);
          }
        })();
        
        checkPromise.then(result => {
          setViewMode(result);
          setSearchParams({ view: result }, { replace: true });
          hasCheckedViewMode.current = true;
        });
      } else {
        setViewMode('user');
        hasCheckedViewMode.current = true;
      }
    }
    
    previousPathname.current = location.pathname + location.search;
  }, [location.pathname, location.search, searchParams, user?.email, setSearchParams]);
  
  // Update view mode when URL params change (manual selection)
  useEffect(() => {
    if (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) {
      setViewMode(urlViewMode);
      hasCheckedViewMode.current = true; // Mark as checked when explicitly set via URL
    }
  }, [urlViewMode]);
  
  // Update URL when view mode changes
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setSearchParams({ view: mode });
  };
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
  const getPerformanceView = () => {
    switch (viewMode) {
      case 'admin':
        return <AdminPerformanceView />;
      case 'manager':
        return <ManagerPerformanceView />;
      case 'user':
        return <UserPerformanceView />;
      default:
        return <AdminPerformanceView />;
    }
  };

  const getDescription = () => {
    switch (viewMode) {
      case 'admin':
        return "Manage all employee goals, track performance across the organization, and drive growth with AI-powered insights";
      case 'manager':
        return "Set goals for your team members, track their progress, and view goals set for you";
      case 'user':
        return "Track your performance, achieve goals, and visualize your growth journey";
      default:
        return "Manage all employee goals, track performance across the organization, and drive growth with AI-powered insights";
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header onMenuToggle={toggleSidebar} />
      
      {/* Main Layout */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Always Fixed */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-56 sidebar-glass transform transition-transform duration-300 ease-in-out flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}>
          <SidebarContent 
            activeModule={activeModule} 
          />
        </aside>
        
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Main Content - Account for fixed sidebar and header */}
        <main className="flex-1 transition-all duration-300 lg:ml-60 pt-16">
          <div className="container px-6 py-8">
            {/* Welcome Section - Hidden for Admin View */}
            {viewMode !== 'admin' && (
              <section className="mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                  Performance Management
                </h1>
                {/* <p className="text-muted-foreground mb-6">
                  {getDescription()}
                </p> */}
                
                {/* View Mode Selector Buttons - temporarily hidden per UX request */}
                {/* <div className="flex gap-3 mb-6">
                  ...
                </div> */}
              </section>
            )}
            
            {/* Conditional Rendering based on selected view */}
            {getPerformanceView()}
          </div>
        </main>
      </div>
    </div>
  );
}
