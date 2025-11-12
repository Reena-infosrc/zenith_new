import { Target, Calendar, Plus, CheckCircle2, Clock, Send, RefreshCw, Award, FileText, Edit, Briefcase, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface Milestone {
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
}

export interface GoalCardProps {
  goal: {
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
    setBy?: string; // For manager view
  };
  onMilestoneClick?: (goalId: string, milestone: Milestone) => void;
  onAddMilestone?: (goalId: string) => void;
  onEditGoal?: (goalId: string) => void;
  onSubmitGoal?: (goalId: string) => void;
  isSubmittingGoal?: boolean;
  showSetBy?: boolean; // Show "Set by" text for manager view
}

const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase();
  if (cat.includes('business') || cat.includes('project')) {
    return <Briefcase className="h-4 w-4" />;
  }
  if (cat.includes('functional') || cat.includes('behavioral') || cat.includes('competency')) {
    return <Target className="h-4 w-4" />;
  }
  if (cat.includes('innovation') || cat.includes('initiative') || cat.includes('collaboration')) {
    return <Award className="h-4 w-4" />;
  }
  return <Target className="h-4 w-4" />;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    case 'in_progress':
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case 'pending_manager_approval':
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Send className="h-3 w-3 mr-1" />Pending Approval</Badge>;
    case 'manager_reopened':
      return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20"><RefreshCw className="h-3 w-3 mr-1" />Reopened</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
};

const areAllMilestonesCompleted = (goal: GoalCardProps['goal']): boolean => {
  if (!goal.milestones || goal.milestones.length === 0) return false;
  return goal.milestones.every(m => m.completed);
};

export function GoalCard({ goal, onMilestoneClick, onAddMilestone, onEditGoal, onSubmitGoal, isSubmittingGoal = false, showSetBy = false }: GoalCardProps) {
  return (
    <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 mt-0.5">
                {getCategoryIcon(goal.category)}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl break-words">{goal.title}</CardTitle>
              </div>
              {onEditGoal && (
                <div className="flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditGoal(goal.id);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {goal.description && (
              <p className="text-sm text-muted-foreground mb-2 break-words">{goal.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge variant="outline" className="break-words">{goal.category}</Badge>
              {getStatusBadge(goal.status)}
              {showSetBy && goal.setBy && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">Set by: {goal.setBy}</span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Due Date - Highlighted and above progress */}
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">
            Due: {new Date(goal.targetDate).toLocaleDateString()}
          </span>
        </div>
        
        {/* Progress Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm font-semibold text-primary">{Math.round(goal.completion)}%</span>
          </div>
          <Progress value={goal.completion} className="h-3" />
        </div>

        {/* Milestones Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Milestones</h4>
            {onAddMilestone && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddMilestone(goal.id);
                }}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Milestone
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {goal.milestones && goal.milestones.length > 0 ? (
              goal.milestones.map((milestone, idx) => (
                <div
                  key={milestone.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    milestone.completed
                      ? "bg-green-500/10 border-green-500/20"
                      : "bg-muted/40 border-border/60"
                  )}
                  onClick={() => onMilestoneClick?.(goal.id, milestone)}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "mt-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      milestone.completed
                        ? "bg-green-500 text-white"
                        : "bg-background border border-border text-muted-foreground"
                    )}>
                      {milestone.completed ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-sm font-medium break-words", milestone.completed && "line-through text-muted-foreground")}>{milestone.title}</p>
                        {milestone.completed && (
                          <Badge className="h-5 rounded-full bg-green-500/15 px-2 text-[10px] font-semibold text-green-600">
                            Completed
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>Due: {new Date(milestone.dueDate).toLocaleDateString()}</span>
                        {milestone.completed && milestone.completedDate && (
                          <span>• Completed: {new Date(milestone.completedDate).toLocaleDateString()}</span>
                        )}
                      </div>
                      {milestone.evidence && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          {milestone.evidence}
                        </div>
                      )}
                      {(milestone.userComment || milestone.managerComment) && (
                        <div className="mt-2 space-y-1 text-[11px]">
                          {milestone.userComment && (
                            <div className="rounded border border-border/50 bg-muted/40 px-2 py-1">
                              <p className="font-semibold text-muted-foreground">Your Comment</p>
                              <p className="text-muted-foreground">{milestone.userComment}</p>
                            </div>
                          )}
                          {milestone.managerComment && (
                            <div className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1">
                              <p className="font-semibold text-blue-600">Manager Comment</p>
                              <p className="text-blue-600">{milestone.managerComment}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No milestones yet</p>
            )}
          </div>
          
          {onSubmitGoal &&
            goal.status !== 'pending_manager_approval' &&
            goal.status !== 'completed' &&
            (goal.milestones?.length ?? 0) > 0 &&
            goal.milestones?.every((milestone) => milestone.completed) && (
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Send className="h-4 w-4 text-primary" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-primary">Ready to submit</p>
                      <p className="text-xs text-muted-foreground">
                        All milestones are complete. Submit your goal for manager review to close it out.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSubmitGoal(goal.id);
                      }}
                      disabled={isSubmittingGoal}
                    >
                      {isSubmittingGoal ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Submit for Manager Review
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Manager approval will be required after submission.
                    </p>
                  </div>
                </div>
              </div>
            )}
          
          {goal.status === 'pending_manager_approval' && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Send className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-600">Pending Manager Approval</p>
              </div>
              <p className="text-xs text-muted-foreground">
                All milestones are completed. Waiting for your line manager to review and approve this goal.
              </p>
            </div>
          )}
          
          {goal.status === 'manager_reopened' && (
            <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-orange-600" />
                <p className="text-sm font-semibold text-orange-600">Goal Reopened by Manager</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your manager has reopened this goal. Please review and update the milestones as needed.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

