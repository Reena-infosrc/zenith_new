import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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

type ViewMode = 'admin' | 'manager' | 'user';

export default function Performance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingViewMode, setIsLoadingViewMode] = useState(false);
  
  // Get view mode from URL params
  const urlViewMode = searchParams.get('view') as ViewMode | null;
  const [viewMode, setViewMode] = useState<ViewMode>(
    (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) ? urlViewMode : 'user'
  );
  
  // Only set activeModule to "Performance" when not in admin view
  // Admin view should not highlight the Performance sidebar item
  const activeModule = viewMode === 'admin' ? '' : 'Performance';
  
  // Check team members and set view mode if no URL param is provided
  useEffect(() => {
    const checkTeamMembersAndSetView = async () => {
      // If view is explicitly set in URL, use it
      if (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) {
        setViewMode(urlViewMode);
        return;
      }
      
      // If no view param, check API to determine view mode
      if (!user?.email) {
        // Default to user view if no user
        setViewMode('user');
        return;
      }
      
      try {
        setIsLoadingViewMode(true);
        const response = await authenticatedFetch(`${API_BASE_URL}/employees/check-team-members`);
        
        if (!response.ok) {
          console.error('Failed to check team members:', response.status);
          setViewMode('user'); // Default to user view on error
          return;
        }
        
        const data = await response.json();
        const suggestedView = data.view_mode as ViewMode;
        
        if (suggestedView && ['admin', 'manager', 'user'].includes(suggestedView)) {
          setViewMode(suggestedView);
          // Update URL to reflect the determined view mode
          setSearchParams({ view: suggestedView }, { replace: true });
        } else {
          setViewMode('user');
        }
      } catch (error) {
        console.error('Error checking team members:', error);
        setViewMode('user'); // Default to user view on error
      } finally {
        setIsLoadingViewMode(false);
      }
    };
    
    checkTeamMembersAndSetView();
  }, [user?.email, urlViewMode, setSearchParams]);
  
  // Update view mode when URL params change (manual selection)
  useEffect(() => {
    if (urlViewMode && ['admin', 'manager', 'user'].includes(urlViewMode)) {
      setViewMode(urlViewMode);
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
        <aside className={`fixed inset-y-0 left-0 z-20 w-64 sidebar-glass transform transition-transform duration-300 ease-in-out pt-16 flex flex-col ${
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
        <main className="flex-1 transition-all duration-300 lg:ml-64 pt-16">
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
