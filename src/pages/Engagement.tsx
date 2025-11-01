import { useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Trophy, Zap, BookOpen, Megaphone, Lightbulb } from "lucide-react";
import { GameSection } from "@/components/engagement/GameSection";
import { SurveySection } from "@/components/engagement/SurveySection";
import { CodeChallengeSection } from "@/components/engagement/CodeChallengeSection";

export default function Engagement() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Engagement");
  
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
        <main className="flex-1 transition-all duration-300 lg:ml-64 pt-16">
          <div className="container px-6 py-8">
            {/* Welcome Section */}
            <section className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                Employee Engagement
              </h1>
              <p className="text-muted-foreground">Drive employee engagement with interactive activities and recognition</p>
            </section>
            
            {/* Engagement Tabs */}
            <Tabs defaultValue="games" className="w-full">
              <TabsList className="mb-8 flex flex-wrap h-auto">
                <TabsTrigger value="games" className="h-10">
                  <Trophy className="w-4 h-4 mr-2" />
                  Games & Challenges
                </TabsTrigger>
                <TabsTrigger value="challenges" className="h-10">
                  <Zap className="w-4 h-4 mr-2" />
                  Code Challenges
                </TabsTrigger>
                <TabsTrigger value="surveys" className="h-10">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Surveys
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="games">
                <GameSection />
              </TabsContent>
              
              <TabsContent value="challenges">
                <CodeChallengeSection />
              </TabsContent>
              
              <TabsContent value="surveys">
                <SurveySection />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
