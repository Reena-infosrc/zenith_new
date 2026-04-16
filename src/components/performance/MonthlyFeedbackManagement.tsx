import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Eye, Loader2, Search, Star } from "lucide-react";

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

const RATING_FIELDS: { key: string; label: string }[] = [
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
  { key: "business_domain_understanding", label: "Business/Domain Understanding" },
  { key: "status_reporting_updates", label: "Status Reporting and Updates" },
  { key: "team_collaboration", label: "Team Collaboration" },
  { key: "participation_in_discussions", label: "Participation in Discussions" },
];

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value || 0));
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={i <= v ? "h-4 w-4 fill-amber-500 text-amber-500" : "h-4 w-4 text-muted-foreground/30"}
        />
      ))}
      <span className="text-sm font-semibold text-muted-foreground ml-2">{v}/5</span>
    </div>
  );
}

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
  { key: "business_domain_understanding", header: "Business/Domain Understanding" },
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
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("all");
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FeedbackSubmission | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [periodsRes, submissionsRes] = await Promise.all([
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/periods`),
        authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions`),
      ]);
      const periodsData = periodsRes.ok ? await periodsRes.json() : [];
      const submissionsData = submissionsRes.ok ? await submissionsRes.json() : [];
      setPeriods(Array.isArray(periodsData) ? periodsData : []);
      setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
    } finally {
      setLoading(false);
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
      const ratings = x.ratings || {};
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
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle>Monthly Feedback Periods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monthly feedback periods created yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {periods.map((p) => (
                <div key={p.period_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{p.label}</div>
                    {statusBadge(p.period_status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.start_date} → {p.end_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle>Monthly Feedback History</CardTitle>
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

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>
                      <div className="font-medium">{x.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{x.employee_code || x.employee_id}</div>
                    </TableCell>
                    <TableCell>{x.client_name}</TableCell>
                    <TableCell>{x.project_name}</TableCell>
                    <TableCell>{x.manager_name}</TableCell>
                    <TableCell className="text-right font-semibold">{x.overall_satisfaction}/5</TableCell>
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
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
            <DialogTitle>Monthly Feedback (Read-only)</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Employee & Context</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Employee</Label>
                    <div className="mt-1 font-medium">{selected.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{selected.employee_code || selected.employee_id}</div>
                  </div>
                  <div>
                    <Label>Submitted by</Label>
                    <div className="mt-1 font-medium">{selected.manager_name}</div>
                    <div className="text-xs text-muted-foreground">{selected.manager_email || "—"}</div>
                  </div>
                  <div>
                    <Label>Billing Status</Label>
                    <div className="mt-1">{selected.billing_status}</div>
                  </div>
                  <div>
                    <Label>Period</Label>
                    <div className="mt-1">{selectedPeriod?.label || selected.period_id}</div>
                  </div>
                  <div>
                    <Label>Client Name</Label>
                    <div className="mt-1">{selected.client_name}</div>
                  </div>
                  <div>
                    <Label>Project Name</Label>
                    <div className="mt-1">{selected.project_name}</div>
                  </div>
                  <div>
                    <Label>Client Reporting Manager Name</Label>
                    <div className="mt-1">{selected.client_reporting_manager_name || "—"}</div>
                  </div>
                  <div>
                    <Label>Info Services Reporting Manager Name</Label>
                    <div className="mt-1">{selected.info_services_reporting_manager_name || "—"}</div>
                  </div>
                  <div>
                    <Label>Completion time</Label>
                    <div className="mt-1">{selected.submitted_at || "—"}</div>
                  </div>
                  <div>
                    <Label>Last modified time</Label>
                    <div className="mt-1">{selected.updated_at || "—"}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ratings</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {RATING_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label>{f.label}</Label>
                      <Stars value={Number(selected.ratings?.[f.key] || 0)} />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <Label>Overall Satisfaction with Employee Performance</Label>
                    <div className="mt-2">
                      <Stars value={Number(selected.overall_satisfaction || 0)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Additional Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selected.additional_feedback || "—"}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

