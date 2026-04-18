import { useEffect, useRef, useState } from "react";
import { 
  Calendar,
  CheckCircle,
  BarChart3,
  MessageSquare
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminReviewCycles } from "./AdminReviewCycles";
import { ManagerSignOff } from "./ManagerSignOff";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { MonthlyFeedbackManagement } from "./MonthlyFeedbackManagement";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";

export function AdminPerformanceView() {
  const moduleRef = useRef<HTMLDivElement>(null);
  const { preserveScroll } = usePreserveScroll();
  const [isLeadership, setIsLeadership] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "cycles" | "signoff" | "monthly-feedback">("dashboard");
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`);
        if (res.ok) {
          const data = await res.json();
          const leadership = Boolean(data?.is_leadership) && !Boolean(data?.is_admin);
          setIsLeadership(leadership);
          // CRITICAL: Tabs defaultValue won't update after async role detection.
          // Keep tabs controlled and force leadership into monthly feedback.
          setActiveTab(leadership ? "monthly-feedback" : "dashboard");
        }
      } catch {
        // keep resilient
      } finally {
        // Prevent leadership users from briefly seeing admin tabs during initial render.
        setRoleLoaded(true);
      }
    };
    loadRole();
  }, []);


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
      {!roleLoaded ? (
        <div className="py-10 text-sm text-muted-foreground">Loading performance module…</div>
      ) : (
      <Tabs
        value={activeTab}
        className="space-y-4"
        onValueChange={(v) => {
          preserveScroll();
          // Prevent leadership from switching to hidden tabs via stale state.
          if (isLeadership && v !== "monthly-feedback") return;
          setActiveTab(v as any);
        }}
      >
        <TabsList className="sticky top-16 z-40 bg-muted/50 backdrop-blur-sm flex-wrap">
          {!isLeadership && (
            <>
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
            </>
          )}
          <TabsTrigger value="monthly-feedback" onClick={handleTabClick}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Monthly feedback
          </TabsTrigger>
        </TabsList>

        {!isLeadership && (
          <>
            <TabsContent value="dashboard" className="space-y-4">
              <PerformanceDashboard />
            </TabsContent>

            <TabsContent value="cycles" className="space-y-4">
              <AdminReviewCycles />
            </TabsContent>

            <TabsContent value="signoff" className="space-y-4">
              <ManagerSignOff />
            </TabsContent>
          </>
        )}

        <TabsContent value="monthly-feedback" className="space-y-4">
          <MonthlyFeedbackManagement />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}

