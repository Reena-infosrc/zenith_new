import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeedbackRelatedLink } from "@/components/performance/FeedbackRelatedLink";
import {
  CLIENT_RM_FEEDBACK_ROUTES,
  sessionPrimaryBackButtonLabel,
  type SessionFromHint,
} from "@/lib/client-rm-feedback-routes";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  LayoutGrid,
  Target,
  Users,
} from "lucide-react";

type Props = {
  /** Allowlisted hint from query `from=` — controls primary back navigation. */
  fromHint: SessionFromHint | null;
  reporteeName: string | null;
  managerDisplayName?: string | null;
  isAdmin?: boolean;
  isLeadership?: boolean;
  onPrimaryBack: () => void;
};

/**
 * Enterprise shell for the manager Client RM feedback session page:
 * breadcrumbs, primary back action, and cross-links to Performance, reports, and directory.
 */
export function ClientRmFeedbackSessionChrome({
  fromHint,
  reporteeName,
  managerDisplayName,
  isAdmin,
  isLeadership,
  onPrimaryBack,
}: Props) {
  const canOpenMonthlyReports = Boolean(isAdmin || isLeadership);
  const currentTitle = reporteeName?.trim()
    ? `Feedback · ${reporteeName.trim()}`
    : "Submit Client RM feedback";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={CLIENT_RM_FEEDBACK_ROUTES.home}>Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-team")}>
                    Performance
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate max-w-[min(100%,28rem)]">
                  {currentTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Monthly Client RM feedback</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Submit structured feedback for a direct report for the active monthly period. Records are
              versioned per period and submission; certain edits retain snapshots for audit.
            </p>
            {managerDisplayName?.trim() ? (
              <p className="text-xs text-muted-foreground mt-2">
                Signed in as <span className="text-foreground/90 font-medium">{managerDisplayName.trim()}</span>
              </p>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant="default"
          className="shrink-0 gap-2 self-start"
          onClick={onPrimaryBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {sessionPrimaryBackButtonLabel(fromHint)}
        </Button>
      </div>

      <Card className="border-border/80 bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden />
            Related pages
          </CardTitle>
          <CardDescription>
            Quick navigation — same feedback data across reporting and Performance, with role-appropriate views.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav aria-label="Related navigation" className="grid gap-2 sm:grid-cols-2">
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-team")}
              icon={<Users className="h-4 w-4" />}
              title="Performance · My Team"
              subtitle="Direct reports, goals, and Client RM entry points"
            />
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-goals")}
              icon={<Target className="h-4 w-4" />}
              title="Performance · My Goals"
              subtitle="Your goals and feedback shown to you by your manager"
            />
            {canOpenMonthlyReports ? (
              <FeedbackRelatedLink
                href={CLIENT_RM_FEEDBACK_ROUTES.monthlyReports}
                icon={<BarChart3 className="h-4 w-4" />}
                title="Monthly feedback reports"
                subtitle="Organization view for HR and leadership"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
                <BarChart3 className="h-4 w-4 shrink-0 mt-0.5 opacity-60" aria-hidden />
                <span>
                  Monthly feedback reports are available to HR and leadership. Use My Team to submit for your
                  direct reports.
                </span>
              </div>
            )}
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.directory}
              icon={<Building2 className="h-4 w-4" />}
              title="Directory"
              subtitle="Look up employees and reporting relationships"
            />
          </nav>

          <Separator />

          <p className="text-xs text-muted-foreground leading-relaxed">
            Tip: bookmark this page with the reportee in the address bar, or return via{" "}
            <span className="text-foreground/90">Performance → My Team → Client RM Feedback</span> on a team card.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
