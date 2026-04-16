import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useEmployees } from "@/hooks/use-employees";
import { Loader2, Pencil, Star, ExternalLink, Users, Network } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type Period = {
  period_id: string;
  label: string;
  start_date: string;
  end_date: string;
  period_status: "draft" | "open" | "closed";
};

type Reportee = {
  id: string;
  name: string;
  employee_id?: string;
};

type FeedbackSubmission = {
  id: string;
  period_id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  manager_name: string;
  manager_email?: string;
  billing_status: string;
  client_name: string;
  project_name: string;
  client_reporting_manager_name?: string;
  info_services_reporting_manager_name?: string;
  additional_feedback?: string;
  ratings?: Record<string, number>;
  overall_satisfaction: number;
  started_at?: string;
  submitted_at?: string;
  updated_at?: string;
  /** Set when the reportee has opened the record (server). */
  reportee_seen?: boolean;
};

/** Industry-standard title aligned to the original Info Services form. */
const FORM_TITLE = "Client & Delivery Manager Performance Feedback";

const RATING_FIELDS: { key: string; label: string; legacyKey?: string }[] = [
  { key: "quality_of_deliverables", label: "Quality of Deliverables" },
  { key: "adherence_to_deadlines", label: "Adherence to Deadlines" },
  { key: "technical_competency", label: "Technical Competency" },
  { key: "problem_solving_skills", label: "Problem-Solving Skills" },
  { key: "productivity_efficiency", label: "Productivity & Efficiency" },
  { key: "accuracy_attention_to_detail", label: "Accuracy and Attention to Detail" },
  { key: "ability_to_work_independently", label: "Ability to Work Independently" },
  { key: "understanding_of_requirements", label: "Understanding of Requirements" },
  { key: "responsiveness_to_work_assignments", label: "Responsiveness to Work Assignments" },
  { key: "clarity_in_communication", label: "Clarity in Communication" },
  { key: "responsiveness_to_emails_calls", label: "Responsiveness to Emails/Calls" },
  {
    key: "understanding_of_requirements_2",
    label: "Understanding of Requirements (secondary)",
    legacyKey: "business_domain_understanding",
  },
  { key: "status_reporting_updates", label: "Status Reporting and Updates" },
  { key: "team_collaboration", label: "Team Collaboration" },
  { key: "participation_in_discussions", label: "Participation in Discussions" },
];

function pickRating(ratings: Record<string, number> | undefined, key: string, legacyKey?: string) {
  const r = ratings || {};
  if (typeof r[key] === "number") return r[key];
  if (legacyKey && typeof r[legacyKey] === "number") return r[legacyKey];
  return 0;
}

function billingLabel(v: string) {
  switch (v) {
    case "billable":
      return "Billable Resource";
    case "non_billable":
      return "Non-Billable Resource";
    case "internal":
      return "Internal Resource";
    default:
      return v;
  }
}

function StarsRead({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= v ? "fill-amber-400 text-amber-500" : "text-muted-foreground/25"
          )}
        />
      ))}
      <span className="text-xs font-medium text-muted-foreground ml-2">{v}/5</span>
    </div>
  );
}

function FieldShell({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm min-h-[2.5rem] flex items-center">{children}</div>
    </div>
  );
}

type Props = {
  currentEmployeeId?: string | null;
  /** When set (e.g. from My Team), pre-select this reportee in the manager form. */
  initialReporteeId?: string | null;
  /**
   * Manager-only (embedded in Manager Performance): "self" = read-only feedback from your line manager
   * on My Goals. "team-submit" = submit form for one reportee (My Team card only); there is no
   * multi-reportee picker. Omit for normal employee Performance.
   */
  clientRmSurface?: "self" | "team-submit";
};

export function ClientRMFeedbackTab({ currentEmployeeId, initialReporteeId, clientRmSurface }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { employees } = useEmployees();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [reportees, setReportees] = useState<Reportee[]>([]);
  const [canViewAll, setCanViewAll] = useState(false);
  const [hasTeamMembers, setHasTeamMembers] = useState(false);
  const [isLeadership, setIsLeadership] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfName, setSelfName] = useState<string>("");
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);

  const [periodId, setPeriodId] = useState<string>("");
  const [reporteeId, setReporteeId] = useState<string>("");
  const [billingStatus, setBillingStatus] = useState<string>("billable");
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [clientReportingManagerName, setClientReportingManagerName] = useState("");
  const [infoServicesReportingManagerName, setInfoServicesReportingManagerName] = useState("");
  const [additionalFeedback, setAdditionalFeedback] = useState("");
  const [overallSatisfaction, setOverallSatisfaction] = useState<number>(3);
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: 3 }), {} as Record<string, number>)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const managerEmail = user?.email || "";
  /**
   * Submit form only when opened from My Team (team-submit). No multi-reportee dropdown on My Goals.
   * Under My Goals with surface "self", managers see read-only feedback from their own line manager.
   */
  const showManagerEditor =
    clientRmSurface === "team-submit" && hasTeamMembers && !isLeadership;
  const showLeadershipRouting = isLeadership;

  const periodById = useMemo(() => {
    const m = new Map<string, Period>();
    periods.forEach((p) => m.set(p.period_id, p));
    return m;
  }, [periods]);

  const openPeriods = useMemo(() => periods.filter((p) => p.period_status === "open"), [periods]);

  const selectedReportee = useMemo(() => reportees.find((r) => r.id === reporteeId), [reportees, reporteeId]);

  /** Submissions shown below the form: only for the reportee in this session. */
  const managerSubmissionsForView = useMemo(() => {
    if (!showManagerEditor || !reporteeId) return [];
    const rid = String(reporteeId);
    return submissions.filter((s) => String(s.employee_id ?? "") === rid);
  }, [showManagerEditor, reporteeId, submissions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contextRes, periodsRes] = await Promise.all([
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`),
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods`),
      ]);

      if (!contextRes.ok || !periodsRes.ok) {
        throw new Error("Failed to load feedback context");
      }
      const contextData = await contextRes.json();
      const periodsData = await periodsRes.json();
      setCanViewAll(Boolean(contextData.can_view_all));
      setHasTeamMembers(Boolean(contextData.has_team_members));
      setIsLeadership(Boolean(contextData.is_leadership));
      setIsAdmin(Boolean(contextData.is_admin));
      setSelfName(String(contextData.employee_name || user?.name || ""));
      const reps: Reportee[] = contextData.reportees || [];
      setReportees(reps);
      setPeriods(periodsData || []);
      if (reps.length) {
        const preferred =
          initialReporteeId && reps.some((r) => r.id === initialReporteeId) ? initialReporteeId : reps[0].id;
        setReporteeId(preferred);
      }
      if (periodsData?.length) {
        const open = periodsData.find((p: Period) => p.period_status === "open");
        if (open) setPeriodId(open.period_id);
      }
    } catch {
      toast({
        title: "Unable to load feedback module",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [initialReporteeId, toast, user?.name]);

  const loadSubmissions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const loadAsManagerSubmitter =
        clientRmSurface === "self"
          ? false
          : clientRmSurface === "team-submit" && hasTeamMembers && !isLeadership;
      if (loadAsManagerSubmitter) {
        // Manager submitter: server returns this manager's submissions (scoped).
      } else if (currentEmployeeId) {
        params.set("employee_id", currentEmployeeId);
      }
      const res = await authenticatedFetch(
        `${API_BASE_URL}/client-rm-feedback/submissions${params.toString() ? `?${params.toString()}` : ""}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch {
      // keep view resilient
    }
  }, [clientRmSurface, hasTeamMembers, isLeadership, currentEmployeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const resetManagerForm = useCallback(() => {
    setEditingId(null);
    setStartedAt(null);
    setBillingStatus("billable");
    setClientName("");
    setProjectName("");
    setClientReportingManagerName("");
    setInfoServicesReportingManagerName("");
    setAdditionalFeedback("");
    setOverallSatisfaction(3);
    setRatings(RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: 3 }), {} as Record<string, number>));
  }, []);

  const loadSubmissionForEdit = (s: FeedbackSubmission) => {
    setEditingId(s.id);
    setPeriodId(s.period_id);
    setReporteeId(s.employee_id);
    setBillingStatus(s.billing_status || "billable");
    setClientName(s.client_name || "");
    setProjectName(s.project_name || "");
    setClientReportingManagerName(s.client_reporting_manager_name || "");
    setInfoServicesReportingManagerName(s.info_services_reporting_manager_name || "");
    setAdditionalFeedback(s.additional_feedback || "");
    setOverallSatisfaction(s.overall_satisfaction || 3);
    const next: Record<string, number> = { ...ratings };
    RATING_FIELDS.forEach((f) => {
      next[f.key] = pickRating(s.ratings, f.key, f.legacyKey) || 3;
    });
    setRatings(next);
    setStartedAt(s.started_at || s.submitted_at || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async () => {
    if (!periodId || !reporteeId || !clientName || !projectName || !clientReportingManagerName || !infoServicesReportingManagerName) {
      toast({
        title: "Missing required fields",
        description: "Please complete all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedReportee) return;
    setSubmitting(true);
    try {
      const body = {
        period_id: periodId,
        employee_id: selectedReportee.id,
        employee_name: selectedReportee.name,
        employee_code: selectedReportee.employee_id,
        billing_status: billingStatus,
        client_name: clientName,
        project_name: projectName,
        client_reporting_manager_name: clientReportingManagerName,
        info_services_reporting_manager_name: infoServicesReportingManagerName,
        ratings,
        additional_feedback: additionalFeedback || undefined,
        overall_satisfaction: overallSatisfaction,
        ...(editingId ? {} : { started_at: new Date().toISOString() }),
      };

      const res = editingId
        ? await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              billing_status: billingStatus,
              client_name: clientName,
              project_name: projectName,
              client_reporting_manager_name: clientReportingManagerName,
              info_services_reporting_manager_name: infoServicesReportingManagerName,
              ratings,
              additional_feedback: additionalFeedback || undefined,
              overall_satisfaction: overallSatisfaction,
            }),
          })
        : await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      toast({ title: editingId ? "Feedback updated" : "Feedback submitted successfully" });
      resetManagerForm();
      await loadSubmissions();
    } catch {
      toast({
        title: editingId ? "Update failed" : "Submission failed",
        description: "Unable to save feedback right now.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reporteeRows = useMemo(() => {
    if (!currentEmployeeId) return [];
    const selfId = String(currentEmployeeId);
    return submissions.filter((s) => String(s.employee_id ?? "") === selfId);
  }, [submissions, currentEmployeeId]);

  const markSeenAttempted = useRef<Set<string>>(new Set());

  /** When the tab is shown again (e.g. after manager submitted), pull latest for reportee read-only. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadSubmissions();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadSubmissions]);

  /** Reportee read-only: mark server-side seen so notifications stay accurate. */
  useEffect(() => {
    if (showManagerEditor || !currentEmployeeId) return;
    const unseen = reporteeRows.filter(
      (s) => !s.reportee_seen && !markSeenAttempted.current.has(s.id)
    );
    if (unseen.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const s of unseen) {
        if (cancelled) break;
        const res = await authenticatedFetch(
          `${API_BASE_URL}/client-rm-feedback/submissions/${s.id}/mark-seen`,
          { method: "POST" }
        );
        if (res.ok) markSeenAttempted.current.add(s.id);
      }
      if (!cancelled) await loadSubmissions();
    })();
    return () => {
      cancelled = true;
    };
  }, [reporteeRows, showManagerEditor, currentEmployeeId, loadSubmissions]);

  /** Same `reporting_to` link as Directory org chart → "Reports to" (line manager). */
  const lineManager = useMemo(() => {
    if (!currentEmployeeId || !employees.length) return null;
    const me = employees.find((e) => e.id === currentEmployeeId);
    const mgrId = me?.reporting_to?.trim();
    if (!mgrId) return null;
    return employees.find((e) => e.id === mgrId) ?? null;
  }, [currentEmployeeId, employees]);

  const showReadOnlyReportingContext =
    !showManagerEditor && (clientRmSurface === "self" || clientRmSurface === undefined);
  const showTeamSubmitContext = showManagerEditor && Boolean(selectedReportee);

  if (loading) {
    return (
      <Card className="border-border/60 shadow-md">
        <CardContent className="p-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading feedback…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showLeadershipRouting && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Organization-wide monthly feedback</CardTitle>
            <CardDescription>
              Leadership can review all submissions from the Monthly Feedback reports workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="default" onClick={() => navigate("/performance/monthly-feedback")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Monthly Feedback reports
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Org alignment (same reporting_to as Directory org chart) — mirrors annual review “cycle context” clarity */}
      {showReadOnlyReportingContext && lineManager && (
        <Card className="border-border/60 bg-muted/20 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4 text-primary shrink-0" />
              Reporting line
            </CardTitle>
            <CardDescription>
              Feedback below is submitted about you by your line manager (reporting relationship from the employee
              directory / org chart).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="flex items-center gap-3 rounded-lg border bg-background/80 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">Reports to</span>
              <span className="font-medium">{lineManager.name}</span>
              <span className="text-muted-foreground hidden sm:inline">· {lineManager.position}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {showTeamSubmitContext && selectedReportee && (
        <Card className="border-primary/25 bg-primary/5 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary shrink-0" />
              Direct report (My Team roster)
            </CardTitle>
            <CardDescription>
              Same list as Performance → My Team and the org chart: employees whose{" "}
              <span className="font-medium text-foreground">reporting_to</span> is your employee record.
              {reportees.length > 0 ? ` You have ${reportees.length} direct report${reportees.length === 1 ? "" : "s"}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/80 px-3 py-2.5 text-sm">
              <span className="font-semibold">{selectedReportee.name}</span>
              {selectedReportee.employee_id ? (
                <Badge variant="secondary" className="font-normal">
                  {selectedReportee.employee_id}
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {showManagerEditor && (
        <Card className="overflow-hidden border-border/60 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
          <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 py-5 border-b">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                {showManagerEditor && selectedReportee && (
                  <div className="mb-4 rounded-lg border border-primary/35 bg-background/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Individual session</p>
                    <p className="text-lg font-semibold text-foreground mt-0.5">
                      Feedback for {selectedReportee.name}
                      {selectedReportee.employee_id ? (
                        <span className="text-muted-foreground font-normal text-base ml-2">
                          ({selectedReportee.employee_id})
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 max-w-xl">
                      Only this person is in scope here—same idea as opening a review for one team member. Use another
                      team card to work on someone else.
                    </p>
                  </div>
                )}
                <p className="text-xs font-semibold tracking-widest text-primary uppercase">Confidential</p>
                <CardTitle className="text-xl md:text-2xl mt-1">{FORM_TITLE}</CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Structured monthly assessment of delivery quality, collaboration, and client alignment. Submissions are
                  visible to you, the employee, HR (admin), and authorized leadership reviewers.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {editingId && (
                  <Button type="button" variant="outline" size="sm" onClick={resetManagerForm}>
                    New submission
                  </Button>
                )}
              </div>
            </div>
          </div>
          <CardContent className="p-6 space-y-8">
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Record metadata</h3>
                <Badge variant="outline" className="text-xs font-normal">
                  Auto / read-only where noted
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldShell label="ID">{editingId || "— (assigned on save)"}</FieldShell>
                <FieldShell label="Start time">
                  {editingId && startedAt ? new Date(startedAt).toLocaleString() : "— (set on first save)"}
                </FieldShell>
                <FieldShell label="Completion time">— (set on submit)</FieldShell>
                <FieldShell label="Email">{managerEmail || "—"}</FieldShell>
                <FieldShell label="Name (submitter)">{selfName || "—"}</FieldShell>
                <FieldShell label="Last modified time">— (updated automatically)</FieldShell>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Employee & assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Feedback period *</Label>
                  <Select value={periodId} onValueChange={setPeriodId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {openPeriods.map((p) => (
                        <SelectItem key={p.period_id} value={p.period_id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {openPeriods.length === 0 && (
                    <p className="text-xs text-muted-foreground">No open periods. HR will open a cycle when ready.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Employee *</Label>
                  <div className="rounded-md border border-primary/25 bg-muted/30 px-3 py-2.5 text-sm">
                    <span className="font-semibold">{selectedReportee?.name ?? "—"}</span>
                    {selectedReportee?.employee_id ? (
                      <span className="text-muted-foreground ml-2">· {selectedReportee.employee_id}</span>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-2">
                      Employee is fixed for this session. Return to My Team and choose another card to submit for a
                      different reportee.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Engagement context</h3>
              <div className="space-y-3">
                <Label>Billing status *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: "billable", title: "Billable Resource" },
                    { value: "non_billable", title: "Non-Billable Resource" },
                    { value: "internal", title: "Internal Resource" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBillingStatus(opt.value)}
                      className={cn(
                        "rounded-lg border px-3 py-3 text-left text-sm transition-all",
                        billingStatus === opt.value
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                          : "border-border/70 hover:bg-muted/40"
                      )}
                    >
                      <div className="font-medium">{opt.title}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client name *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label>Project name *</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-background" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Client reporting manager name *</Label>
                  <Input
                    value={clientReportingManagerName}
                    onChange={(e) => setClientReportingManagerName(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Info Services reporting manager name *</Label>
                  <Input
                    value={infoServicesReportingManagerName}
                    onChange={(e) => setInfoServicesReportingManagerName(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <FieldShell label="Feedback period date" className="md:col-span-2">
                  {periodId ? periodById.get(periodId)?.label || "—" : "—"}
                </FieldShell>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Competency ratings (1–5)</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                {RATING_FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-card/50 px-3 py-3"
                  >
                    <span className="text-sm font-medium leading-snug pr-2">{field.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-label={`${field.label} ${v}`}
                          onClick={() => setRatings((prev) => ({ ...prev, [field.key]: v }))}
                          className={cn(
                            "h-9 w-9 rounded-md text-sm font-semibold transition-colors",
                            ratings[field.key] === v
                              ? "bg-primary text-primary-foreground shadow"
                              : "bg-muted/60 text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Overall satisfaction with employee performance *</Label>
                  <Select value={String(overallSatisfaction)} onValueChange={(v) => setOverallSatisfaction(Number(v))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {v} — {v <= 2 ? "Needs improvement" : v === 3 ? "Meets expectations" : "Exceeds expectations"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Any additional feedback or suggestions?</Label>
                <Textarea
                  value={additionalFeedback}
                  onChange={(e) => setAdditionalFeedback(e.target.value)}
                  rows={4}
                  className="bg-background resize-y min-h-[100px]"
                  placeholder="Optional narrative feedback, development themes, or client-specific notes…"
                />
              </div>
            </section>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={onSubmit} disabled={submitting || openPeriods.length === 0} size="lg" className="min-w-[160px]">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Save changes" : "Submit feedback"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {!showManagerEditor && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {isLeadership
                  ? "Your feedback (read-only)"
                  : clientRmSurface === "self"
                    ? "Feedback from your line manager"
                    : "Monthly feedback history"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isLeadership
                  ? "Organization-wide reporting is available from Monthly Feedback reports."
                  : clientRmSurface === "self"
                    ? "Your line manager submits this assessment. Read-only here. To give feedback for a direct report, use Client RM Feedback on their card under My Team."
                    : "Submitted by your reporting manager. This view is read-only for employees."}
              </p>
            </div>
          </div>
        )}
        {showManagerEditor && (
          <div>
            <h3 className="text-lg font-semibold tracking-tight mb-1">Submitted feedback</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedReportee
                ? `Read-only history for ${selectedReportee.name} in this session only.`
                : "Read-only copies of submissions for this session."}
            </p>
          </div>
        )}
          {(showManagerEditor ? managerSubmissionsForView : reporteeRows).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No feedback records yet for this view.
              </CardContent>
            </Card>
          ) : (
            (showManagerEditor ? managerSubmissionsForView : reporteeRows).map((entry) => {
              const period = periodById.get(entry.period_id);
              return (
                <Card key={entry.id} className="border-border/60 shadow-md overflow-hidden">
                  <CardHeader className="bg-muted/30 border-b py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{FORM_TITLE}</CardTitle>
                        <CardDescription>
                          {period?.label || "Feedback period"} · Updated{" "}
                          {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "—"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Overall {entry.overall_satisfaction}/5</Badge>
                        {showManagerEditor && (
                          <Button type="button" size="sm" variant="outline" onClick={() => loadSubmissionForEdit(entry)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FieldShell label="ID">{entry.id}</FieldShell>
                      <FieldShell label="Start time">
                        {entry.started_at ? new Date(entry.started_at).toLocaleString() : "—"}
                      </FieldShell>
                      <FieldShell label="Completion time">
                        {entry.submitted_at ? new Date(entry.submitted_at).toLocaleString() : "—"}
                      </FieldShell>
                      <FieldShell label="Email">{entry.manager_email || "—"}</FieldShell>
                      <FieldShell label="Name (submitter)">{entry.manager_name}</FieldShell>
                      <FieldShell label="Last modified time">
                        {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : "—"}
                      </FieldShell>
                      <FieldShell label="Employee name">{entry.employee_name}</FieldShell>
                      <FieldShell label="Employee ID">{entry.employee_code || entry.employee_id}</FieldShell>
                      <FieldShell label="Billing status">{billingLabel(entry.billing_status)}</FieldShell>
                      <FieldShell label="Client name">{entry.client_name}</FieldShell>
                      <FieldShell label="Project name">{entry.project_name}</FieldShell>
                      <FieldShell label="Client reporting manager name">{entry.client_reporting_manager_name || "—"}</FieldShell>
                      <FieldShell label="Info Services reporting manager name">
                        {entry.info_services_reporting_manager_name || "—"}
                      </FieldShell>
                      <FieldShell label="Feedback period date" className="sm:col-span-2 lg:col-span-3">
                        {period?.label || entry.period_id}
                      </FieldShell>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {RATING_FIELDS.map((f) => (
                        <div
                          key={f.key}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border px-3 py-2.5 bg-muted/10"
                        >
                          <span className="text-sm font-medium pr-2">{f.label}</span>
                          <StarsRead value={pickRating(entry.ratings, f.key, f.legacyKey)} />
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Overall satisfaction with employee performance
                      </Label>
                      <StarsRead value={entry.overall_satisfaction} />
                    </div>
                    {entry.additional_feedback && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Any additional feedback or suggestions?
                        </Label>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap border rounded-md p-3 bg-background">
                          {entry.additional_feedback}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
      </div>

      {isAdmin && hasTeamMembers && (
        <p className="text-xs text-muted-foreground">
          Administrators with direct reports can submit here; use Monthly Feedback reports for organization-wide exports.
        </p>
      )}
    </div>
  );
}
