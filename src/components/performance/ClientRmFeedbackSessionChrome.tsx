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
import {
  CLIENT_RM_FEEDBACK_ROUTES,
  sessionPrimaryBackButtonLabel,
  type SessionFromHint,
} from "@/lib/client-rm-feedback-routes";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Building2,
  Target,
  Users,
} from "lucide-react";

type Props = {
  /** Allowlisted hint from query `from=` — controls primary back navigation. */
  fromHint: SessionFromHint | null;
  reporteeName: string | null;
  managerDisplayName?: string | null;
  canOpenMonthlyReports?: boolean;
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
  canOpenMonthlyReports,
  onPrimaryBack,
}: Props) {
  const currentTitle = reporteeName?.trim()
    ? `Feedback · ${reporteeName.trim()}`
    : "Submit Client RM feedback";

  return (
    <div className="space-y-5">
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
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Monthly Client RM feedback
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
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

      <nav aria-label="Related navigation" className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-team")} className="gap-1.5">
            <Users className="h-4 w-4" />
            My Team
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-goals")} className="gap-1.5">
            <Target className="h-4 w-4" />
            My Goals
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Link>
        </Button>
        {canOpenMonthlyReports ? (
          <Button asChild variant="outline" size="sm">
            <Link to={CLIENT_RM_FEEDBACK_ROUTES.monthlyReports} className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Monthly reports
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link to={CLIENT_RM_FEEDBACK_ROUTES.directory} className="gap-1.5">
            <Building2 className="h-4 w-4" />
            Directory
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </Link>
        </Button>
      </nav>
    </div>
  );
}
