import { useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { AdminPerformanceView } from "@/components/performance/AdminPerformanceView";
import { ManagerPerformanceView } from "@/components/performance/ManagerPerformanceView";
import { UserPerformanceView } from "@/components/performance/UserPerformanceView";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = 'admin' | 'manager' | 'user';

export default function Performance() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Performance");
  const [viewMode, setViewMode] = useState<ViewMode>('admin');
  
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
        {/* Left Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-20 w-64 sidebar-glass transform transition-transform duration-300 ease-in-out pt-16 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:z-0`}>
          <SidebarContent 
            activeModule={activeModule} 
            onModuleChange={setActiveModule} 
          />
        </aside>
        
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Main Content */}
        <main className="flex-1 transition-all duration-300">
          <div className="container px-6 py-8">
            {/* Welcome Section */}
            <section className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                Performance Management
              </h1>
              <p className="text-muted-foreground mb-6">
                {getDescription()}
              </p>
              
              {/* View Mode Selector Buttons */}
              <div className="flex gap-3 mb-6">
                <Button
                  variant={viewMode === 'admin' ? 'default' : 'outline'}
                  onClick={() => setViewMode('admin')}
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300",
                    viewMode === 'admin'
                      ? "bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                      : "hover:bg-muted"
                  )}
                >
                  <Users className="h-4 w-4" />
                  Admin View
                </Button>
                <Button
                  variant={viewMode === 'manager' ? 'default' : 'outline'}
                  onClick={() => setViewMode('manager')}
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300",
                    viewMode === 'manager'
                      ? "bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                      : "hover:bg-muted"
                  )}
                >
                  <UserCheck className="h-4 w-4" />
                  Manager View
                </Button>
                <Button
                  variant={viewMode === 'user' ? 'default' : 'outline'}
                  onClick={() => setViewMode('user')}
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300",
                    viewMode === 'user'
                      ? "bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                      : "hover:bg-muted"
                  )}
                >
                  <UserCircle className="h-4 w-4" />
                  User View
                </Button>
              </div>
            </section>
            
            {/* Conditional Rendering based on selected view */}
            {getPerformanceView()}
          </div>
        </main>
      </div>
    </div>
  );
}
