import { Target, Calendar, Plus, CheckCircle2, Clock, Send, RefreshCw, Award, FileText } from "lucide-react";
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
    status: 'in_progress' | 'completed' | 'pending' | 'pending_manager_approval' | 'manager_reopened';
    completion: number;
    milestones?: Milestone[];
    managerApproved?: boolean;
    managerReopened?: boolean;
    setBy?: string; // For manager view
  };
  onMilestoneClick?: (goalId: string, milestone: Milestone) => void;
  onAddMilestone?: (goalId: string) => void;
  showSetBy?: boolean; // Show "Set by" text for manager view
}

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'technical skills':
    case 'technical':
      return <Target className="h-4 w-4" />;
    case 'leadership':
      return <Award className="h-4 w-4" />;
    case 'certification':
      return <Award className="h-4 w-4" />;
    default:
      return <Target className="h-4 w-4" />;
  }
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

export function GoalCard({ goal, onMilestoneClick, onAddMilestone, showSetBy = false }: GoalCardProps) {
  return (
    <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {getCategoryIcon(goal.category)}
              <CardTitle className="text-xl">{goal.title}</CardTitle>
            </div>
            {goal.description && (
              <p className="text-sm text-muted-foreground mb-2">{goal.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline">{goal.category}</Badge>
              {getStatusBadge(goal.status)}
              {showSetBy && goal.setBy && (
                <span className="text-sm text-muted-foreground">Set by: {goal.setBy}</span>
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
            <span className="text-sm font-semibold text-primary">{goal.completion}%</span>
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
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors",
                    milestone.completed
                      ? "bg-green-500/10 border-green-500/20"
                      : "bg-muted/30 border-border"
                  )}
                  onClick={() => onMilestoneClick?.(goal.id, milestone)}
                >
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0",
                    milestone.completed
                      ? "bg-green-500 text-white"
                      : "bg-muted border-2 border-border"
                  )}>
                    {milestone.completed ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-semibold">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "text-sm font-medium",
                      milestone.completed && "line-through text-muted-foreground"
                    )}>
                      {milestone.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due: {new Date(milestone.dueDate).toLocaleDateString()}
                      {milestone.completed && milestone.completedDate && (
                        <span className="ml-2">• Completed: {new Date(milestone.completedDate).toLocaleDateString()}</span>
                      )}
                    </p>
                    {milestone.evidence && (
                      <div className="flex items-center gap-1 mt-1">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{milestone.evidence}</span>
                      </div>
                    )}
                    {milestone.userComment && (
                      <div className="mt-2 p-2 bg-muted/50 rounded-md border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Your Comment:</p>
                        <p className="text-xs text-muted-foreground">{milestone.userComment}</p>
                      </div>
                    )}
                    {milestone.managerComment && (
                      <div className="mt-2 p-2 bg-blue-500/10 rounded-md border border-blue-500/20">
                        <p className="text-xs font-semibold text-blue-600 mb-1">Manager Comment:</p>
                        <p className="text-xs text-blue-600">{milestone.managerComment}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {milestone.completed && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        Completed
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No milestones yet</p>
            )}
          </div>
          
          {/* Manager Approval Section */}
          {areAllMilestonesCompleted(goal) && goal.status === 'pending_manager_approval' && (
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

