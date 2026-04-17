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
import { ArrowLeft } from "lucide-react";

type Props = {
  /** Allowlisted hint from query `from=` — controls primary back navigation. */
  fromHint: SessionFromHint | null;
  reporteeName: string | null;
  onPrimaryBack: () => void;
};

/**
 * Enterprise shell for the manager Client RM feedback session page:
 * breadcrumbs and primary back action.
 */
export function ClientRmFeedbackSessionChrome({
  fromHint,
  reporteeName,
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
    </div>
  );
}
