import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, Eye, Loader2, Lock, Plus, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  OverallSatisfactionReadOnly,
  REPORT_CARD_HEADER_BAND,
  REPORT_CARD_TITLE,
  REPORT_RATING_QUESTION_CLASS,
  ReportDetailSection,
  ReportKV,
  SubmittedRatingRead,
} from "@/components/performance/monthly-feedback-report-primitives";
import { labelForOverallSatisfaction } from "@/lib/client-rm-feedback-rating-scales";
import { formatDateTimeInIndia } from "@/lib/date-format-india";

type Period = {
  period_id: string;
  label: string;
  start_date: string;
  end_date: string;
  period_status: "draft" | "open" | "closed";
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
  ratings?: Record<string, number>;
  additional_feedback?: string;
  overall_satisfaction: number;
  submitted_at?: string;
  updated_at?: string;
};

type RatingFieldDef = { key: string; label: string; legacyKey?: string };

const RATING_FIELDS: RatingFieldDef[] = [
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

function pickRatingValue(ratings: Record<string, number> | undefined, f: RatingFieldDef): number {
  const r = ratings || {};
  if (typeof r[f.key] === "number") return r[f.key];
  if (f.legacyKey && typeof r[f.legacyKey] === "number") return r[f.legacyKey];
  return 0;
}

/** First 9 keys match Work Performance; remainder = Communication & collaboration (same as submit form). */
const WORK_PERFORMANCE_RATING_FIELDS = RATING_FIELDS.slice(0, 9);
const COMMUNICATION_RATING_FIELDS = RATING_FIELDS.slice(9);

const CSV_COLUMNS: { key: string; header: string }[] = [
  { key: "id", header: "ID" },
  { key: "submitted_at", header: "Completion time" },
  { key: "updated_at", header: "Last modified time" },
  { key: "manager_email", header: "Email" },
  { key: "manager_name", header: "Name" },
  { key: "employee_name", header: "Employee Name" },
  { key: "employee_code", header: "Employee ID" },
  { key: "billing_status", header: "Billing Status" },
  { key: "client_name", header: "Client Name" },
  { key: "project_name", header: "Project Name" },
  { key: "client_reporting_manager_name", header: "Client Reporting Manager Name" },
  { key: "info_services_reporting_manager_name", header: "Info Services Reporting Manager Name" },
  { key: "quality_of_deliverables", header: "Quality of Deliverables" },
  { key: "adherence_to_deadlines", header: "Adherence to Deadlines" },
  { key: "technical_competency", header: "Technical Competency" },
  { key: "problem_solving_skills", header: "Problem-Solving Skills" },
  { key: "productivity_efficiency", header: "Productivity & Efficiency" },
  { key: "accuracy_attention_to_detail", header: "Accuracy and Attention to Detail" },
  { key: "ability_to_work_independently", header: "Ability to Work Independently" },
  { key: "understanding_of_requirements", header: "Understanding of Requirements" },
  { key: "responsiveness_to_work_assignments", header: "Responsiveness to Work Assignments" },
  { key: "clarity_in_communication", header: "Clarity in Communication" },
  { key: "responsiveness_to_emails_calls", header: "Responsiveness to Emails/Calls" },
  { key: "understanding_of_requirements_2", header: "Understanding of Requirements (secondary)" },
  { key: "status_reporting_updates", header: "Status Reporting and Updates" },
  { key: "team_collaboration", header: "Team Collaboration" },
  { key: "participation_in_discussions", header: "Participation in Discussions" },
  { key: "overall_satisfaction", header: "Overall Satisfaction with Employee Performance" },
  { key: "additional_feedback", header: "Any additional feedback or suggestions?" },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, headerRow: string[], rows: string[][]) {
  const csv = [headerRow.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const statusBadge = (status: Period["period_status"]) => {
  switch (status) {
    case "open":
      return <Badge className="bg-green-500/10 text-green-700 border border-green-500/20">Open</Badge>;
    case "closed":
      return <Badge variant="secondary">Closed</Badge>;
    case "draft":
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
};

export function MonthlyFeedbackManagement() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("all");
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FeedbackSubmission | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newStatus, setNewStatus] = useState<Period["period_status"]>("open");
  const [closeConfirmPeriod, setCloseConfirmPeriod] = useState<Period | null>(null);
  const [closingPeriodId, setClosingPeriodId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ctxRes, periodsRes, submissionsRes] = await Promise.all([
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`),
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods`),
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions`),
      ]);
      if (ctxRes.ok) {
        const ctx = await ctxRes.json();
        setIsAdmin(Boolean(ctx?.is_admin));
      }
      const periodsData = periodsRes.ok ? await periodsRes.json() : [];
      const submissionsData = submissionsRes.ok ? await submissionsRes.json() : [];
      setPeriods(Array.isArray(periodsData) ? periodsData : []);
      setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePeriod = async () => {
    if (!newLabel.trim() || !newStart || !newEnd) {
      toast({ title: "Missing fields", description: "Label, start date, and end date are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          start_date: newStart,
          end_date: newEnd,
          status: newStatus,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Create failed");
      }
      toast({ title: "Period created" });
      setCreateOpen(false);
      setNewLabel("");
      setNewStart("");
      setNewEnd("");
      setNewStatus("open");
      await load();
    } catch {
      toast({ title: "Could not create period", description: "Admin access required.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  /** Only open cycles in the summary grid — avoids clutter; closed/draft remain in the history period filter. */
  const openPeriodsSorted = useMemo(() => {
    return periods
      .filter((p) => p.period_status === "open")
      .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  }, [periods]);

  const confirmClosePeriod = async () => {
    if (!closeConfirmPeriod) return;
    setClosingPeriodId(closeConfirmPeriod.period_id);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods/${closeConfirmPeriod.period_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Close failed");
      }
      toast({ title: "Period closed", description: "Managers can no longer submit feedback for this cycle." });
      setCloseConfirmPeriod(null);
      await load();
    } catch {
      toast({ title: "Could not close period", description: "Admin access required or try again.", variant: "destructive" });
    } finally {
      setClosingPeriodId(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return submissions
      .filter((x) => (periodId === "all" ? true : x.period_id === periodId))
      .filter((x) => {
        if (!s) return true;
        return (
          (x.employee_name || "").toLowerCase().includes(s) ||
          (x.employee_code || "").toLowerCase().includes(s) ||
          (x.client_name || "").toLowerCase().includes(s) ||
          (x.project_name || "").toLowerCase().includes(s) ||
          (x.manager_name || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [submissions, periodId, search]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.period_id === periodId) || null,
    [periods, periodId]
  );

  /** Period label for the opened submission (not the filter dropdown — matches created period name). */
  const submissionPeriodLabel = useMemo(() => {
    if (!selected) return null;
    return periods.find((p) => p.period_id === selected.period_id)?.label?.trim() ?? null;
  }, [selected, periods]);

  const exportRows = useMemo(() => {
    // Export should respect the selected period, but not the free-text search (so export is complete).
    const periodFiltered =
      periodId === "all" ? submissions : submissions.filter((x) => x.period_id === periodId);
    return periodFiltered;
  }, [submissions, periodId]);

  const handleExport = () => {
    const periodLabelSafe =
      selectedPeriod?.label?.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") ||
      (periodId === "all" ? "all_periods" : periodId);
    const filename = `monthly_feedback_${periodLabelSafe}.csv`;
    const headers = CSV_COLUMNS.map((c) => c.header);
    const rows = exportRows.map((x) => {
      const ratings = { ...(x.ratings || {}) };
      if (ratings.understanding_of_requirements_2 === undefined && ratings.business_domain_understanding !== undefined) {
        ratings.understanding_of_requirements_2 = ratings.business_domain_understanding;
      }
      const rowObj: Record<string, unknown> = {
        ...x,
        ...ratings,
      };
      return CSV_COLUMNS.map((c) => csvEscape(rowObj[c.key]));
    });
    downloadCsv(filename, headers, rows);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading monthly feedback...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card className="overflow-hidden border-primary/25 bg-gradient-to-r from-primary/5 to-transparent shadow-md">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/25 py-4">
            <div>
              <CardTitle className={REPORT_CARD_TITLE}>Monthly feedback periods</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">
                Open a new cycle so managers can submit structured feedback for their teams.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Create period
            </Button>
          </CardHeader>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">Create monthly feedback period</DialogTitle>
            <DialogDescription>Define dates and status for a new submission window.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Period label *</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. April 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start date *</Label>
                <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End date *</Label>
                <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Period["period_status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open (managers can submit)</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreatePeriod} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-background/95 to-muted/10 shadow-lg">
        <CardHeader className={REPORT_CARD_HEADER_BAND}>
          <CardTitle className={REPORT_CARD_TITLE}>Open feedback periods</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Active submission windows only (newest first). Closed and draft periods stay available in the history filter
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monthly feedback periods created yet.</p>
          ) : openPeriodsSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open periods right now. Create one above, or use{" "}
              <span className="font-medium text-foreground">Monthly feedback history</span> to review past cycles.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {openPeriodsSorted.map((p) => (
                <div
                  key={p.period_id}
                  className="rounded-xl border-2 border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold tracking-tight text-foreground leading-tight">{p.label}</span>
                    {statusBadge(p.period_status)}
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {p.start_date} → {p.end_date}
                  </div>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto shrink-0"
                      disabled={closingPeriodId === p.period_id}
                      onClick={() => setCloseConfirmPeriod(p)}
                    >
                      {closingPeriodId === p.period_id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 mr-2" />
                      )}
                      Close period
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!closeConfirmPeriod} onOpenChange={(open) => !open && setCloseConfirmPeriod(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this feedback period?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeConfirmPeriod ? (
                <>
                  <span className="font-medium text-foreground">{closeConfirmPeriod.label}</span> will be marked closed.
                  Managers will no longer be able to submit feedback for this cycle. Existing submissions stay in
                  reports.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!closingPeriodId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmClosePeriod();
              }}
              disabled={!!closingPeriodId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closingPeriodId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close period"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-background/95 to-muted/10 shadow-lg">
        <CardHeader className={REPORT_CARD_HEADER_BAND}>
          <CardTitle className={REPORT_CARD_TITLE}>Monthly feedback history</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Filter by period, search, and open a read-only submission report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.period_id} value={p.period_id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by employee, client, project, manager..."
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {periodId === "all"
                ? `Export will include all periods (${exportRows.length} records).`
                : `Export will include the selected period (${exportRows.length} records).`}
            </p>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exportRows.length === 0 || periodId === "all"}
              title={periodId === "all" ? "Select a period to export" : "Download CSV"}
            >
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          </div>

          <div className="border-2 border-border/60 rounded-lg overflow-x-auto shadow-inner bg-muted/10">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Employee Name
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Employee ID
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">Client</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">Project</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">Manager</TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Overall
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Updated
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    View
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((x) => (
                  <TableRow key={x.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-semibold text-foreground">{x.employee_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{x.employee_code || x.employee_id || "—"}</TableCell>
                    <TableCell>{x.client_name}</TableCell>
                    <TableCell>{x.project_name}</TableCell>
                    <TableCell>{x.manager_name}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-foreground">
                      {labelForOverallSatisfaction(Number(x.overall_satisfaction || 0))}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {(x.updated_at || x.submitted_at || "").toString().slice(0, 10) || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(x)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No monthly feedback records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground leading-snug">
              Monthly feedback report
            </DialogTitle>
            <DialogDescription>Read-only snapshot of this submission.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <ReportDetailSection title="Employee & assignment">
                <div className="grid grid-cols-1 md:grid-cols-2 md:items-start gap-x-6 gap-y-4">
                  <ReportKV label="Employee name" value={selected.employee_name || "—"} />
                  <ReportKV label="Submitted by" value={selected.manager_name || "—"} />
                  <ReportKV
                    label="Employee ID"
                    value={selected.employee_code?.trim() || selected.employee_id || "—"}
                  />
                  <ReportKV label="Period" value={submissionPeriodLabel || "—"} />
                  <ReportKV label="Billing status" value={selected.billing_status} />
                  <ReportKV label="Client name" value={selected.client_name} />
                  <ReportKV label="Project name" value={selected.project_name} />
                  <ReportKV label="Client reporting manager name" value={selected.client_reporting_manager_name || "—"} />
                  <ReportKV
                    label="Info Services reporting manager name"
                    value={selected.info_services_reporting_manager_name || "—"}
                    className="md:col-span-2"
                  />
                  <ReportKV label="Completion time" value={formatDateTimeInIndia(selected.submitted_at)} />
                  <ReportKV label="Last modified time" value={formatDateTimeInIndia(selected.updated_at)} />
                </div>
              </ReportDetailSection>

              <ReportDetailSection title="Work performance">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {WORK_PERFORMANCE_RATING_FIELDS.map((f) => (
                    <div
                      key={f.key}
                      className="flex flex-col gap-1.5 border-l-[3px] border-l-primary/25 bg-card pl-3 pr-2 py-2.5 rounded-r-lg border border-border/50"
                    >
                      <span className={REPORT_RATING_QUESTION_CLASS}>{f.label}</span>
                      <SubmittedRatingRead variant="work" value={pickRatingValue(selected.ratings, f)} />
                    </div>
                  ))}
                </div>
              </ReportDetailSection>

              <ReportDetailSection title="Communication & collaboration">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {COMMUNICATION_RATING_FIELDS.map((f) => (
                    <div
                      key={f.key}
                      className="flex flex-col gap-1.5 border-l-[3px] border-l-primary/25 bg-card pl-3 pr-2 py-2.5 rounded-r-lg border border-border/50"
                    >
                      <span className={REPORT_RATING_QUESTION_CLASS}>{f.label}</span>
                      <SubmittedRatingRead variant="communication" value={pickRatingValue(selected.ratings, f)} />
                    </div>
                  ))}
                </div>
              </ReportDetailSection>

              <ReportDetailSection title="Overall satisfaction">
                <OverallSatisfactionReadOnly value={Number(selected.overall_satisfaction || 0)} />
              </ReportDetailSection>

              <ReportDetailSection title="Additional feedback">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground font-medium border-2 border-border/50 rounded-lg bg-background px-3 py-3 min-h-[3rem]">
                  {selected.additional_feedback || "—"}
                </p>
              </ReportDetailSection>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

