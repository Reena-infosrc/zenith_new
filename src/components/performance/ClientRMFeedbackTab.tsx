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
import { Loader2, Star, ExternalLink, Users, Network, CalendarRange, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  OverallSatisfactionReadOnly,
  REPORT_RATING_QUESTION_CLASS,
  ReportDetailSection,
  ReportKV,
  SubmittedRatingRead,
} from "@/components/performance/monthly-feedback-report-primitives";
import {
  COMMUNICATION_COLLABORATION_SCALE,
  WORK_PERFORMANCE_SCALE,
} from "@/lib/client-rm-feedback-rating-scales";
import { formatDateTimeInIndia } from "@/lib/date-format-india";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  /** Submitter (line manager at time of submit); used to scope open-period logic after reporting-line changes. */
  manager_employee_id?: string;
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

type FeedbackDraft = {
  id: string;
  draft_id?: string;
  period_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  billing_status?: string;
  client_name?: string;
  project_name?: string;
  client_reporting_manager_name?: string;
  info_services_reporting_manager_name?: string;
  additional_feedback?: string;
  ratings?: Record<string, number>;
  overall_satisfaction?: number;
  started_at?: string;
  updated_at?: string;
};

type HistorySortOrder = "desc" | "asc";
type HistoryScope = "this-month" | "previous-months";

/** Industry-standard title aligned to the original Info Services form. */
const FORM_TITLE = "Client & Delivery Manager Performance Feedback";
const INDIA_TIMEZONE = "Asia/Kolkata";
const INDIA_LOCALE = "en-IN";

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

const WORK_PERFORMANCE_FIELD_KEYS = [
  "quality_of_deliverables",
  "adherence_to_deadlines",
  "technical_competency",
  "problem_solving_skills",
  "productivity_efficiency",
  "accuracy_attention_to_detail",
  "ability_to_work_independently",
  "understanding_of_requirements",
  "responsiveness_to_work_assignments",
] as const;

const WORK_PERFORMANCE_FIELDS = RATING_FIELDS.filter((f) =>
  WORK_PERFORMANCE_FIELD_KEYS.includes(f.key as (typeof WORK_PERFORMANCE_FIELD_KEYS)[number])
);

const COMMUNICATION_COLLABORATION_FIELD_CONFIG: Array<{ key: string; label: string }> = [
  { key: "clarity_in_communication", label: "Clarity in Communication" },
  { key: "responsiveness_to_emails_calls", label: "Responsiveness to Emails/Calls" },
  { key: "understanding_of_requirements_2", label: "Understanding of Requirements" },
  { key: "status_reporting_updates", label: "Status Reporting and Updates" },
  { key: "team_collaboration", label: "Team Collaboration" },
  { key: "participation_in_discussions", label: "Participation in Discussions" },
];

const COMMUNICATION_COLLABORATION_FIELDS = COMMUNICATION_COLLABORATION_FIELD_CONFIG.map((cfg) => {
  const field = RATING_FIELDS.find((f) => f.key === cfg.key);
  if (!field) return null;
  return { ...field, label: cfg.label };
}).filter((field): field is { key: string; label: string; legacyKey?: string } => Boolean(field));

/** Bold section titles — consistent hierarchy across the Client RM feedback form and related cards. */
const CRM_SECTION_TITLE_CARD = "text-base font-bold tracking-tight text-foreground";
const CRM_SECTION_TITLE_LG = "text-lg font-bold tracking-tight text-foreground";
const CRM_SECTION_TITLE_DIALOG = "text-xl font-bold tracking-tight text-foreground leading-snug";

/**
 * Stacked criterion rows with a single horizontal segmented control per row (1–5 in API).
 * Avoids a dense radio grid while keeping the full scale visible and scannable.
 */
/** Keeps criterion + rating columns aligned on every row (fixed left column on sm+). */
const RATING_MATRIX_GRID =
  "sm:grid sm:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] sm:gap-x-5 sm:items-start";

function RatingMatrixTable({
  fields,
  scale,
  ratings,
  onPick,
}: {
  fields: { key: string; label: string }[];
  scale: { value: number; label: string }[];
  ratings: Record<string, number>;
  onPick: (fieldKey: string, value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 p-1 shadow-sm">
      <div className="overflow-hidden rounded-md border border-border/60 bg-card shadow-sm">
        <div
          className={cn(
            "hidden border-b-2 border-border/80 bg-gradient-to-r from-muted/70 to-muted/40 px-4 py-3",
            RATING_MATRIX_GRID
          )}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-foreground/90">
            Criterion
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-foreground/90">
            Your rating
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {fields.map((field, idx) => {
            const current = ratings[field.key] ?? 3;
            return (
              <div
                key={field.key}
                className={cn(
                  "px-3 py-3.5 sm:px-4 sm:py-3.5 transition-colors",
                  idx % 2 === 0 ? "bg-card" : "bg-muted/25"
                )}
              >
                <div className={cn("flex flex-col gap-2.5", RATING_MATRIX_GRID)}>
                  <div className="flex gap-2 border-l-[3px] border-l-primary/40 pl-3 sm:block sm:border-l-0 sm:pl-0">
                    <p
                      id={`crm-criterion-${field.key}`}
                      className="text-sm font-semibold leading-snug text-foreground sm:pr-1"
                    >
                      {field.label}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/70 sm:hidden">
                      Your rating
                    </p>
                    <div
                      className="rounded-lg border-2 border-border/70 bg-muted/20 p-1 shadow-sm"
                      role="radiogroup"
                      aria-labelledby={`crm-criterion-${field.key}`}
                    >
                      <div className="flex gap-0.5 overflow-x-auto pb-0.5 sm:pb-0 [scrollbar-width:thin]">
                        {scale.map((opt) => {
                          const selected = current === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              title={opt.label}
                              className={cn(
                                "flex-1 min-w-[4.75rem] sm:min-w-[5.25rem] rounded-md px-1 py-2 sm:px-1.5 text-center text-[11px] sm:text-xs leading-tight transition-all duration-150",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                selected
                                  ? "bg-primary font-semibold text-primary-foreground shadow-md ring-1 ring-primary/30"
                                  : "font-medium text-foreground/75 hover:bg-background hover:text-foreground hover:shadow-sm"
                              )}
                              onClick={() => onPick(field.key, opt.value)}
                            >
                              <span className="block">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 1–5 star control for overall satisfaction; value is still a plain number for the API. */
function OverallSatisfactionStarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      className="rounded-xl border-2 border-border/70 bg-gradient-to-b from-muted/50 via-background to-background p-4 shadow-sm"
      role="radiogroup"
      aria-label="Overall satisfaction from 1 to 5 stars"
    >
      <div className="flex flex-wrap items-end justify-center gap-2 sm:justify-start sm:gap-5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= value;
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} out of 5 stars`}
              className={cn(
                "flex min-w-[3rem] flex-col items-center gap-1.5 rounded-xl px-2 py-2 transition-all",
                "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected ? "bg-primary/12 ring-2 ring-primary/35 shadow-sm" : "hover:bg-muted/50"
              )}
              onClick={() => onChange(n)}
            >
              <Star
                className={cn(
                  "h-9 w-9 transition-colors sm:h-10 sm:w-10",
                  filled
                    ? "fill-amber-400 text-amber-500 drop-shadow-sm"
                    : "fill-transparent text-muted-foreground/35 hover:text-muted-foreground/55"
                )}
                strokeWidth={filled ? 0 : 1.75}
              />
              <span
                className={cn(
                  "text-xs font-bold tabular-nums leading-none tracking-tight",
                  filled ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground"
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pickRating(ratings: Record<string, number> | undefined, key: string, legacyKey?: string) {
  const r = ratings || {};
  if (typeof r[key] === "number") return r[key];
  if (legacyKey && typeof r[legacyKey] === "number") return r[legacyKey];
  return 0;
}

function formatPeriodRange(p: Period): string {
  try {
    const s = new Date(p.start_date).toLocaleDateString(INDIA_LOCALE, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: INDIA_TIMEZONE,
    });
    const e = new Date(p.end_date).toLocaleDateString(INDIA_LOCALE, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: INDIA_TIMEZONE,
    });
    return `${s} – ${e}`;
  } catch {
    return p.label;
  }
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

function sortFeedbackEntries(entries: FeedbackSubmission[], order: HistorySortOrder): FeedbackSubmission[] {
  return [...entries].sort((a, b) => {
    const ta = new Date(a.updated_at || a.submitted_at || 0).getTime();
    const tb = new Date(b.updated_at || b.submitted_at || 0).getTime();
    return order === "desc" ? tb - ta : ta - tb;
  });
}

function getSubmissionTimestamp(entry: FeedbackSubmission): number {
  return new Date(entry.updated_at || entry.submitted_at || 0).getTime();
}

function isInCurrentMonth(entry: FeedbackSubmission): boolean {
  const t = getSubmissionTimestamp(entry);
  if (!t) return false;
  const d = new Date(t);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/** Shared read-only body for a stored submission (accordion / card). */
function SubmissionDetailContent({
  entry,
  period,
}: {
  entry: FeedbackSubmission;
  period?: Period;
}) {
  return (
    <>
      <ReportDetailSection title="Submission & assignment">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <ReportKV label="Employee name" value={entry.employee_name || "—"} />
            <ReportKV
              label="Employee ID"
              value={entry.employee_code?.trim() || entry.employee_id || "—"}
            />
          </div>
          <ReportKV label="ID" value={entry.id} />
          <ReportKV label="Created" value={formatDateTimeInIndia(entry.started_at)} />
          <ReportKV label="Completion time" value={formatDateTimeInIndia(entry.submitted_at)} />
          <ReportKV label="Email" value={entry.manager_email || "—"} />
          <ReportKV label="Name (submitter)" value={entry.manager_name} />
          <ReportKV label="Last modified time" value={formatDateTimeInIndia(entry.updated_at)} />
          <ReportKV label="Billing status" value={billingLabel(entry.billing_status)} />
          <ReportKV label="Period" value={period?.label?.trim() || "—"} />
          <ReportKV label="Client name" value={entry.client_name} />
          <ReportKV label="Project name" value={entry.project_name} />
          <ReportKV label="Client reporting manager name" value={entry.client_reporting_manager_name || "—"} />
          <ReportKV label="Info Services reporting manager name" value={entry.info_services_reporting_manager_name || "—"} />
        </div>
      </ReportDetailSection>
      <Separator className="my-2" />
      <div className="space-y-4">
        <ReportDetailSection title="Work performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {WORK_PERFORMANCE_FIELDS.map((f) => (
              <div
                key={f.key}
                className="flex flex-col gap-1.5 border-l-[3px] border-l-primary/25 bg-card pl-3 pr-2 py-2.5 rounded-r-lg border border-border/50"
              >
                <span className={REPORT_RATING_QUESTION_CLASS}>{f.label}</span>
                <SubmittedRatingRead
                  variant="work"
                  value={pickRating(entry.ratings, f.key, f.legacyKey)}
                />
              </div>
            ))}
          </div>
        </ReportDetailSection>
        <ReportDetailSection title="Communication & collaboration">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {COMMUNICATION_COLLABORATION_FIELDS.map((f) => (
              <div
                key={f.key}
                className="flex flex-col gap-1.5 border-l-[3px] border-l-primary/25 bg-card pl-3 pr-2 py-2.5 rounded-r-lg border border-border/50"
              >
                <span className={REPORT_RATING_QUESTION_CLASS}>{f.label}</span>
                <SubmittedRatingRead
                  variant="communication"
                  value={pickRating(entry.ratings, f.key, f.legacyKey)}
                />
              </div>
            ))}
          </div>
        </ReportDetailSection>
      </div>
      <Separator className="my-2" />
      {entry.additional_feedback ? (
        <ReportDetailSection title="Additional feedback">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground font-medium border-2 border-border/50 rounded-lg bg-background px-3 py-3">
            {entry.additional_feedback}
          </p>
        </ReportDetailSection>
      ) : null}
      <ReportDetailSection title="Overall satisfaction">
        <OverallSatisfactionReadOnly value={Number(entry.overall_satisfaction ?? 0)} />
      </ReportDetailSection>
    </>
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
  const [activeDraft, setActiveDraft] = useState<FeedbackDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formLoadedFromDraft, setFormLoadedFromDraft] = useState(false);
  const draftLastSavedSignatureRef = useRef<string>("");
  /** When multiple periods are open, require an explicit period choice before showing the submit form. */
  const [pendingPeriodPicker, setPendingPeriodPicker] = useState(false);
  const historySortOrder: HistorySortOrder = "desc";
  const [historyScope, setHistoryScope] = useState<HistoryScope>("this-month");
  const [isFormPopupOpen, setIsFormPopupOpen] = useState(false);

  const managerEmail = user?.email || "";
  const resolvedInfoServicesManagerName = selfName.trim() || infoServicesReportingManagerName.trim();
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

  /** True if this row was submitted by the logged-in manager (not a prior manager after a reporting-line change). */
  const submissionIsFromCurrentManager = useCallback(
    (s: FeedbackSubmission) => {
      const mid = (s.manager_employee_id || "").trim();
      const me = (currentEmployeeId || "").trim();
      if (mid && me && mid === me) return true;
      const u = (managerEmail || "").trim().toLowerCase();
      const m = (s.manager_email || "").trim().toLowerCase();
      return Boolean(u && m && u === m);
    },
    [currentEmployeeId, managerEmail]
  );

  /** All submissions visible for the selected reportee (audit: includes prior manager’s rows). */
  const reporteeSubmissionsForManager = useMemo(() => {
    if (!showManagerEditor || !reporteeId) return [];
    const rid = String(reporteeId);
    return submissions.filter((s) => String(s.employee_id ?? "") === rid);
  }, [showManagerEditor, reporteeId, submissions]);

  /** Submissions by the current manager only — drives “open period still needs my feedback?” logic. */
  const mySubmissionsForReportee = useMemo(
    () => reporteeSubmissionsForManager.filter(submissionIsFromCurrentManager),
    [reporteeSubmissionsForManager, submissionIsFromCurrentManager]
  );

  const submissionCountByPeriodForReportee = useMemo(() => {
    const m = new Map<string, number>();
    mySubmissionsForReportee.forEach((s) => {
      m.set(s.period_id, (m.get(s.period_id) || 0) + 1);
    });
    return m;
  }, [mySubmissionsForReportee]);

  const sortedManagerSubmissions = useMemo(() => {
    return sortFeedbackEntries(reporteeSubmissionsForManager, historySortOrder);
  }, [reporteeSubmissionsForManager, historySortOrder]);

  const managerHistoryRows = useMemo(() => {
    return sortedManagerSubmissions.filter((entry) =>
      historyScope === "this-month" ? isInCurrentMonth(entry) : !isInCurrentMonth(entry)
    );
  }, [sortedManagerSubmissions, historyScope]);

  const submittedOpenPeriodIds = useMemo(() => {
    const set = new Set<string>();
    mySubmissionsForReportee.forEach((s) => {
      if (openPeriods.some((p) => p.period_id === s.period_id)) {
        set.add(s.period_id);
      }
    });
    return set;
  }, [mySubmissionsForReportee, openPeriods]);

  const pendingOpenPeriods = useMemo(
    () => openPeriods.filter((p) => !submittedOpenPeriodIds.has(p.period_id)),
    [openPeriods, submittedOpenPeriodIds]
  );

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
      const periodsArr = (periodsData || []) as Period[];
      setPeriods(periodsArr);
      if (reps.length) {
        const preferred =
          initialReporteeId && reps.some((r) => r.id === initialReporteeId) ? initialReporteeId : reps[0].id;
        setReporteeId(preferred);
      }
      const opens = periodsArr.filter((p) => p.period_status === "open");
      if (opens.length === 1) {
        setPeriodId(opens[0].period_id);
        setPendingPeriodPicker(false);
      } else if (opens.length > 1) {
        setPeriodId("");
        setPendingPeriodPicker(true);
      } else {
        setPeriodId("");
        setPendingPeriodPicker(false);
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
    setInfoServicesReportingManagerName(selfName || "");
    setAdditionalFeedback("");
    setOverallSatisfaction(3);
    setRatings(RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: 3 }), {} as Record<string, number>));
    const opens = periods.filter((p) => p.period_status === "open");
    if (opens.length > 1) {
      setPeriodId("");
      setPendingPeriodPicker(true);
    } else if (opens.length === 1) {
      setPeriodId(opens[0].period_id);
      setPendingPeriodPicker(false);
    } else {
      setPeriodId("");
      setPendingPeriodPicker(false);
    }
    setActiveDraft(null);
    setFormLoadedFromDraft(false);
    draftLastSavedSignatureRef.current = "";
  }, [periods, selfName]);

  const loadDraftForSelection = useCallback(async () => {
    if (!showManagerEditor || !periodId || !reporteeId || editingId) return;
    try {
      const params = new URLSearchParams({ period_id: periodId, employee_id: reporteeId });
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/drafts/active?${params.toString()}`);
      if (!res.ok) return;
      const draft = await res.json();
      if (!draft) {
        setActiveDraft(null);
        setFormLoadedFromDraft(false);
        draftLastSavedSignatureRef.current = "";
        return;
      }
      setActiveDraft(draft);
      setBillingStatus(draft.billing_status || "billable");
      setClientName(draft.client_name || "");
      setProjectName(draft.project_name || "");
      setClientReportingManagerName(draft.client_reporting_manager_name || "");
      setInfoServicesReportingManagerName(draft.info_services_reporting_manager_name || "");
      setAdditionalFeedback(draft.additional_feedback || "");
      setOverallSatisfaction(draft.overall_satisfaction || 3);
      const next: Record<string, number> = { ...ratings };
      RATING_FIELDS.forEach((f) => {
        next[f.key] = pickRating(draft.ratings, f.key, f.legacyKey) || 3;
      });
      setRatings(next);
      setStartedAt(draft.started_at || null);
      setFormLoadedFromDraft(true);
      const signature = JSON.stringify({
        period_id: periodId,
        employee_id: reporteeId,
        billing_status: draft.billing_status || "billable",
        client_name: draft.client_name || "",
        project_name: draft.project_name || "",
        client_reporting_manager_name: draft.client_reporting_manager_name || "",
        info_services_reporting_manager_name: draft.info_services_reporting_manager_name || "",
        additional_feedback: draft.additional_feedback || "",
        overall_satisfaction: draft.overall_satisfaction || 3,
        ratings: next,
      });
      draftLastSavedSignatureRef.current = signature;
    } catch {
      // keep resilient; draft support is additive
    }
  }, [showManagerEditor, periodId, reporteeId, editingId, ratings]);

  useEffect(() => {
    void loadDraftForSelection();
  }, [loadDraftForSelection]);

  const saveDraft = useCallback(async (opts?: { silent?: boolean }) => {
    if (!periodId || !reporteeId || !selectedReportee) {
      if (!opts?.silent) {
        toast({
          title: "Select period first",
          description: "Choose the month and reportee before saving a draft.",
          variant: "destructive",
        });
      }
      return;
    }
    if (editingId) {
      if (!opts?.silent) {
        toast({
          title: "Draft not available in edit mode",
          description: "You are editing a submitted record. Use Save changes or New submission.",
        });
      }
      return;
    }
    const signature = JSON.stringify({
      period_id: periodId,
      employee_id: selectedReportee.id,
      billing_status: billingStatus,
      client_name: clientName,
      project_name: projectName,
      client_reporting_manager_name: clientReportingManagerName,
      info_services_reporting_manager_name: resolvedInfoServicesManagerName,
      additional_feedback: additionalFeedback,
      overall_satisfaction: overallSatisfaction,
      ratings,
    });
    if (signature === draftLastSavedSignatureRef.current) return;
    setSavingDraft(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/drafts/active`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: periodId,
          employee_id: selectedReportee.id,
          employee_name: selectedReportee.name,
          employee_code: selectedReportee.employee_id,
          billing_status: billingStatus,
          client_name: clientName || undefined,
          project_name: projectName || undefined,
          client_reporting_manager_name: clientReportingManagerName || undefined,
          info_services_reporting_manager_name: resolvedInfoServicesManagerName || undefined,
          ratings,
          additional_feedback: additionalFeedback || undefined,
          overall_satisfaction: overallSatisfaction,
          started_at: startedAt || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to save draft");
      }
      const draft = await res.json();
      setActiveDraft(draft);
      setStartedAt(draft?.started_at || startedAt || new Date().toISOString());
      setFormLoadedFromDraft(true);
      draftLastSavedSignatureRef.current = signature;
      if (!opts?.silent) {
        toast({ title: "Draft saved" });
      }
    } catch {
      if (!opts?.silent) {
        toast({
          title: "Draft save failed",
          description: "Unable to save draft right now.",
          variant: "destructive",
        });
      }
    } finally {
      setSavingDraft(false);
    }
  }, [
    periodId,
    reporteeId,
    selectedReportee,
    editingId,
    billingStatus,
    clientName,
    projectName,
    clientReportingManagerName,
    infoServicesReportingManagerName,
    additionalFeedback,
    overallSatisfaction,
    ratings,
    startedAt,
    toast,
  ]);

  const onSaveDraft = async () => {
    await saveDraft({ silent: false });
  };

  const onSubmit = async () => {
    if (!periodId || !reporteeId || !clientName || !projectName || !clientReportingManagerName || !resolvedInfoServicesManagerName) {
      toast({
        title: "Missing required fields",
        description: "Please complete all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedReportee) return;
    if (editingId) {
      toast({
        title: "Submitted feedback is read-only",
        description: "Once submitted, feedback cannot be edited.",
        variant: "destructive",
      });
      return;
    }
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
        info_services_reporting_manager_name: resolvedInfoServicesManagerName,
        ratings,
        additional_feedback: additionalFeedback || undefined,
        overall_satisfaction: overallSatisfaction,
        ...(editingId ? {} : { started_at: new Date().toISOString() }),
      };

      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 409) {
          toast({
            title: "Already submitted for selected month",
            description: "Edit the existing record from Submission records.",
          });
          await loadSubmissions();
          return;
        }
        const text = await res.text();
        throw new Error(text || "Request failed");
      }
      toast({ title: "Feedback submitted successfully" });
      resetManagerForm();
      setActiveDraft(null);
      setFormLoadedFromDraft(false);
      draftLastSavedSignatureRef.current = "";
      await loadSubmissions();
    } catch {
      toast({
        title: "Submission failed",
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

  const sortedReporteeRows = useMemo(() => {
    return sortFeedbackEntries(reporteeRows, historySortOrder);
  }, [reporteeRows, historySortOrder]);

  const reporteeHistoryRows = useMemo(() => {
    return sortedReporteeRows.filter((entry) =>
      historyScope === "this-month" ? isInCurrentMonth(entry) : !isInCurrentMonth(entry)
    );
  }, [sortedReporteeRows, historyScope]);

  const showPeriodPickerStep =
    showManagerEditor && pendingPeriodPicker && !editingId && pendingOpenPeriods.length > 1;
  const showManagerFormCard =
    showManagerEditor && (Boolean(editingId) || (pendingOpenPeriods.length > 0 && !pendingPeriodPicker));
  const allOpenPeriodsSubmitted =
    showManagerEditor && !editingId && openPeriods.length > 0 && pendingOpenPeriods.length === 0;

  useEffect(() => {
    if (!showManagerEditor || editingId) return;
    if (pendingOpenPeriods.length === 0) {
      setPeriodId("");
      setPendingPeriodPicker(false);
      return;
    }
    if (pendingOpenPeriods.length === 1) {
      setPeriodId(pendingOpenPeriods[0].period_id);
      setPendingPeriodPicker(false);
      return;
    }
    if (!pendingOpenPeriods.some((p) => p.period_id === periodId)) {
      setPeriodId("");
      setPendingPeriodPicker(true);
    }
  }, [showManagerEditor, editingId, pendingOpenPeriods, periodId]);

  useEffect(() => {
    if (!showManagerEditor || !showManagerFormCard || !periodId || !reporteeId || editingId) return;
    // Start autosave only after a draft was loaded or manually saved once in this session.
    // Prevents creating empty drafts immediately on first form open.
    if (!activeDraft && !formLoadedFromDraft) return;
    const t = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, 25000);
    return () => window.clearTimeout(t);
  }, [
    showManagerEditor,
    showManagerFormCard,
    periodId,
    reporteeId,
    editingId,
    activeDraft,
    formLoadedFromDraft,
    billingStatus,
    clientName,
    projectName,
    clientReportingManagerName,
    resolvedInfoServicesManagerName,
    additionalFeedback,
    overallSatisfaction,
    ratings,
    saveDraft,
  ]);

  useEffect(() => {
    if (!showManagerFormCard) {
      setIsFormPopupOpen(false);
    }
  }, [showManagerFormCard]);

  useEffect(() => {
    if (!showManagerEditor) return;
    const next = selfName.trim();
    if (!next) return;
    if (infoServicesReportingManagerName === next) return;
    setInfoServicesReportingManagerName(next);
  }, [showManagerEditor, selfName, infoServicesReportingManagerName]);

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
            <CardTitle className={CRM_SECTION_TITLE_LG}>Organization-wide monthly feedback</CardTitle>
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
            <CardTitle className={cn(CRM_SECTION_TITLE_CARD, "flex items-center gap-2")}>
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

      {showManagerEditor && (
        <div className="flex flex-col gap-6">
          <div className="order-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={CRM_SECTION_TITLE_LG}>Submission records</h3>
                <p className="text-sm text-muted-foreground">
                  View current-month entries or earlier months. Open a row to review details, and use edit to load the
                  record into the form.
                </p>
              </div>
              <div className="inline-flex items-center rounded-lg border bg-background p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={historyScope === "this-month" ? "default" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setHistoryScope("this-month")}
                >
                  This month
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={historyScope === "previous-months" ? "default" : "ghost"}
                  className="h-8 px-3"
                  onClick={() => setHistoryScope("previous-months")}
                >
                  Previous months
                </Button>
              </div>
            </div>
            {managerHistoryRows.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {historyScope === "this-month"
                    ? "No submissions available for this month yet."
                    : "No submissions available from previous months yet."}
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="border rounded-lg bg-muted/10 px-2">
                {managerHistoryRows.map((entry) => {
                  const period = periodById.get(entry.period_id);
                  const closed = period?.period_status === "closed";
                  const isLatest = managerHistoryRows[0]?.id === entry.id;
                  return (
                    <AccordionItem key={entry.id} value={entry.id} className="border-border/60">
                      <AccordionTrigger className="py-3 hover:no-underline text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full pr-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{period?.label || "Period"}</span>
                            {historyScope === "this-month" && isLatest ? (
                              <Badge variant="secondary" className="text-[10px] font-medium">
                                Most recent
                              </Badge>
                            ) : null}
                            {closed ? (
                              <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                                <Lock className="h-3 w-3" /> Closed
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] font-normal">Open</Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              Submitted by{" "}
                              <span className="font-medium text-foreground">{entry.manager_name || "Unknown manager"}</span>
                              {entry.manager_email ? ` (${entry.manager_email})` : ""}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 justify-end">
                            <span className="text-xs text-muted-foreground">
                              Updated {formatDateTimeInIndia(entry.updated_at)}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              Overall {entry.overall_satisfaction}/5
                            </Badge>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pb-4 space-y-4 border-t pt-4">
                          <div className="flex justify-end">
                            <span className="text-xs text-muted-foreground">
                              Submitted by{" "}
                              <span className="font-medium text-foreground">{entry.manager_name || "previous manager"}</span>
                              {entry.manager_email ? ` (${entry.manager_email})` : ""}
                              . Submitted records are read-only.
                            </span>
                          </div>
                          <SubmissionDetailContent entry={entry} period={period} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>

          {showPeriodPickerStep && (
            <Card className="order-1 border-primary/30 bg-primary/5 shadow-md">
              <CardHeader>
                <CardTitle className={CRM_SECTION_TITLE_LG}>Select submission month</CardTitle>
                <CardDescription>
                  Multiple periods are open. Select the target month for this feedback form before continuing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup value={periodId} onValueChange={setPeriodId} className="gap-3">
                  {pendingOpenPeriods.map((p) => {
                    const count = submissionCountByPeriodForReportee.get(p.period_id) ?? 0;
                    return (
                      <label
                        key={p.period_id}
                        htmlFor={`period-${p.period_id}`}
                        className={cn(
                          "flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors",
                          periodId === p.period_id && "border-primary bg-primary/5 ring-1 ring-primary/25"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <RadioGroupItem value={p.period_id} id={`period-${p.period_id}`} className="mt-1" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-medium">{p.label}</div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                              <span>{formatPeriodRange(p)}</span>
                            </div>
                            <span className="inline-flex text-[11px] text-muted-foreground">
                              {count} record(s) for this reportee in this period (your submissions)
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={!periodId}
                  onClick={() => {
                    if (!periodId) {
                      toast({ title: "Select a period", variant: "destructive" });
                      return;
                    }
                    setPendingPeriodPicker(false);
                    setIsFormPopupOpen(true);
                  }}
                >
                  Continue to form
                </Button>
              </CardContent>
            </Card>
          )}

          {allOpenPeriodsSubmitted && (
            <Card className="order-1 border-border/70 bg-muted/20 shadow-sm">
              <CardContent className="py-6">
                <p className="text-sm font-medium">All open periods are already submitted for this reportee.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use <span className="font-medium text-foreground">Submission records</span> to review existing records.
                </p>
              </CardContent>
            </Card>
          )}

          {showManagerFormCard && (
            <>
              <Card className="order-2 border-border/60 bg-muted/10 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className={CRM_SECTION_TITLE_LG}>Feedback form</CardTitle>
                  <CardDescription>
                    Open the complete form in a focused popup and submit for the selected reportee.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => setIsFormPopupOpen(true)}>
                      {editingId ? "Open submission editor" : "Open feedback form"}
                    </Button>
                    {pendingOpenPeriods.length > 1 && !editingId && (
                      <Button type="button" variant="outline" onClick={resetManagerForm}>
                        Change submission month
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Dialog open={isFormPopupOpen} onOpenChange={setIsFormPopupOpen}>
                <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className={CRM_SECTION_TITLE_DIALOG}>{FORM_TITLE}</DialogTitle>
                    <DialogDescription>
                      Complete all sections below and submit for the selected month.
                    </DialogDescription>
                    <p className="text-xs text-muted-foreground">
                      Submitting as <span className="font-medium text-foreground">{selfName || "Manager"}</span>
                    </p>
                  </DialogHeader>

                  <div className="space-y-4">
                    <Card className="border-border/60">
                      <CardHeader className="py-3">
                        <CardTitle className={CRM_SECTION_TITLE_CARD}>Employee and assignment details</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Feedback period *</Label>
                            {pendingOpenPeriods.length > 1 && !editingId ? (
                              <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
                                <span className="font-medium">
                                  {periodId ? periodById.get(periodId)?.label ?? "—" : "—"}
                                </span>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Use the month selector above or &quot;Change submission month&quot; to switch.
                                </p>
                              </div>
                            ) : (
                              <>
                                <Select value={periodId} onValueChange={setPeriodId}>
                                  <SelectTrigger className="bg-background">
                                    <SelectValue placeholder="Select period" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {pendingOpenPeriods.map((p) => (
                                      <SelectItem key={p.period_id} value={p.period_id}>
                                        {p.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {pendingOpenPeriods.length === 0 && (
                                  <p className="text-xs text-muted-foreground">No open periods. HR will open a cycle when ready.</p>
                                )}
                              </>
                            )}
                          </div>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Employee name *</Label>
                                <div className="rounded-lg border border-primary/20 bg-muted/20 px-3 py-3 min-h-[2.75rem] flex items-center">
                                  <span className="text-sm font-semibold text-foreground">
                                    {selectedReportee?.name ?? "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Employee ID *</Label>
                                <div className="rounded-lg border border-primary/20 bg-muted/20 px-3 py-3 min-h-[2.75rem] flex items-center">
                                  <span className="text-sm font-semibold text-foreground">
                                    {selectedReportee?.employee_id?.trim() || "Not available"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60">
                      <CardHeader className="py-3">
                        <CardTitle className={CRM_SECTION_TITLE_CARD}>Engagement and project context</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
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
                          <div className="space-y-2">
                            <Label>Client reporting manager name *</Label>
                            <Input
                              value={clientReportingManagerName}
                              onChange={(e) => setClientReportingManagerName(e.target.value)}
                              className="bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Info Services reporting manager name *</Label>
                            <div className="rounded-lg border border-primary/20 bg-muted/20 px-3 py-3 min-h-[2.75rem] flex items-center">
                              <span className="text-sm font-semibold text-foreground">
                                {resolvedInfoServicesManagerName || "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-border/60">
                      <CardHeader className="space-y-2 border-b border-border/70 bg-muted/35 py-4">
                        <CardTitle className={CRM_SECTION_TITLE_LG}>Work Performance</CardTitle>
                        <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                          Please rate the employee on the following work performance parameters:
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-5 pt-4">
                        <RatingMatrixTable
                          fields={WORK_PERFORMANCE_FIELDS}
                          scale={WORK_PERFORMANCE_SCALE}
                          ratings={ratings}
                          onPick={(fieldKey, v) => setRatings((prev) => ({ ...prev, [fieldKey]: v }))}
                        />
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-border/60">
                      <CardHeader className="space-y-2 border-b border-border/70 bg-muted/35 py-4">
                        <CardTitle className={CRM_SECTION_TITLE_LG}>Communication & Collaboration</CardTitle>
                        <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                          Please rate the employee on the following communication and collaboration parameters:
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-5 pt-4">
                        <RatingMatrixTable
                          fields={COMMUNICATION_COLLABORATION_FIELDS}
                          scale={COMMUNICATION_COLLABORATION_SCALE}
                          ratings={ratings}
                          onPick={(fieldKey, v) => setRatings((prev) => ({ ...prev, [fieldKey]: v }))}
                        />
                      </CardContent>
                    </Card>

                    <Card className="border-border/60">
                      <CardHeader className="py-3">
                        <CardTitle className={CRM_SECTION_TITLE_CARD}>Overall satisfaction and comments</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-4">
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
                        <div className="space-y-2">
                          <Label>Overall satisfaction with employee performance *</Label>
                          <OverallSatisfactionStarRow value={overallSatisfaction} onChange={setOverallSatisfaction} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onSaveDraft}
                      disabled={savingDraft || submitting || !periodId || !reporteeId || !!editingId}
                    >
                      {savingDraft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save draft
                    </Button>
                    <Button
                      onClick={onSubmit}
                      disabled={submitting || (!editingId && pendingOpenPeriods.length === 0) || !periodId}
                      size="lg"
                      className="min-w-[160px]"
                    >
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingId ? "Save changes" : "Submit feedback"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        {!showManagerEditor && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className={CRM_SECTION_TITLE_LG}>
                {isLeadership
                  ? "Your feedback (read-only)"
                  : clientRmSurface === "self"
                    ? "Feedback from your line manager"
                    : "Feedback records"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isLeadership
                  ? "Organization-wide reporting is available from Monthly Feedback reports."
                  : clientRmSurface === "self"
                    ? "Your line manager submits this assessment. Read-only here. To give feedback for a direct report, use Client RM Feedback on their card under My Team."
                    : "Submitted by your reporting manager. This view is read-only for employees."}{" "}
                Expand a row to view details. Closed periods are labeled and kept for audit.
              </p>
            </div>
            <div className="inline-flex items-center rounded-lg border bg-background p-1">
              <Button
                type="button"
                size="sm"
                variant={historyScope === "this-month" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setHistoryScope("this-month")}
              >
                This month
              </Button>
              <Button
                type="button"
                size="sm"
                variant={historyScope === "previous-months" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setHistoryScope("previous-months")}
              >
                Previous months
              </Button>
            </div>
          </div>
        )}
        {!showManagerEditor && reporteeHistoryRows.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {historyScope === "this-month"
                  ? "No feedback records available for this month."
                  : "No feedback records available from previous months."}
              </CardContent>
            </Card>
          ) : !showManagerEditor ? (
            <Accordion type="multiple" className="border rounded-lg bg-muted/10 px-2">
              {reporteeHistoryRows.map((entry) => {
                const period = periodById.get(entry.period_id);
                const closed = period?.period_status === "closed";
                const isLatest = reporteeHistoryRows[0]?.id === entry.id;
                return (
                  <AccordionItem key={entry.id} value={entry.id} className="border-border/60">
                    <AccordionTrigger className="py-3 hover:no-underline text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{period?.label || "Feedback period"}</span>
                          {historyScope === "this-month" && isLatest ? (
                            <Badge variant="secondary" className="text-[10px] font-medium">
                              Most recent
                            </Badge>
                          ) : null}
                          {closed ? (
                            <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                              <Lock className="h-3 w-3" /> Closed
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] font-normal">Open</Badge>
                          )}
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            · Updated {formatDateTimeInIndia(entry.updated_at)}
                          </span>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          Overall {entry.overall_satisfaction}/5
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pb-4 space-y-6 border-t pt-4">
                        <SubmissionDetailContent entry={entry} period={period} />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : null}
      </div>

      {isAdmin && hasTeamMembers && (
        <p className="text-xs text-muted-foreground">
          Administrators with direct reports can submit here; use Monthly Feedback reports for organization-wide exports.
        </p>
      )}
    </div>
  );
}
