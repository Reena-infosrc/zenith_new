import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { Button } from "@/components/ui/button";
import {
  ClientRMFeedbackTab,
  type ClientRmPrefetchedMeContext,
  type Period,
} from "@/components/performance/ClientRMFeedbackTab";
import { ClientRmFeedbackSessionChrome } from "@/components/performance/ClientRmFeedbackSessionChrome";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { parseSessionFromHint, resolveSessionBackHref } from "@/lib/client-rm-feedback-routes";
import { Loader2 } from "lucide-react";

type MeContext = {
  employee_id?: string;
  employee_name?: string;
  has_team_members?: boolean;
  team_count?: number;
  is_leadership?: boolean;
  is_admin?: boolean;
  can_view_all?: boolean;
  reportees?: { id: string; name?: string; employee_id?: string }[];
};

/**
 * Dedicated page for submitting Monthly feedback for one direct report.
 * Opened from Performance → My Team → Monthly feedback on a team member card.
 */
export default function MonthlyRmFeedbackSession() {
  const [searchParams] = useSearchParams();
  const reporteeId = searchParams.get("reporteeId")?.trim() ?? "";
  const fromHint = parseSessionFromHint(searchParams.get("from"));
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<MeContext | null>(null);
  /** Loaded in parallel with `me-context` so the feedback tab only needs submissions (manager path). */
  const [sessionPeriods, setSessionPeriods] = useState<Period[] | null>(null);
  /** Session page shows one loader until Monthly feedback tab finishes its initial load (avoids back-to-back spinners). */
  const [feedbackFormReady, setFeedbackFormReady] = useState(false);

  const goBackPrimary = useCallback(() => {
    navigate(resolveSessionBackHref(fromHint));
  }, [navigate, fromHint]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [ctxRes, periodsRes] = await Promise.all([
          authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`),
          authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods`),
        ]);
        const [ctxData, periodsData] = await Promise.all([
          ctxRes.ok ? ctxRes.json() : Promise.resolve(null),
          periodsRes.ok ? periodsRes.json() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setCtx(ctxData);
        setSessionPeriods(Array.isArray(periodsData) ? periodsData : []);
      } catch {
        if (!cancelled) {
          setCtx(null);
          setSessionPeriods(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFeedbackFormReady(false);
  }, [reporteeId]);

  const validation = useMemo(() => {
    if (!ctx?.employee_id || !reporteeId) {
      return { ok: false as const, reason: "missing" as const };
    }
    const inRoster = (ctx.reportees ?? []).some((r) => r.id === reporteeId);
    if (!inRoster) {
      return { ok: false as const, reason: "not_report" as const };
    }
    const canSubmit = Boolean(ctx.has_team_members) && !ctx.is_leadership;
    if (!canSubmit) {
      return { ok: false as const, reason: "no_submit_role" as const };
    }
    return { ok: true as const };
  }, [ctx, reporteeId]);

  const reporteeName = useMemo(() => {
    if (!reporteeId || !ctx?.reportees?.length) return null;
    const r = ctx.reportees.find((x) => x.id === reporteeId);
    return r?.name?.trim() || null;
  }, [ctx?.reportees, reporteeId]);

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
          <div className="fixed inset-0 bg-black/20 z-10 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 transition-all duration-300 lg:ml-60 pt-16">
          <div className="container px-6 py-8 max-w-5xl">
            {loading ? (
              <div className="space-y-8">
                <ClientRmFeedbackSessionChrome
                  fromHint={fromHint}
                  reporteeName={null}
                  onPrimaryBack={goBackPrimary}
                />
                <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground rounded-lg border border-dashed">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Loading feedback form…
                </div>
              </div>
            ) : !reporteeId ? (
              <div className="space-y-6">
                <ClientRmFeedbackSessionChrome
                  fromHint={fromHint}
                  reporteeName={null}
                  onPrimaryBack={goBackPrimary}
                />
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <p>No employee selected.</p>
                  <p className="mt-2">
                    Open this page from Performance → My Team using &quot;Monthly feedback&quot; on a team member
                    card.
                  </p>
                  <Button className="mt-4" variant="secondary" onClick={goBackPrimary}>
                    {fromHint === "reports" ? "Back to reports" : "Go to Performance"}
                  </Button>
                </div>
              </div>
            ) : !ctx?.employee_id ? (
              <div className="rounded-lg border border-destructive/30 p-8 text-sm text-muted-foreground">
                Your employee profile could not be loaded. Ensure your account is linked in the directory.
              </div>
            ) : validation.reason === "not_report" ? (
              <div className="space-y-6">
                <ClientRmFeedbackSessionChrome
                  fromHint={fromHint}
                  reporteeName={reporteeName}
                  onPrimaryBack={goBackPrimary}
                />
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-8 text-sm">
                  <p className="font-medium text-foreground">This person is not in your direct reports.</p>
                  <p className="text-muted-foreground mt-2">
                    Monthly feedback can only be submitted for employees who report to you in the org chart.
                  </p>
                  <Button className="mt-4" variant="outline" onClick={goBackPrimary}>
                    Return to Performance
                  </Button>
                </div>
              </div>
            ) : validation.reason === "no_submit_role" ? (
              <div className="space-y-6">
                <ClientRmFeedbackSessionChrome
                  fromHint={fromHint}
                  reporteeName={reporteeName}
                  onPrimaryBack={goBackPrimary}
                />
                <div className="rounded-lg border border-border p-8 text-sm">
                  <p className="font-medium text-foreground">This workspace is for line managers submitting for their team.</p>
                  <p className="text-muted-foreground mt-2">
                    {ctx?.is_leadership
                      ? "Use Monthly feedback in the header for organization-wide visibility. Line managers submit from Performance → My Team."
                      : "You need an active manager role with direct reports to submit here."}
                  </p>
                  <div className="mt-4">
                    <Button variant="outline" onClick={goBackPrimary}>
                      Return to Performance
                    </Button>
                  </div>
                </div>
              </div>
            ) : validation.ok && ctx.employee_id ? (
              <div className="space-y-8">
                <ClientRmFeedbackSessionChrome
                  fromHint={fromHint}
                  reporteeName={reporteeName}
                  onPrimaryBack={goBackPrimary}
                />
                {!feedbackFormReady ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground rounded-lg border border-dashed">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Loading feedback form…
                  </div>
                ) : null}
                <ClientRMFeedbackTab
                  key={`crm-session-${reporteeId}`}
                  currentEmployeeId={ctx.employee_id}
                  initialReporteeId={reporteeId}
                  clientRmSurface="team-submit"
                  suppressInitialLoadingUI
                  onInitialLoadComplete={() => setFeedbackFormReady(true)}
                  prefetchedMeContext={ctx as ClientRmPrefetchedMeContext}
                  prefetchedPeriods={sessionPeriods}
                />
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
