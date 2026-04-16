import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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
  manager_name: string;
  updated_at: string;
  billing_status: string;
  client_name: string;
  project_name: string;
  additional_feedback?: string;
  ratings: Record<string, number>;
  overall_satisfaction: number;
};

const ratingFields: { key: string; label: string }[] = [
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

type Props = {
  currentEmployeeId?: string | null;
};

export function ClientRMFeedbackTab({ currentEmployeeId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [reportees, setReportees] = useState<Reportee[]>([]);
  const [canViewAll, setCanViewAll] = useState(false);
  const [hasTeamMembers, setHasTeamMembers] = useState(false);
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
  const [ratings, setRatings] = useState<Record<string, number>>(
    ratingFields.reduce((acc, field) => ({ ...acc, [field.key]: 3 }), {})
  );

  const selectedReportee = useMemo(
    () => reportees.find((r) => r.id === reporteeId),
    [reportees, reporteeId]
  );

  const openPeriods = useMemo(
    () => periods.filter((p) => p.period_status === "open"),
    [periods]
  );

  const loadData = async () => {
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
      setReportees(contextData.reportees || []);
      setPeriods(periodsData || []);
      if (contextData.reportees?.length) {
        setReporteeId(contextData.reportees[0].id);
      }
      if (periodsData?.length) {
        const open = periodsData.find((p: Period) => p.period_status === "open");
        if (open) {
          setPeriodId(open.period_id);
        }
      }
    } catch (error) {
      toast({
        title: "Unable to load feedback module",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async () => {
    try {
      const params = new URLSearchParams();
      if (!canViewAll && currentEmployeeId) params.set("employee_id", currentEmployeeId);
      const res = await authenticatedFetch(
        `${API_BASE_URL}/client-rm-feedback/submissions${params.toString() ? `?${params.toString()}` : ""}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch {
      // keep view resilient
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [canViewAll, currentEmployeeId]);

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
      const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Submit failed");
      }
      toast({ title: "Feedback submitted successfully" });
      setAdditionalFeedback("");
      await loadSubmissions();
    } catch (error) {
      toast({
        title: "Submission failed",
        description: "Unable to submit feedback right now.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading client RM feedback...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {(hasTeamMembers || canViewAll) && (
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle>Submit Client Reporting Manager Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Feedback Period *</Label>
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                  <SelectContent>
                    {openPeriods.map((p) => (
                      <SelectItem key={p.period_id} value={p.period_id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employee *</Label>
                <Select value={reporteeId} onValueChange={setReporteeId}>
                  <SelectTrigger><SelectValue placeholder="Select reportee" /></SelectTrigger>
                  <SelectContent>
                    {reportees.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Billing Status *</Label>
                <Select value={billingStatus} onValueChange={setBillingStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billable">Billable Resource</SelectItem>
                    <SelectItem value="non_billable">Non-Billable Resource</SelectItem>
                    <SelectItem value="internal">Internal Resource</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Client Name *</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Client Reporting Manager Name *</Label>
                <Input value={clientReportingManagerName} onChange={(e) => setClientReportingManagerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Info Services Reporting Manager Name *</Label>
                <Input value={infoServicesReportingManagerName} onChange={(e) => setInfoServicesReportingManagerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Overall Satisfaction *</Label>
                <Select value={String(overallSatisfaction)} onValueChange={(v) => setOverallSatisfaction(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((v) => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ratingFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label} *</Label>
                  <Select value={String(ratings[field.key] || 3)} onValueChange={(v) => setRatings((prev) => ({ ...prev, [field.key]: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((v) => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Any additional feedback or suggestions?</Label>
              <Textarea value={additionalFeedback} onChange={(e) => setAdditionalFeedback(e.target.value)} rows={4} />
            </div>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Feedback
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle>Feedback Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {submissions.length === 0 && (
            <p className="text-sm text-muted-foreground">No feedback records found.</p>
          )}
          {submissions.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium">{entry.employee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.client_name} - {entry.project_name}
                  </p>
                </div>
                <Badge variant="secondary">Overall: {entry.overall_satisfaction}/5</Badge>
              </div>
              {entry.additional_feedback && (
                <p className="text-sm text-muted-foreground">{entry.additional_feedback}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
