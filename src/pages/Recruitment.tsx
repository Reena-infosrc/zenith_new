import { useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { RecruitmentOverview } from "@/components/recruitment/RecruitmentOverview";
import { RecruitmentDetailPanel } from "@/components/recruitment/RecruitmentDetailPanel";

export default function Recruitment() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Recruitment");
  const [activeSection, setActiveSection] = useState<string>("job-requisition");
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
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
        
        {/* Main Content - Account for fixed sidebar and header */}
        <main className="flex-1 transition-all duration-300 lg:ml-56 pt-16">
          <div className="container px-4 py-6">
            {/* Welcome Section */}
            <section className="mb-8">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-white mr-3">
                  <span className="text-lg font-bold">R</span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold mb-1">RecruitAI</h1>
                  <p className="text-muted-foreground">AI-powered recruitment platform</p>
                </div>
              </div>
            </section>
            
            {/* Overview Cards */}
            <RecruitmentOverview onSectionChange={setActiveSection} />
            
            {/* Detail Panel */}
            <RecruitmentDetailPanel activeSection={activeSection} />
          </div>
        </main>
      </div>
    </div>
  );
}
