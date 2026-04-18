import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarRange, Download, Eye, Loader2, Lock, Plus, Search } from "lucide-react";
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
import {
  csvExportLabelForCommunicationRating,
  csvExportLabelForWorkPerformanceRating,
  labelForOverallSatisfaction,
} from "@/lib/client-rm-feedback-rating-scales";
import { formatDateInIndia, formatDateTimeInIndia } from "@/lib/date-format-india";
import { cn } from "@/lib/utils";

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
  /** Directory email for the subject (reportee); enriched by API when missing on stored rows. */
  employee_email?: string;
  employee_code?: string;
  manager_name: string;
  manager_email?: string;
  billing_status: string;
  /** Legacy snapshots only — no longer collected in UI. */
  client_name?: string;
  project_name?: string;
  client_reporting_manager_name?: string;
  info_services_reporting_manager_name?: string;
  ratings?: Record<string, number>;
  additional_feedback?: string;
  overall_satisfaction: number;
  /** When the manager first opened / started the feedback (mirrors Microsoft Forms “Start time”). */
  started_at?: string;
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

function readStoredRating(raw: unknown): number {
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickRatingValue(ratings: Record<string, number> | undefined, f: RatingFieldDef): number {
  const r = ratings as Record<string, unknown> | undefined;
  const bag = r || {};
  const primary = readStoredRating(bag[f.key]);
  if (primary !== 0) return primary;
  if (f.legacyKey) {
    const leg = readStoredRating(bag[f.legacyKey]);
    if (leg !== 0) return leg;
  }
  return 0;
}

/** First 9 keys match Work Performance; remainder = Communication & collaboration (same as submit form). */
const WORK_PERFORMANCE_RATING_FIELDS = RATING_FIELDS.slice(0, 9);
const COMMUNICATION_RATING_FIELDS = RATING_FIELDS.slice(9);

function csvNa(value: unknown): string {
  if (value === null || value === undefined) return "NA";
  const s = String(value).trim();
  return s === "" ? "NA" : s;
}

function csvRatingCell(ratings: Record<string, number>, fieldKey: string): string {
  const idx = RATING_FIELDS.findIndex((f) => f.key === fieldKey);
  if (idx < 0) return "NA";
  const def = RATING_FIELDS[idx];
  const raw = pickRatingValue(ratings, def);
  if (!raw) return "NA";
  const label =
    idx < 9
      ? csvExportLabelForWorkPerformanceRating(raw)
      : csvExportLabelForCommunicationRating(raw);
  return label === "—" ? "NA" : label.trim();
}

type ExportCtx = {
  rowIndex: number;
  sub: FeedbackSubmission;
  ratings: Record<string, number>;
  periodLabel: string;
};

/** CSV export: emails from stored submission (reportee + submitting manager), not Forms-style respondent columns. */
const CSV_COLUMN_DEFS: { header: string; get: (ctx: ExportCtx) => string }[] = [
  { header: "ID", get: ({ rowIndex }) => String(rowIndex + 1) },
  { header: "Reportee email", get: ({ sub }) => csvNa(sub.employee_email) },
  { header: "Reporting manager email", get: ({ sub }) => csvNa(sub.manager_email) },
  { header: "Employee Name", get: ({ sub }) => csvNa(sub.employee_name) },
  { header: "Employee ID", get: ({ sub }) => csvNa(sub.employee_code) },
  { header: "Billing Status", get: ({ sub }) => csvNa(sub.billing_status) },
  {
    header: "Info Services Reporting Manager Name",
    get: ({ sub }) => csvNa(sub.info_services_reporting_manager_name),
  },
  { header: "Feedback Period", get: ({ periodLabel }) => csvNa(periodLabel) },
  {
    header: "Submitted date",
    get: ({ sub }) => {
      if (!sub.submitted_at) return "NA";
      const d = formatDateInIndia(sub.submitted_at);
      return d || "NA";
    },
  },
  { header: "Quality of Deliverables", get: ({ ratings }) => csvRatingCell(ratings, "quality_of_deliverables") },
  { header: "Adherence to Deadlines", get: ({ ratings }) => csvRatingCell(ratings, "adherence_to_deadlines") },
  { header: "Technical Competency", get: ({ ratings }) => csvRatingCell(ratings, "technical_competency") },
  { header: "Problem-Solving Skills", get: ({ ratings }) => csvRatingCell(ratings, "problem_solving_skills") },
  {
    header: "Productivity & Efficiency",
    get: ({ ratings }) => csvRatingCell(ratings, "productivity_efficiency"),
  },
  {
    header: "Accuracy and Attention to Detail",
    get: ({ ratings }) => csvRatingCell(ratings, "accuracy_attention_to_detail"),
  },
  {
    header: "Ability to Work Independently",
    get: ({ ratings }) => csvRatingCell(ratings, "ability_to_work_independently"),
  },
  {
    header: "Understanding of Requirements",
    get: ({ ratings }) => csvRatingCell(ratings, "understanding_of_requirements"),
  },
  {
    header: "Responsiveness to Work Assignments",
    get: ({ ratings }) => csvRatingCell(ratings, "responsiveness_to_work_assignments"),
  },
  { header: "Clarity in Communication", get: ({ ratings }) => csvRatingCell(ratings, "clarity_in_communication") },
  {
    header: "Responsiveness to Emails/Calls",
    get: ({ ratings }) => csvRatingCell(ratings, "responsiveness_to_emails_calls"),
  },
  {
    header: "Understanding of Requirements2",
    get: ({ ratings }) => csvRatingCell(ratings, "understanding_of_requirements_2"),
  },
  {
    header: "Status Reporting and Updates",
    get: ({ ratings }) => csvRatingCell(ratings, "status_reporting_updates"),
  },
  { header: "Team Collaboration", get: ({ ratings }) => csvRatingCell(ratings, "team_collaboration") },
  {
    header: "Participation in Discussions",
    get: ({ ratings }) => csvRatingCell(ratings, "participation_in_discussions"),
  },
  {
    header: "Any additional feedback or suggestions?",
    get: ({ sub }) => csvNa(sub.additional_feedback),
  },
  {
    header: "Overall Satisfaction with Employee Performance",
    get: ({ sub }) => {
      const raw = sub.overall_satisfaction as unknown;
      const n =
        typeof raw === "number" && !Number.isNaN(raw)
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : NaN;
      if (Number.isNaN(n) || n < 1 || n > 5) return "NA";
      return String(Math.round(n));
    },
  },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sanitizeCsvFilenamePart(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 72) || "export";
}

/**
 * Audit-friendly filename: period scope + row count + export mode + UTC timestamp.
 */
function buildMonthlyFeedbackExportFilename(params: {
  periodId: string;
  periodLabelForSlug: string | null;
  rowCount: number;
  visibleCount: number;
  exportScope: "all_visible" | "selected";
}): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const periodSlug =
    params.periodId === "all"
      ? "all_periods"
      : sanitizeCsvFilenamePart(params.periodLabelForSlug || params.periodId || "period");
  const mode =
    params.exportScope === "selected"
      ? params.rowCount < params.visibleCount
        ? "selected_subset"
        : "selected_full"
      : "all_visible";
  return `monthly_feedback_${periodSlug}_${params.rowCount}rows_${mode}_${ts}.csv`;
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

function overallSatisfactionPillClass(value: number): string {
  const n = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  if (n <= 0) return "border-border/60 bg-muted/30 text-muted-foreground";
  if (n <= 2) return "border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-100";
  if (n === 3) return "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-100";
  return "border-emerald-600/40 bg-emerald-600/12 text-emerald-900 dark:text-emerald-100";
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

/** Compact status chip for the history grid — sits inline with the cycle name (no raw ISO dates below). */
function PeriodStatusTableChip({ status }: { status: Period["period_status"] }) {
  const base =
    "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none shadow-sm";
  switch (status) {
    case "open":
      return (
        <span
          className={cn(
            base,
            "border-emerald-500/45 bg-emerald-500/15 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-50"
          )}
        >
          Open
        </span>
      );
    case "closed":
      return (
        <span
          className={cn(
            base,
            "border-border/80 bg-muted/90 text-foreground/95 dark:bg-muted/50"
          )}
        >
          Closed
        </span>
      );
    case "draft":
    default:
      return (
        <span
          className={cn(
            base,
            "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
          )}
        >
          Draft
        </span>
      );
  }
}

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
  /** Which rows are included in CSV: entire filtered table, or only checked rows (when scope is `selected`). */
  const [csvExportScope, setCsvExportScope] = useState<"all_visible" | "selected">("all_visible");
  const [exportSelectionIds, setExportSelectionIds] = useState<Set<string>>(() => new Set());

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

  const periodById = useMemo(() => {
    const m = new Map<string, Period>();
    periods.forEach((p) => m.set(p.period_id, p));
    return m;
  }, [periods]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return submissions
      .filter((x) => (periodId === "all" ? true : x.period_id === periodId))
      .filter((x) => {
        if (!s) return true;
        const cycle = periodById.get(x.period_id);
        const periodHaystack = [cycle?.label, cycle?.start_date, cycle?.end_date]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (x.employee_name || "").toLowerCase().includes(s) ||
          (x.employee_code || "").toLowerCase().includes(s) ||
          (x.employee_email || "").toLowerCase().includes(s) ||
          (x.manager_name || "").toLowerCase().includes(s) ||
          periodHaystack.includes(s)
        );
      })
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }, [submissions, periodId, search, periodById]);

  /** When switching back to “all rows in view”, clear row checks so the next “selected” session starts clean. */
  useEffect(() => {
    if (csvExportScope === "all_visible") {
      setExportSelectionIds(new Set());
    }
  }, [csvExportScope]);

  /** Drop selections that are no longer visible after period/search changes (avoid stale IDs). */
  useEffect(() => {
    const visible = new Set(filtered.map((r) => r.id));
    setExportSelectionIds((prev) => {
      const next = new Set<string>();
      let changed = false;
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      if (prev.size !== next.size) changed = true;
      return changed ? next : prev;
    });
  }, [filtered]);

  const csvExportRows = useMemo(() => {
    if (csvExportScope === "all_visible") return filtered;
    return filtered.filter((r) => exportSelectionIds.has(r.id));
  }, [filtered, exportSelectionIds, csvExportScope]);

  const showExportCheckboxes = csvExportScope === "selected";

  const allVisibleExportChecked =
    filtered.length > 0 && filtered.every((r) => exportSelectionIds.has(r.id));
  const someVisibleExportChecked = filtered.some((r) => exportSelectionIds.has(r.id));
  const exportHeaderCheckboxState: boolean | "indeterminate" = allVisibleExportChecked
    ? true
    : someVisibleExportChecked
      ? "indeterminate"
      : false;

  const toggleExportRow = useCallback((id: string) => {
    setExportSelectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExportAllVisible = useCallback(() => {
    setExportSelectionIds((prev) => {
      const ids = filtered.map((r) => r.id);
      if (ids.length === 0) return prev;
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
        return next;
      }
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [filtered]);

  const clearExportSelection = useCallback(() => {
    setExportSelectionIds(new Set());
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.period_id === periodId) || null,
    [periods, periodId]
  );

  /** Period label for the opened submission (not the filter dropdown — matches created period name). */
  const submissionPeriodLabel = useMemo(() => {
    if (!selected) return null;
    return periods.find((p) => p.period_id === selected.period_id)?.label?.trim() ?? null;
  }, [selected, periods]);

  const handleExport = () => {
    if (csvExportScope === "selected" && exportSelectionIds.size === 0) {
      toast({
        title: "Select rows first",
        description: "Choose “Selected rows only” is on — check one or more rows, then download.",
        variant: "destructive",
      });
      return;
    }
    if (csvExportRows.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Adjust the period filter or search so at least one row appears.",
        variant: "destructive",
      });
      return;
    }
    const filename = buildMonthlyFeedbackExportFilename({
      periodId,
      periodLabelForSlug: selectedPeriod?.label ?? null,
      rowCount: csvExportRows.length,
      visibleCount: filtered.length,
      exportScope: csvExportScope,
    });
    const headers = CSV_COLUMN_DEFS.map((c) => c.header);
    const rows = csvExportRows.map((x, rowIndex) => {
      const ratings = { ...(x.ratings || {}) };
      if (
        ratings.understanding_of_requirements_2 === undefined &&
        ratings.business_domain_understanding !== undefined
      ) {
        ratings.understanding_of_requirements_2 = ratings.business_domain_understanding;
      }
      const periodLabel =
        periods.find((p) => p.period_id === x.period_id)?.label?.trim() || "";
      const ctx: ExportCtx = { rowIndex, sub: x, ratings, periodLabel };
      return CSV_COLUMN_DEFS.map((c) => csvEscape(c.get(ctx)));
    });
    downloadCsv(filename, headers, rows);
    toast({
      title: "Download started",
      description: `Exporting ${csvExportRows.length} row(s) as ${filename}.`,
    });
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

      <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-background via-background to-primary/[0.04] shadow-lg ring-1 ring-border/40">
        <CardHeader className={cn(REPORT_CARD_HEADER_BAND, "border-b border-primary/15 bg-gradient-to-r from-primary/[0.08] via-muted/30 to-transparent")}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <CalendarRange className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className={REPORT_CARD_TITLE}>Monthly feedback history</CardTitle>
              <CardDescription className="text-xs leading-relaxed sm:text-sm">
                Filter by period or search. Use{" "}
                <span className="font-medium text-foreground">CSV export</span> below for a full download or a
                selection-based export.
              </CardDescription>
            </div>
          </div>
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
                  placeholder="Search by employee, employee ID, manager, or period / dates…"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end sm:gap-x-3 sm:gap-y-2">
            <div className="w-full sm:w-auto sm:min-w-[16rem] space-y-1.5">
              <Label htmlFor="csv-export-scope" className="text-xs text-muted-foreground">
                CSV export
              </Label>
              <Select
                value={csvExportScope}
                onValueChange={(v) => setCsvExportScope(v as "all_visible" | "selected")}
              >
                <SelectTrigger id="csv-export-scope" className="h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all_visible">All rows in current view</SelectItem>
                  <SelectItem value="selected">Selected rows only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {showExportCheckboxes && exportSelectionIds.size > 0 ? (
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={clearExportSelection}>
                  Clear selection
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={handleExport}
                disabled={
                  filtered.length === 0 ||
                  (csvExportScope === "selected" && exportSelectionIds.size === 0)
                }
                title={
                  csvExportScope === "all_visible"
                    ? "Download every row shown in the table (respects period + search filters)"
                    : exportSelectionIds.size === 0
                      ? "Check one or more rows in the table first"
                      : "Download a CSV with only the checked rows (full row data)"
                }
                className="shadow-sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/80 overflow-x-auto shadow-md ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-primary/20 bg-gradient-to-r from-muted/80 to-muted/40 hover:from-muted/80 hover:to-muted/40">
                  {showExportCheckboxes ? (
                    <TableHead className="w-12 pl-3">
                      <Checkbox
                        checked={exportHeaderCheckboxState}
                        onCheckedChange={() => toggleExportAllVisible()}
                        disabled={filtered.length === 0}
                        aria-label="Select all visible rows for CSV export"
                        className="translate-y-0.5"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="min-w-[12rem] text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarRange className="h-3.5 w-3.5 opacity-70" />
                      Feedback period
                    </span>
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Employee Name
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Employee ID
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Reportee email
                  </TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Submitted by
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Overall
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    Last updated
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                    View
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((x, rowIdx) => {
                  const cycle = periodById.get(x.period_id);
                  const overallN = Number(x.overall_satisfaction || 0);
                  return (
                    <TableRow
                      key={x.id}
                      className={cn(
                        "border-border/40 transition-colors hover:bg-primary/[0.04]",
                        rowIdx % 2 === 1 && "bg-muted/20",
                        showExportCheckboxes &&
                          exportSelectionIds.size > 0 &&
                          exportSelectionIds.has(x.id) &&
                          "bg-primary/[0.06] ring-1 ring-inset ring-primary/15"
                      )}
                    >
                      {showExportCheckboxes ? (
                        <TableCell className="align-middle w-12 pl-3">
                          <Checkbox
                            checked={exportSelectionIds.has(x.id)}
                            onCheckedChange={() => toggleExportRow(x.id)}
                            aria-label={`Include ${x.employee_name || "employee"} in CSV export`}
                            className="translate-y-0.5"
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="align-middle py-2.5">
                        {cycle ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0 pr-2">
                            <span className="font-semibold text-foreground leading-tight min-w-0 break-words">
                              {cycle.label?.trim() || "Unknown cycle"}
                            </span>
                            <PeriodStatusTableChip status={cycle.period_status} />
                          </div>
                        ) : (
                          <div className="flex min-w-0 flex-col gap-0.5 pr-2">
                            <span className="font-medium text-muted-foreground">Unknown cycle</span>
                            <span
                              className="text-[11px] font-mono text-muted-foreground/90 truncate max-w-[14rem]"
                              title={x.period_id}
                            >
                              {x.period_id}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground align-middle">{x.employee_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground align-middle">
                        {x.employee_code || x.employee_id || "—"}
                      </TableCell>
                      <TableCell className="align-middle text-muted-foreground text-xs break-all max-w-[14rem]">
                        {x.employee_email?.trim() || "—"}
                      </TableCell>
                      <TableCell className="align-middle">{x.manager_name}</TableCell>
                      <TableCell className="text-right align-middle">
                        <span
                          className={cn(
                            "inline-flex max-w-[12rem] justify-end rounded-full border px-2.5 py-1 text-xs font-medium leading-tight",
                            overallSatisfactionPillClass(overallN)
                          )}
                        >
                          {labelForOverallSatisfaction(overallN)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground align-middle">
                        {(x.updated_at || x.submitted_at || "").toString().slice(0, 10) || "—"}
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <Button variant="outline" size="sm" onClick={() => setSelected(x)} className="shadow-sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showExportCheckboxes ? 9 : 8} className="text-center text-muted-foreground py-10">
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
              Monthly feedback
              {selected && submissionPeriodLabel ? (
                <span className="mt-2 block text-base font-semibold text-primary">{submissionPeriodLabel}</span>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              Read-only view of ratings, assignment context, and timestamps for this record.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <ReportDetailSection title="Employee & assignment">
                <div className="grid grid-cols-1 md:grid-cols-2 md:items-start gap-x-6 gap-y-4">
                  <ReportKV label="Employee name" value={selected.employee_name || "—"} />
                  <ReportKV label="Reportee email" value={selected.employee_email?.trim() || "—"} />
                  <ReportKV label="Submitted by" value={selected.manager_name || "—"} />
                  <ReportKV
                    label="Employee ID"
                    value={selected.employee_code?.trim() || selected.employee_id || "—"}
                  />
                  <ReportKV label="Period" value={submissionPeriodLabel || "—"} />
                  <ReportKV label="Billing status" value={selected.billing_status} />
                  <ReportKV
                    label="Info Services reporting manager name"
                    value={selected.info_services_reporting_manager_name || "—"}
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

