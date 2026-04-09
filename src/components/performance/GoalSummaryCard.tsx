import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight } from "lucide-react";

const statusStyles: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  pending_manager_approval: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  manager_reopened: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pending: "bg-muted text-muted-foreground border-border/60"
};

function PendingApprovalRibbon() {
  return (
    <>
      {/* Animated left-edge accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl z-10 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, #3b82f6, #2563eb, #1d4ed8)",
          animation: "pulse-glow 2s ease-in-out infinite",
        }}
      />
      {/* Corner ribbon */}
      <div className="absolute -top-[2px] -right-[2px] z-10 overflow-hidden w-28 h-28 pointer-events-none">
        <div
          className="absolute top-[14px] -right-[6px] w-[150%] text-center rotate-45 origin-center"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 40%, #1d4ed8 100%)",
            boxShadow: "0 4px 14px rgba(37, 99, 235, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            padding: "6px 0",
          }}
        >
          <span className="text-white text-[9px] font-bold uppercase tracking-wider drop-shadow-sm">
            Pending Approval
          </span>
        </div>
        {/* Corner fold triangles */}
        <div
          className="absolute top-0 right-[88px] w-0 h-0"
          style={{ borderStyle: "solid", borderWidth: "0 8px 8px 0", borderColor: "transparent #1e3a8a transparent transparent", opacity: 0.5 }}
        />
        <div
          className="absolute top-[88px] right-0 w-0 h-0"
          style={{ borderStyle: "solid", borderWidth: "0 0 8px 8px", borderColor: "transparent transparent transparent #1e3a8a", opacity: 0.5 }}
        />
      </div>
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 4px rgba(59, 130, 246, 0.3); }
          50% { opacity: 1; box-shadow: 0 0 10px rgba(59, 130, 246, 0.6); }
        }
      `}</style>
    </>
  );
}

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
          "group relative w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm px-5 py-4 text-left shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 overflow-hidden",
          disabled && "opacity-60 cursor-not-allowed",
          isOpen && "border-primary/60 shadow-xl shadow-primary/10",
          (goal.status === "pending" || goal.status === "pending_manager_approval") && "border-blue-400/40 shadow-blue-500/5",
          className
        )}
        aria-expanded={isOpen}
        aria-controls={controlsId}
      >
        {/* Corner ribbon for goals awaiting manager approval */}
        {(goal.status === "pending" || goal.status === "pending_manager_approval") && <PendingApprovalRibbon />}

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

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge className={cn(
              "border text-[10px] font-semibold px-2.5 py-1 shadow-sm",
              statusStyles[goal.status] ?? statusStyles.pending
            )}>
              {statusLabel(goal.status)}
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
