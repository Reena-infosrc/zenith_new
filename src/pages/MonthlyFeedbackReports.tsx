import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { MonthlyFeedbackManagement } from "@/components/performance/MonthlyFeedbackManagement";
import { MonthlyFeedbackReportsHub } from "@/components/performance/MonthlyFeedbackReportsHub";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";

type RoleState =
  | { status: "loading" }
  | { status: "authorized" }
  | { status: "unauthorized" };

export default function MonthlyFeedbackReports() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState<RoleState>({ status: "loading" });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`);
        if (!res.ok) {
          setRole({ status: "unauthorized" });
          return;
        }
        const data = await res.json();
        const isAdmin = Boolean(data?.is_admin);
        const isLeadership = Boolean(data?.is_leadership);
        setRole(isAdmin || isLeadership ? { status: "authorized" } : { status: "unauthorized" });
      } catch {
        setRole({ status: "unauthorized" });
      }
    };
    load();
  }, []);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuToggle={toggleSidebar} />

      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-56 sidebar-glass transform transition-transform duration-300 ease-in-out flex flex-col ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0`}
        >
          <SidebarContent activeModule="Performance" />
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/20 z-10 lg:hidden" onClick={toggleSidebar} />
        )}

        <main className="flex-1 transition-all duration-300 lg:ml-60 pt-16">
          <div className="container px-6 py-8 max-w-6xl">
            {role.status === "loading" ? (
              <div className="py-10 text-sm text-muted-foreground">Loading…</div>
            ) : role.status === "unauthorized" ? (
              <div className="py-10 text-sm text-muted-foreground">You don’t have access to this page.</div>
            ) : (
              <>
                <MonthlyFeedbackReportsHub />
                <MonthlyFeedbackManagement />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

