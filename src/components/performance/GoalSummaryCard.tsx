import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight } from "lucide-react";

const statusStyles: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  pending_manager_approval: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  manager_reopened: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pending: "bg-muted text-muted-foreground border-border/60"
};

const statusLabel = (status: string) => {
  switch (status) {
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
          "group w-full rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
          disabled && "opacity-60 cursor-not-allowed",
          className
        )}
        aria-expanded={isOpen}
        aria-controls={controlsId}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground break-words">{goal.title}</p>
              {goal.category && (
                <Badge 
                  variant="outline" 
                  className="text-[11px] font-medium capitalize"
                  style={{
                    backgroundColor: "hsl(196 100% 47% / 0.1)",
                    color: "hsl(196 100% 47%)",
                    borderColor: "hsl(196 100% 47% / 0.2)"
                  }}
                >
                  {goal.category}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {roundedCompletion}%
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("border text-[11px] font-medium", statusStyles[goal.status] ?? statusStyles.pending)}>
              {statusLabel(goal.status)}
            </Badge>
          </div>
          <div className="space-y-2">
            <div 
              className="relative h-2 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "#00B0F0" }}
            >
              {goal.completion > 0 && (
                <div 
                  className="h-full transition-all bg-green-500"
                  style={{ width: `${Math.min(goal.completion, 100)}%` }}
                />
              )}
            </div>
            {goal.targetDate && (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Due {new Date(goal.targetDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  }
);

GoalSummaryCard.displayName = "GoalSummaryCard";
