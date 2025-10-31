import { useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { AdminPerformanceView } from "@/components/performance/AdminPerformanceView";
import { UserPerformanceView } from "@/components/performance/UserPerformanceView";
import { useAuth } from "@/hooks/use-auth";

export default function Performance() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Performance");
  const { isAdmin } = useAuth();
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
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
              <p className="text-muted-foreground">
                {isAdmin 
                  ? "Manage employee goals, track performance, and drive growth with AI-powered insights"
                  : "Track your performance, achieve goals, and visualize your growth journey"
                }
              </p>
            </section>
            
            {/* Conditional Rendering based on User Role */}
            {isAdmin ? <AdminPerformanceView /> : <UserPerformanceView />}
          </div>
        </main>
      </div>
    </div>
  );
}
