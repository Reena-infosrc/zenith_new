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
import { cn } from "@/lib/utils";
import { GoalSummaryCard } from "./GoalSummaryCard";
import { GoalWaterJarVisualizer } from "./GoalWaterJarVisualizer";

interface TeamGoal {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: string;
  completion: number;
  weightage?: number;
  createdAt?: string;
  milestones?: Array<{
    id: string;
    title: string;
    completed: boolean;
    dueDate: string;
    evidence?: string;
    completedDate?: string;
    managerApproved?: boolean;
    managerReopened?: boolean;
    managerComment?: string;
    userComment?: string;
  }>;
  managerApproved?: boolean;
  managerReopened?: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  position: string;
  department: string;
  yearsOfExperience?: number;
  experienceYears?: number;
  skills?: string[];
}

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
  employee: TeamMember;
  summary: {
    total: number;
    active: number;
    completed: number;
  };
  goals: TeamGoal[];
  isLoading: boolean;
  onFetchGoals: () => Promise<void>;
  onSetGoals: () => void;
  onAddGoal: () => void;
  onEditGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => Promise<void>;
  onOpenGoal: (goal: TeamGoal, employee: TeamMember, trigger: HTMLButtonElement | null) => void;
  onOpenCategoryGoals?: (category: string, goals: TeamGoal[], employee: TeamMember, trigger: HTMLButtonElement | null) => void;
  activeGoalId?: string | null;
  panelId?: string;
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
  onOpenGoal,
  onOpenCategoryGoals,
  activeGoalId = null,
  panelId
}: TeamMemberGoalsCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const experienceLabel = useMemo(() => {
    const years = employee.yearsOfExperience ?? employee.experienceYears ?? 0;
    return `${years} year${years === 1 ? "" : "s"} exp.`;
  }, [employee.experienceYears, employee.yearsOfExperience]);
  const skills = useMemo(() => employee.skills ?? [], [employee.skills]);

  const handleFlip = async () => {
    if (!isFlipped && (isFetching || isLoading)) {
      return;
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
    <div className="flex h-full flex-col gap-2 p-4 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0 flex-shrink-0">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full border-border/60 text-muted-foreground hover:bg-primary/5 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative flex h-10 w-10 items-center justify-center flex-shrink-0">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${goals.length ? Math.max(Math.round(goals.reduce((sum, g) => sum + g.completion, 0) / goals.length), 0) : 0}%, hsl(var(--muted)) 0)`
              }}
            />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-background">
              <span className="text-xs font-semibold">
                {goals.length
                  ? Math.round(goals.reduce((sum, g) => sum + g.completion, 0) / goals.length)
                  : 0}%
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground break-words leading-tight">Goals Overview</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
        {(isLoading || isFetching) ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <div className="relative mx-auto w-10 h-10">
                <Target className="h-10 w-10 animate-spin text-primary/50" style={{ animationDuration: '1.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse"></div>
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">Loading goals...</p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <div className="h-1 w-1 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="h-1 w-1 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="h-1 w-1 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
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
          <div className="flex flex-col items-center justify-center flex-1 min-h-0">
            <GoalWaterJarVisualizer
              goals={goals}
              onSegmentClick={(category, categoryGoals) => {
                if (categoryGoals.length > 0) {
                  if (onOpenCategoryGoals) {
                    onOpenCategoryGoals(category, categoryGoals, employee, null);
                  } else {
                    // Fallback to single goal view
                    const firstGoal = categoryGoals[0];
                    onOpenGoal(firstGoal, employee, null);
                  }
                }
              }}
              className="w-full"
            />
          </div>
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
        <CardContent className="p-0 h-full">
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
          <Card className="h-full" role="group" aria-label={`${employee.name} goals card`}>
            <CardContent className="p-0 h-full flex flex-col">
              {renderFront()}
            </CardContent>
          </Card>
        </div>

        <div
          className="absolute inset-0 h-full w-full"
          style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
          aria-hidden={!isFlipped}
        >
          <Card className="h-full" role="group" aria-label={`${employee.name} goals details`}>
            <CardContent className="p-0 h-full flex flex-col">
              {renderBack()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
