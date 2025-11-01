
import { useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { LeaveOverview } from "@/components/leave/LeaveOverview";
import { LeaveCalendar } from "@/components/leave/LeaveCalendar";
import { LeaveApproval } from "@/components/leave/LeaveApproval";
import { LeaveHistory } from "@/components/leave/LeaveHistory";
import { LeaveAnalytics } from "@/components/leave/LeaveAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaveApplicationForm } from "@/components/leave/LeaveApplicationForm";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

export default function Leave() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showApplyForm, setShowApplyForm] = useState(false);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

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
          <SidebarContent />
        </aside>
        
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Main Content - Account for fixed sidebar and header */}
        <main className="flex-1 lg:ml-64 pt-16">
          <div className="container px-4 py-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-bold">Leave Management</h1>
                <p className="text-muted-foreground mt-1">Manage and track your time off easily</p>
              </div>
              {!showApplyForm && (
                <Button 
                  onClick={() => setShowApplyForm(true)}
                  className="bg-gradient-hr-primary"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Apply for Leave
                </Button>
              )}
            </div>

            {showApplyForm ? (
              <div className="mb-6">
                <LeaveApplicationForm onCancel={() => setShowApplyForm(false)} />
              </div>
            ) : (
              <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid grid-cols-5 w-full max-w-3xl">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar</TabsTrigger>
                  <TabsTrigger value="approval">Approvals</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-4">
                  <LeaveOverview />
                </TabsContent>
                
                <TabsContent value="calendar" className="space-y-4">
                  <LeaveCalendar />
                </TabsContent>
                
                <TabsContent value="approval" className="space-y-4">
                  <LeaveApproval />
                </TabsContent>
                
                <TabsContent value="history" className="space-y-4">
                  <LeaveHistory />
                </TabsContent>
                
                <TabsContent value="analytics" className="space-y-4">
                  <LeaveAnalytics />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
