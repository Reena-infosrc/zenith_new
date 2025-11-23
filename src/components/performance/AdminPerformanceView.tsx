import { useRef } from "react";
import { 
  Calendar,
  CheckCircle,
  BarChart3
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminReviewCycles } from "./AdminReviewCycles";
import { ManagerSignOff } from "./ManagerSignOff";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";

export function AdminPerformanceView() {
  const moduleRef = useRef<HTMLDivElement>(null);
  const { preserveScroll } = usePreserveScroll();


  const handleTabClick = () => {
    if (moduleRef.current) {
      const moduleTop = moduleRef.current.getBoundingClientRect().top + window.scrollY;
      const currentScroll = window.scrollY;
      const targetScroll = moduleTop - 64; // Account for header height (top-16 = 64px)
      
      // Only scroll if we're not already at the top of the module
      // Check if we're more than 50px away from the target position
      if (Math.abs(currentScroll - targetScroll) > 50) {
        // First time clicking - scroll to top smoothly
        window.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }
      // If already at top (within 50px), do nothing - no scroll needed
    }
  };

  return (
    <div ref={moduleRef} className="space-y-6" data-performance-module>
      <Tabs defaultValue="dashboard" className="space-y-4" onValueChange={() => {
        preserveScroll();
      }}>
        <TabsList className="sticky top-16 z-40 bg-muted/50 backdrop-blur-sm flex-wrap">
          <TabsTrigger value="dashboard" onClick={handleTabClick}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="cycles" onClick={handleTabClick}>
            <Calendar className="h-4 w-4 mr-2" />
            Cycles
          </TabsTrigger>
          <TabsTrigger value="signoff" onClick={handleTabClick}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Sign-Off
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <PerformanceDashboard />
        </TabsContent>

        <TabsContent value="cycles" className="space-y-4">
          <AdminReviewCycles />
        </TabsContent>

        <TabsContent value="signoff" className="space-y-4">
          <ManagerSignOff />
        </TabsContent>
      </Tabs>
    </div>
  );
}

