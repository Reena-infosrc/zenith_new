import { useState, useMemo, useEffect, type CSSProperties } from "react";
import {
  Target,
  Calendar,
  Briefcase,
  Eye,
  ChevronLeft,
  Plus,
  Trash2,
  Edit,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GoalCard, Milestone } from "./GoalCard";
import { cn } from "@/lib/utils";

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
};

export interface TeamMemberGoalsCardProps {
  employee: {
    id: string;
    name: string;
    position: string;
    department: string;
    yearsOfExperience?: number;
    experienceYears?: number;
    skills?: string[];
  };
  summary: {
    total: number;
    active: number;
    completed: number;
  };
  goals: Array<{
    id: string;
    title: string;
    description?: string;
    category: string;
    targetDate: string;
    status: string;
    completion: number;
    milestones?: Milestone[];
    managerApproved?: boolean;
    managerReopened?: boolean;
  }>;
  isLoading: boolean;
  onFetchGoals: () => Promise<void>;
  onSetGoals: () => void;
  onAddGoal: () => void;
  onEditGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onMilestoneClick?: (goalId: string, milestone: Milestone) => void;
  onAddMilestone?: (goalId: string) => void;
}

export function TeamMemberGoalsCard({
  employee,
  summary,
  goals,
  isLoading,
  onFetchGoals,
  onSetGoals,
  onAddGoal,
  onEditGoal,
  onDeleteGoal,
  onMilestoneClick,
  onAddMilestone
}: TeamMemberGoalsCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);

  const experienceLabel = useMemo(() => {
    const years = employee.yearsOfExperience ?? employee.experienceYears ?? 0;
    return `${years} year${years === 1 ? "" : "s"} exp.`;
  }, [employee.experienceYears, employee.yearsOfExperience]);
  const skills = useMemo(() => employee.skills ?? [], [employee.skills]);

  const handleFlip = async () => {
    if (!isFlipped && (isFetching || isLoading)) {
      return;
    }

    if (!isFlipped) {
      try {
        setIsFetching(true);
        await onFetchGoals();
      } finally {
        setIsFetching(false);
      }
    } else {
      setExpandedGoalIds([]);
    }

    setIsFlipped((prev) => !prev);
  };

  const handleFrontKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleFlip();
    }
  };

  const renderFront = () => (
    <div
      className="flex h-full flex-col gap-4 p-6 min-w-0 overflow-hidden"
      role="button"
      tabIndex={0}
      onKeyDown={handleFrontKeyDown}
      onClick={() => handleFlip()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 text-lg font-semibold text-primary">
              {employee.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold break-words">{employee.name}</h3>
              <p className="text-sm text-muted-foreground break-words">{employee.position}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground break-words min-w-0">{employee.department}</span>
        </div>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground break-words min-w-0">{experienceLabel}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {skills.slice(0, 3).map((skill, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs break-words">
              {skill}
            </Badge>
          ))}
          {skills.length > 3 && (
            <Badge variant="secondary" className="text-xs break-words">
              +{skills.length - 3}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border/50 p-4">
          <div className="flex items-center justify-between text-sm gap-2 min-w-0">
            <span className="text-muted-foreground flex-shrink-0">Goals Status</span>
            <div className="flex gap-2 flex-wrap justify-end min-w-0">
              {summary.total > 0 ? (
                <>
                  {summary.active > 0 && (
                    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20 whitespace-nowrap">
                      {summary.active} Active
                    </Badge>
                  )}
                  {summary.completed > 0 && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 whitespace-nowrap">
                      {summary.completed} Completed
                    </Badge>
                  )}
                  {summary.total > 0 && summary.active === 0 && summary.completed === 0 && (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20 whitespace-nowrap">
                      {summary.total} Goal{summary.total !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20 whitespace-nowrap">
                  No Goals
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            className="flex-1 min-w-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            onClick={(e) => {
              e.stopPropagation();
              handleFlip();
            }}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            ) : (
              <Eye className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="ml-2 truncate">{isFlipped ? "Hide Goals" : summary.total > 0 ? `View Goals (${summary.total})` : "View Goals"}</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onSetGoals();
            }}
          >
            <Target className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="whitespace-nowrap">Set Goals</span>
          </Button>
        </div>
      </div>
    </div>
  );

  const renderBack = () => (
    <div className="flex h-full flex-col gap-4 p-6 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full border-border/60 text-muted-foreground hover:bg-primary/5 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative flex h-14 w-14 items-center justify-center flex-shrink-0">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${goals.length ? Math.max(Math.round(goals.reduce((sum, g) => sum + g.completion, 0) / goals.length), 0) : 0}%, hsl(var(--muted)) 0)`
              }}
            />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-background">
              <span className="text-sm font-semibold">
                {goals.length
                  ? Math.round(goals.reduce((sum, g) => sum + g.completion, 0) / goals.length)
                  : 0}%
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold break-words">Team Goals</h4>
            <p className="text-xs text-muted-foreground break-words">Overview of active goals & milestones</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {(isLoading || isFetching) ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading goals...</p>
            </div>
          </div>
        ) : goals.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border/60 rounded-lg">
            <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-3">No goals set for this employee yet.</p>
            <Button onClick={onAddGoal} className="bg-gradient-to-r from-primary to-primary/80">
              <Plus className="h-4 w-4 mr-2" />
              Set First Goal
            </Button>
          </div>
        ) : (
          goals.map((goal) => {
            const isExpanded = expandedGoalIds.includes(goal.id);
            const roundedCompletion = Math.round(goal.completion);

            return (
              <div
                key={goal.id}
                className="rounded-lg border border-border/60 bg-background/60 shadow-sm"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedGoalIds((prev) =>
                      prev.includes(goal.id)
                        ? prev.filter((id) => id !== goal.id)
                        : [...prev, goal.id]
                    );
                  }}
                  className={cn(
                    "w-full rounded-lg border border-transparent bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                    isExpanded && "border-primary/40"
                  )}
                  aria-expanded={isExpanded}
                >
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <span className="text-sm font-semibold text-foreground break-words flex-1 min-w-0">
                        {goal.title}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary flex-shrink-0 whitespace-nowrap">
                        {roundedCompletion}%
                      </span>
                    </div>
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-all duration-500"
                        style={{ width: `${goal.completion}%` }}
                      />
                    </div>
                  </div>
                </button>

                <div
                  className={cn(
                    "grid transition-all",
                    prefersReducedMotion ? "" : "duration-500 ease-in-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <GoalCard
                      goal={goal}
                      onMilestoneClick={onMilestoneClick}
                      onAddMilestone={onAddMilestone}
                      onEditGoal={onEditGoal}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (prefersReducedMotion) {
    return (
      <Card
        className="relative h-full"
        role="group"
        aria-label={`${employee.name} goals card`}
      >
        <CardContent className="p-0">
          {isFlipped ? renderBack() : renderFront()}
        </CardContent>
      </Card>
    );
  }

  const containerStyle: CSSProperties = {
    transform: `rotateY(${isFlipped ? 180 : 0}deg)`,
    transformStyle: "preserve-3d",
    transition: "transform 0.8s cubic-bezier(0.65, 0, 0.35, 1)"
  };

  return (
    <div className="relative h-full w-full [perspective:1500px]">
      <div className="relative h-full w-full" style={containerStyle}>
        <div
          className="h-full w-full"
          style={{ backfaceVisibility: "hidden" }}
          aria-hidden={isFlipped}
        >
          <Card role="group" aria-label={`${employee.name} goals card`}>
            <CardContent className="p-0">
              {renderFront()}
            </CardContent>
          </Card>
        </div>

        <div
          className="absolute inset-0 h-full w-full"
          style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
          aria-hidden={!isFlipped}
        >
          <Card role="group" aria-label={`${employee.name} goals details`}>
            <CardContent className="p-0">
              {renderBack()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
