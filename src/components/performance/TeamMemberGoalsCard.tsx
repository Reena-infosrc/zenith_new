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
  Loader2,
  FileText,
  HelpCircle,
  AlertCircle,
  Bell,
  CheckCircle2,
  MessageSquare
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
    pending?: number;
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
  onViewReviews?: () => void;
  /** Opens Client RM Feedback for this team member (manager Performance). */
  onClientRmFeedback?: () => void;
  activeGoalId?: string | null;
  panelId?: string;
  reviewStatus?: 'not_started' | 'self_submitted' | 'manager_reviewing' | 'clarification_requested' | 'clarification_responded' | 'needs_clarification' | 'manager_submitted' | 'hr_approved';
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
  onViewReviews,
  onClientRmFeedback,
  activeGoalId = null,
  panelId,
  reviewStatus
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


  const renderFront = () => (
    <div className="flex h-full flex-col gap-5 p-6 min-w-0 overflow-hidden">
      {/* Employee Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border-2 border-primary/30 text-xl font-bold text-primary shadow-sm">
            {employee.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground break-words leading-tight mb-1">
            {employee.name}
          </h3>
          <p className="text-sm font-medium text-muted-foreground break-words mb-2">
            {employee.position}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              <span>{employee.department}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{experienceLabel}</span>
            </div>
          </div>
          {/* Review Status Badge */}
          {reviewStatus && reviewStatus !== 'not_started' && (
            <div className="mt-2">
              {reviewStatus === 'clarification_responded' && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shadow-sm flex items-center gap-1 w-fit animate-pulse">
                  <Bell className="h-3 w-3" />
                  Response Received
                </Badge>
              )}
          {(reviewStatus === 'clarification_requested' || reviewStatus === 'needs_clarification') && (
                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm flex items-center gap-1 w-fit">
                  <AlertCircle className="h-3 w-3" />
                  Needs Clarification
                </Badge>
              )}
              {reviewStatus === 'self_submitted' && (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm flex items-center gap-1 w-fit">
                  <FileText className="h-3 w-3" />
                  Self Review Submitted
                </Badge>
              )}
              {reviewStatus === 'manager_reviewing' && (
                <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30 shadow-sm flex items-center gap-1 w-fit">
                  <Eye className="h-3 w-3" />
                  Under Review
                </Badge>
              )}
              {reviewStatus === 'manager_submitted' && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30 shadow-sm flex items-center gap-1 w-fit">
                  <FileText className="h-3 w-3" />
                  Submitted to HR
                </Badge>
              )}
              {reviewStatus === 'hr_approved' && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shadow-sm flex items-center gap-1 w-fit">
                  <CheckCircle2 className="h-3 w-3" />
                  HR Approved
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 3).map((skill, idx) => (
            <Badge 
              key={idx} 
              variant="secondary" 
              className="text-xs px-2 py-0.5 bg-muted/50 border-border/50"
            >
              {skill}
            </Badge>
          ))}
          {skills.length > 3 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-muted/50 border-border/50">
              +{skills.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Goals Status */}
      <div className="rounded-xl border border-border/40 bg-gradient-to-br from-background/60 to-background/40 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Goals Status</span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {summary.total > 0 ? (
              <>
                {summary.active > 0 && (
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm">
                    {summary.active} Active
                  </Badge>
                )}
                {(summary.pending ?? 0) > 0 && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm">
                    {summary.pending} Pending
                  </Badge>
                )}
                {summary.completed > 0 && (
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30 shadow-sm">
                    {summary.completed} Completed
                  </Badge>
                )}
                {summary.total > 0 && summary.active === 0 && (summary.pending ?? 0) === 0 && summary.completed === 0 && (
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm">
                    {summary.total} Goal{summary.total !== 1 ? "s" : ""}
                  </Badge>
                )}
              </>
            ) : (
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm">
                No Goals
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 mt-auto">
        <Button
          className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md hover:shadow-lg transition-all duration-200 h-10"
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          <span>{isFlipped ? "Hide Goals" : summary.total > 0 ? `View Goals (${summary.total})` : "View Goals"}</span>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-10 border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onSetGoals();
            }}
          >
            <Target className="h-4 w-4 mr-2" />
            <span className="text-sm">Set Goals</span>
          </Button>
          <Button
            variant="outline"
            className="h-10 border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewReviews) {
                onViewReviews();
              }
            }}
            disabled={!onViewReviews}
          >
            <FileText className="h-4 w-4 mr-2" />
            <span className="text-sm">View Reviews</span>
          </Button>
        </div>
        {onClientRmFeedback && (
          <Button
            variant="outline"
            className="w-full h-10 border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onClientRmFeedback();
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            <span className="text-sm">Client RM Feedback</span>
          </Button>
        )}
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
                background: `conic-gradient(var(--primary) ${(() => {
                  if (!goals.length) return 0;
                  const totalWeight = goals.reduce((sum, g) => sum + (g.weightage || 0), 0);
                  return Math.min(Math.round(totalWeight), 100);
                })()
                  }%, hsl(var(--muted)) 0)`
              }}
            />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-background">
              <span className="text-xs font-semibold">
                {(() => {
                  if (!goals.length) return 0;
                  const totalWeight = goals.reduce((sum, g) => sum + (g.weightage || 0), 0);
                  return Math.round(totalWeight);
                })()}%
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
        className="relative h-full bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300"
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
          <Card className="h-full bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300" role="group" aria-label={`${employee.name} goals card`}>
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
          <Card className="h-full bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg" role="group" aria-label={`${employee.name} goals details`}>
            <CardContent className="p-0 h-full flex flex-col">
              {renderBack()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
