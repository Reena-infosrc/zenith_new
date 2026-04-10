import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight } from "lucide-react";
import { normalizeGoalStatus } from "@/utils/goal-status";

/** High-contrast pills: yellow = draft/pending, green = active, red/orange = attention, emerald = done */
const statusStyles: Record<string, string> = {
  completed:
    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-100 border-2 border-emerald-500/55 shadow-sm",
  in_progress:
    "bg-green-600/15 text-green-800 dark:text-green-100 border-2 border-green-500/60 shadow-sm",
  pending_manager_approval:
    "bg-orange-500/15 text-orange-900 dark:text-orange-100 border-2 border-orange-500/55 shadow-sm",
  manager_reopened:
    "bg-red-500/15 text-red-900 dark:text-red-100 border-2 border-red-500/55 shadow-sm",
  pending:
    "bg-amber-400/20 text-amber-950 dark:text-amber-50 border-2 border-amber-500/65 shadow-sm"
};

const statusLabel = (status: string) => {
  switch (normalizeGoalStatus(status)) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "pending_manager_approval":
      return "Pending Approval";
    case "manager_reopened":
      return "Reopened";
    default:
      return "Pending";
  }
};

export interface GoalSummary {
  id: string;
  title: string;
  completion: number;
  status: string;
  targetDate?: string;
  category?: string;
}

interface GoalSummaryCardProps {
  goal: GoalSummary;
  onOpen: (goal: GoalSummary, trigger: HTMLButtonElement | null) => void;
  className?: string;
  disabled?: boolean;
  isOpen?: boolean;
  controlsId?: string;
}

export const GoalSummaryCard = forwardRef<HTMLButtonElement, GoalSummaryCardProps>(
  ({ goal, onOpen, className, disabled = false, isOpen = false, controlsId }, ref) => {
    const internalRef = useRef<HTMLButtonElement | null>(null);

    useImperativeHandle(ref, () => internalRef.current, []);

    const roundedCompletion = Math.round(goal.completion);
    const normalizedStatus = normalizeGoalStatus(goal.status);

    return (
      <button
        ref={internalRef}
        type="button"
        disabled={disabled}
        onClick={() => onOpen(goal, internalRef.current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(goal, internalRef.current);
          }
        }}
        className={cn(
          "group relative w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm px-5 py-4 text-left shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 overflow-hidden",
          disabled && "opacity-60 cursor-not-allowed",
          isOpen && "border-primary/60 shadow-xl shadow-primary/10",
          className
        )}
        aria-expanded={isOpen}
        aria-controls={controlsId}
      >
        {/* Hover gradient overlay */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        
        <div className="relative flex flex-col gap-4">
          {/* Header Section */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-base font-bold text-foreground break-words leading-tight group-hover:text-primary transition-colors">
                {goal.title}
              </p>
              {goal.category && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] font-semibold capitalize px-2.5 py-0.5 bg-gradient-to-r from-primary/15 to-primary/8 text-primary border-primary/25 shadow-sm"
                >
                  {goal.category}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="relative flex h-12 w-12 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) ${roundedCompletion * 3.6}deg, hsl(var(--muted)) 0deg)`
                  }}
                />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm">
                  <span className="text-xs font-bold text-primary">
                    {roundedCompletion}%
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/60 transition-all duration-200 group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </div>

          {/* Status — large, high-contrast pill */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "rounded-lg border-2 text-sm font-semibold px-3.5 py-1.5 min-h-9 leading-tight tracking-tight",
                statusStyles[normalizedStatus] ?? statusStyles.pending
              )}
            >
              {statusLabel(normalizedStatus)}
            </Badge>
          </div>

          {/* Progress Section */}
          <div className="space-y-2.5">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/40 border border-border/20">
              <div 
                className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary rounded-full transition-all duration-500 ease-out shadow-sm shadow-primary/20"
                style={{ width: `${Math.min(goal.completion, 100)}%` }}
              />
            </div>
            {goal.targetDate && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-medium">Due {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        </div>
      </button>
    );
  }
);

GoalSummaryCard.displayName = "GoalSummaryCard";
