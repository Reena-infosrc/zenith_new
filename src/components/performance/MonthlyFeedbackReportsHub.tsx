import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  REPORT_CARD_HEADER_BAND,
  REPORT_CARD_TITLE,
  REPORT_PAGE_TITLE,
} from "@/components/performance/monthly-feedback-report-primitives";
import { FeedbackRelatedLink } from "@/components/performance/FeedbackRelatedLink";
import { CLIENT_RM_FEEDBACK_ROUTES } from "@/lib/client-rm-feedback-routes";
import { Building2, LayoutGrid, Target, UserCircle, Users } from "lucide-react";

/**
 * Leadership / HR reports surface for monthly Client RM feedback — breadcrumbs and cross-links
 * back to Performance and Directory so navigation matches the manager submit session page.
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
              <Link to={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-team")}>Performance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Monthly feedback reports</BreadcrumbPage>
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

      <Card className="overflow-hidden border-border/80 bg-muted/25 shadow-md">
        <CardHeader className={REPORT_CARD_HEADER_BAND}>
          <CardTitle className={cn(REPORT_CARD_TITLE, "flex items-center gap-2")}>
            <LayoutGrid className="h-5 w-5 text-primary shrink-0" aria-hidden />
            Related pages
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Navigate to manager workflows or the employee directory without losing context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav aria-label="Related navigation" className="grid gap-2 sm:grid-cols-2">
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-team")}
              icon={<Users className="h-4 w-4" />}
              title="Performance · My Team"
              subtitle="Where managers open Client RM feedback for each direct report"
            />
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-goals")}
              icon={<Target className="h-4 w-4" />}
              title="Performance · My Goals"
              subtitle="Personal goals and feedback from your own line manager"
            />
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.performanceUser}
              icon={<UserCircle className="h-4 w-4" />}
              title="Performance · Employee view"
              subtitle="Individual goals and reviews (non-manager workspace)"
            />
            <FeedbackRelatedLink
              href={CLIENT_RM_FEEDBACK_ROUTES.directory}
              icon={<Building2 className="h-4 w-4" />}
              title="Directory"
              subtitle="Org chart and employee lookup"
            />
          </nav>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Use <span className="font-medium text-foreground/90">from=reports</span> on the manager session URL to
            return here from the primary Back action.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
