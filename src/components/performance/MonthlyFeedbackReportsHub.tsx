import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { REPORT_PAGE_TITLE } from "@/components/performance/monthly-feedback-report-primitives";
import { CLIENT_RM_FEEDBACK_ROUTES } from "@/lib/client-rm-feedback-routes";

/**
 * Leadership / HR reports surface for Monthly feedback — breadcrumbs to Performance and Home.
 */
export function MonthlyFeedbackReportsHub() {
  return (
    <div className="space-y-6 mb-8">
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
              <Link to={CLIENT_RM_FEEDBACK_ROUTES.performanceManager()}>Performance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Monthly feedback</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className={REPORT_PAGE_TITLE}>Monthly feedback</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Organization-wide visibility into periods, submissions, and exports. Line managers submit feedback from
          Performance → My Team; records are keyed by period and submission with optional edit snapshots.
        </p>
      </div>
    </div>
  );
}
