import { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  Target,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  BarChart3,
  LineChart,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Edit,
  Upload,
  X,
  FileText,
  Send,
  RefreshCw,
  Plus,
  Briefcase,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGoals, Goal, Milestone as APIMilestone } from "@/hooks/use-goals";
import { useEmployees } from "@/hooks/use-employees";
import { GoalDetailPanel, GoalDetailSnapshot } from "./GoalDetailPanel";
import { GoalSummaryCard, GoalSummary } from "./GoalSummaryCard";
import {
  LineChart as RechartsLineChart,
  Line,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { cn } from "@/lib/utils";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { calculateGoalDistribution } from "@/utils/goal-distribution";

interface PerformanceGoal {
  id: string;
  title: string;
  category: string;
  description?: string;
  completion: number;
  targetDate: string;
  status: 'in_progress' | 'completed' | 'pending' | 'pending_manager_approval' | 'manager_reopened';
  weightage?: number;
  milestones: Milestone[];
  managerApproved?: boolean;
  managerReopened?: boolean;
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
  evidence?: string; // URL or file path for evidence
  completedDate?: string;
  managerApproved?: boolean;
  managerReopened?: boolean;
  managerComment?: string;
  userComment?: string; // User's comment when completing/reopening
}

// Helper to convert API Goal to PerformanceGoal
const convertGoalToPerformanceGoal = (goal: Goal): PerformanceGoal => {
  return {
    id: goal.id,
    title: goal.title,
    category: goal.category,
    description: goal.description || "",
    completion: goal.completion,
    targetDate: goal.targetDate,
    status: goal.status,
    weightage: goal.weightage,
    milestones: (goal.milestones || []).map(m => ({
      id: m.id,
      title: m.title,
      completed: m.completed,
      dueDate: m.dueDate,
      evidence: m.evidence,
      completedDate: m.completedDate,
      managerApproved: m.managerApproved,
      managerReopened: m.managerReopened,
      managerComment: m.managerComment,
      userComment: m.userComment
    })),
    managerApproved: goal.managerApproved,
    managerReopened: goal.managerReopened
  };
};

interface GrowthData {
  month: string;
  performance: number;
  goalsCompleted: number;
}

export function UserPerformanceView() {
  const { preserveScroll } = usePreserveScroll();
  const { toast } = useToast();
  const { user } = useAuth();
  const { getEmployeeGoals, getGoal, createMilestone, updateMilestone, deleteMilestone, updateGoal, loading: goalsLoading } = useGoals();
  const { employees } = useEmployees();

  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const currentEmployeeSummary = useMemo(() => {
    if (!currentEmployeeId) return null;
    const employeeRecord = employees.find(emp => emp.id === currentEmployeeId);
    if (employeeRecord) {
      return {
        id: employeeRecord.id,
        name: employeeRecord.name,
        role: employeeRecord.position,
        department: employeeRecord.department,
        avatarUrl: employeeRecord.photoUrl
      };
    }

    if (user?.name || user?.email) {
      return {
        id: currentEmployeeId,
        name: user?.name ?? user?.email ?? "Employee"
      };
    }

    return null;
  }, [currentEmployeeId, employees, user]);

  const [selectedMilestone, setSelectedMilestone] = useState<{ goalId: string; milestone: Milestone } | null>(null);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState<string>("");
  const [milestoneComment, setMilestoneComment] = useState<string>("");
  const [isMilestoneLoading, setIsMilestoneLoading] = useState(false);

  // Add milestone states
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState<string>("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState<string>("");
  const [submittingGoalId, setSubmittingGoalId] = useState<string | null>(null);
  const [isAddMilestoneLoading, setIsAddMilestoneLoading] = useState(false);

  const [goalPanelState, setGoalPanelState] = useState<{
    open: boolean;
    goalId: string | null;
    summary: GoalDetailSnapshot | null;
  }>({ open: false, goalId: null, summary: null });
  const goalPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const goalPanelId = "goal-detail-panel";


  // Get current user's employee ID
  useEffect(() => {
    const fetchEmployeeId = async () => {
      if (!user?.email) return;

      try {
        // Find employee by email from cached employees
        const employee = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
        if (employee) {
          setCurrentEmployeeId(employee.id);
        }
      } catch (error) {
        console.error("Error fetching employee ID:", error);
      }
    };

    if (user?.email && employees.length > 0) {
      fetchEmployeeId();
    }
  }, [user?.email, employees]);

  // Fetch goals when employee ID is available
  useEffect(() => {
    const fetchGoals = async () => {
      if (!currentEmployeeId) return;

      try {
        setLoading(true);
        const apiGoals = await getEmployeeGoals(currentEmployeeId);
        const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
        setGoals(convertedGoals);
      } catch (error) {
        console.error("Error fetching goals:", error);
        toast({
          title: "Error",
          description: "Failed to load goals",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    if (currentEmployeeId) {
      fetchGoals();
    }
  }, [currentEmployeeId, getEmployeeGoals, toast]);


  const growthData: GrowthData[] = [
    { month: "Jan", performance: 65, goalsCompleted: 1 },
    { month: "Feb", performance: 72, goalsCompleted: 2 },
    { month: "Mar", performance: 78, goalsCompleted: 2 },
    { month: "Apr", performance: 82, goalsCompleted: 3 },
    { month: "May", performance: 88, goalsCompleted: 4 },
    { month: "Jun", performance: 85, goalsCompleted: 3 }
  ];

  // Calculate goal distribution using shared utility function
  const categoryData = calculateGoalDistribution(goals);

  const overallCompletion = goals.length > 0
    ? Math.round(goals.reduce((sum, goal) => sum + goal.completion, 0) / goals.length)
    : 0;

  const completedGoals = goals.filter(g => g.status === 'completed').length;
  const inProgressGoals = goals.filter(g => g.status === 'in_progress').length;

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

// Normalize category value to match Select options
const normalizeCategory = (category: string): string => {
  const cat = category.toLowerCase();
  // Map old categories to new ones
  if (cat.includes('business') || cat.includes('project') || cat.includes('revenue') || cat.includes('sales') || cat.includes('client') || cat.includes('delivery') || cat.includes('product')) {
    return 'Business/Project Goals';
  }
  if (cat.includes('functional') || cat.includes('behavioral') || cat.includes('competency') || cat.includes('technical') || cat.includes('skill') || cat.includes('leadership') || cat.includes('communication')) {
    return 'Functional/Behavioral Competencies';
  }
  if (cat.includes('innovation') || cat.includes('initiative') || cat.includes('collaboration') || cat.includes('certification') || cat.includes('learning') || cat.includes('development') || cat.includes('training')) {
    return 'Innovation/Initiatives/Collaboration';
  }
  return 'Business/Project Goals'; // default
};

  // Handle milestone edit
  const handleMilestoneClick = (goalId: string, milestone: Milestone) => {
    setSelectedMilestone({ goalId, milestone });
    setShowMilestoneDialog(true);
    setEvidenceFile(null);
    setEvidenceFileName("");
    // Prefill with existing comment (userComment or managerComment)
    const existingComment = milestone.userComment || milestone.managerComment || "";
    setMilestoneComment(existingComment);
  };

  // Handle milestone completion
  const handleCompleteMilestone = async () => {
    if (!selectedMilestone) return;

    // Validate comment is provided
    if (!milestoneComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment before completing the milestone.",
        variant: "destructive"
      });
      return;
    }

    const { goalId, milestone } = selectedMilestone;

    try {
      setIsMilestoneLoading(true);
      // Update milestone via API
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: true,
        completedDate: new Date().toISOString(),
        evidence: evidenceFile ? evidenceFileName : milestone.evidence,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Refresh goals to get updated data (force refresh to bypass cache)
        if (currentEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
          const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
          setGoals(convertedGoals);
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
      }
    } catch (error) {
      console.error("Error completing milestone:", error);
    } finally {
      setIsMilestoneLoading(false);
    }
  };

  // Handle milestone reopening/uncompleting
  const handleReopenMilestone = async () => {
    if (!selectedMilestone) return;

    // Validate comment is provided
    if (!milestoneComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment explaining why you're reopening this milestone.",
        variant: "destructive"
      });
      return;
    }

    const { goalId, milestone } = selectedMilestone;

    try {
      setIsMilestoneLoading(true);
      // Update milestone via API
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: false,
        completedDate: undefined,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Refresh goals to get updated data (force refresh to bypass cache)
        if (currentEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
          const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
          setGoals(convertedGoals);
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
      }
    } catch (error) {
      console.error("Error reopening milestone:", error);
    } finally {
      setIsMilestoneLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setEvidenceFileName(file.name);
    }
  };

  // Check if all milestones are completed for a goal
  const areAllMilestonesCompleted = (goal: PerformanceGoal) => {
    return goal.milestones.length > 0 && goal.milestones.every(m => m.completed);
  };

  // Handle add milestone button click
  const handleAddMilestoneClick = (goalId: string) => {
    setSelectedGoalForMilestone(goalId);
    setNewMilestoneTitle("");
    setNewMilestoneDueDate("");
    setShowAddMilestoneDialog(true);
  };

  // Handle adding a new milestone
  const handleAddMilestone = async () => {
    if (!selectedGoalForMilestone) return;

    // Validate inputs
    if (!newMilestoneTitle.trim()) {
      toast({
        title: "Title Required",
        description: "Please provide a title for the milestone.",
        variant: "destructive"
      });
      return;
    }

    if (!newMilestoneDueDate) {
      toast({
        title: "Due Date Required",
        description: "Please select a due date for the milestone.",
        variant: "destructive"
      });
      return;
    }

    // Validate due date is not before today (optional validation)
    const selectedDate = new Date(newMilestoneDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      toast({
        title: "Invalid Date",
        description: "Due date cannot be in the past.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsAddMilestoneLoading(true);
      // Create milestone via API
      const newMilestone = await createMilestone(selectedGoalForMilestone, {
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDueDate
      });

      if (newMilestone) {
        // Refresh goals to get updated data (force refresh to bypass cache)
        if (currentEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
          const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
          setGoals(convertedGoals);
        }

        setShowAddMilestoneDialog(false);
        setSelectedGoalForMilestone(null);
        setNewMilestoneTitle("");
        setNewMilestoneDueDate("");
      }
    } catch (error) {
      console.error("Error adding milestone:", error);
    } finally {
      setIsAddMilestoneLoading(false);
    }
  };

  const handleSubmitGoal = async (goalId: string) => {
    if (!currentEmployeeId) return;

    try {
      setSubmittingGoalId(goalId);
      await updateGoal(goalId, { status: 'pending_manager_approval' });
      const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
      const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
      setGoals(convertedGoals);
      toast({
        title: "Submitted",
        description: "Goal sent for manager review."
      });
    } catch (error) {
      console.error('Error submitting goal:', error);
      toast({
        title: 'Submission failed',
        description: 'Unable to submit goal for manager review right now.',
        variant: 'destructive'
      });
    } finally {
      setSubmittingGoalId(null);
    }
  };

  const handleOpenGoalPanel = (goal: PerformanceGoal, trigger: HTMLButtonElement | null) => {
    goalPanelTriggerRef.current = trigger;
    setGoalPanelState({
      open: true,
      goalId: goal.id,
      summary: toGoalPanelSnapshot(goal)
    });
  };

  const handleCloseGoalPanel = () => {
    setGoalPanelState(prev => ({ ...prev, open: false }));
  };

  const handleGoalPanelOpenChange = (open: boolean) => {
    if (!open) {
      handleCloseGoalPanel();
    }
  };

  const toGoalPanelSnapshot = (goal: PerformanceGoal): GoalDetailSnapshot => ({
    id: goal.id,
    title: goal.title,
    status: goal.status,
    completion: goal.completion,
    category: goal.category,
    targetDate: goal.targetDate,
    description: goal.description,
    managerApproved: goal.managerApproved,
    managerReopened: goal.managerReopened,
    milestones: goal.milestones
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                <p className="text-3xl font-bold mt-2">{overallCompletion}%</p>
                <div className="mt-2">
                  <Progress value={overallCompletion} className="h-2" />
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Goals</p>
                <p className="text-3xl font-bold mt-2">{inProgressGoals}</p>
                <p className="text-xs text-muted-foreground mt-1">Currently working on</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold mt-2">{completedGoals}</p>
                <p className="text-xs text-muted-foreground mt-1">Goals achieved</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Goals</p>
                <p className="text-3xl font-bold mt-2">{goals.length}</p>
                <p className="text-xs text-muted-foreground mt-1">All goals</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4" onValueChange={() => {
        preserveScroll();
      }}>
        <TabsList className="bg-muted/50 backdrop-blur-sm">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="goals">Goals & Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Performance Growth Chart */}
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Performance Trend
                </CardTitle>
                <CardDescription>6-month performance progression</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={growthData}>
                    <defs>
                      <linearGradient id="colorPerformance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4facfe" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#4facfe" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="performance"
                      stroke="#4facfe"
                      strokeWidth={2}
                      fill="url(#colorPerformance)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Goals by Category */}
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Goals by Category
                </CardTitle>
                <CardDescription>Distribution of your goals</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsPieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Loading goals...</p>
              </div>
            </div>
          ) : goals.length === 0 ? (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardContent className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No goals set for you yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {goals.map((goal) => (
                <GoalSummaryCard
                  key={goal.id}
                  goal={{
                    id: goal.id,
                    title: goal.title,
                    completion: goal.completion,
                    status: goal.status,
                    targetDate: goal.targetDate,
                    category: goal.category
                  }}
                  onOpen={(_, trigger) => handleOpenGoalPanel(goal, trigger)}
                  isOpen={goalPanelState.open && goalPanelState.goalId === goal.id}
                  controlsId={goalPanelId}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <GoalDetailPanel
          open={goalPanelState.open}
          goalId={goalPanelState.goalId}
          summary={goalPanelState.summary}
          employee={currentEmployeeSummary}
          onClose={handleCloseGoalPanel}
          getGoal={getGoal}
          onAddMilestone={handleAddMilestoneClick}
          onMilestoneClick={handleMilestoneClick}
          onSubmitGoal={handleSubmitGoal}
          isSubmittingGoal={submittingGoalId === goalPanelState.goalId}
          triggerRef={goalPanelTriggerRef}
          panelId={goalPanelId}
        />
      </Tabs>

      {/* Milestone Edit Dialog */}
      <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
        <DialogContent className="max-w-2xl">
          {selectedMilestone && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-base font-semibold">Milestone</Label>
                <p className="text-sm text-muted-foreground mt-1">{selectedMilestone.milestone.title}</p>
              </div>

              <div>
                <Label>Due Date</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(selectedMilestone.milestone.dueDate).toLocaleDateString()}
                </p>
              </div>

              {selectedMilestone.milestone.completed && (
                <div>
                  <Label>Completed Date</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedMilestone.milestone.completedDate
                      ? new Date(selectedMilestone.milestone.completedDate).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              )}

              {selectedMilestone.milestone.completed && selectedMilestone.milestone.evidence && (
                <div>
                  <Label>Evidence</Label>
                  <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded-md">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedMilestone.milestone.evidence}</span>
                  </div>
                </div>
              )}

              {!selectedMilestone.milestone.completed && (
                <>
                  <div>
                    <Label htmlFor="evidence">Attach Evidence (Optional)</Label>
                    <div className="mt-2">
                      <Input
                        id="evidence"
                        type="file"
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported formats: PDF, DOC, DOCX, JPG, PNG
                      </p>
                      {evidenceFileName && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">{evidenceFileName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEvidenceFile(null);
                              setEvidenceFileName("");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {selectedMilestone.milestone.managerComment && (
                <div>
                  <Label>Manager Comment</Label>
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="text-sm">{selectedMilestone.milestone.managerComment}</p>
                  </div>
                </div>
              )}

              {selectedMilestone.milestone.completed && selectedMilestone.milestone.userComment && (
                <div>
                  <Label>Your Previous Comment</Label>
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="text-sm">{selectedMilestone.milestone.userComment}</p>
                  </div>
                </div>
              )}

              {/* Comments field - required for both completion and reopening */}
              <div>
                <Label htmlFor="milestone-comment">
                  {selectedMilestone.milestone.completed ? "Comment (Required)" : "Comment (Required)"}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Textarea
                  id="milestone-comment"
                  value={milestoneComment}
                  onChange={(e) => setMilestoneComment(e.target.value)}
                  placeholder={
                    selectedMilestone.milestone.completed
                      ? "Explain why you're reopening this milestone..."
                      : "Add a comment about completing this milestone..."
                  }
                  className="mt-2 min-h-[100px]"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedMilestone.milestone.completed
                    ? "Please provide a reason for reopening this milestone."
                    : "Please provide a comment before completing this milestone."}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMilestoneDialog(false);
                setSelectedMilestone(null);
                setEvidenceFile(null);
                setEvidenceFileName("");
                setMilestoneComment("");
              }}
              disabled={isMilestoneLoading}
            >
              Cancel
            </Button>
            {selectedMilestone?.milestone.completed ? (
              <Button
                variant="outline"
                className="border-orange-500/20 text-orange-600 hover:bg-orange-500/10"
                onClick={handleReopenMilestone}
                disabled={isMilestoneLoading}
              >
                {isMilestoneLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reopening...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reopen Milestone
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleCompleteMilestone} disabled={isMilestoneLoading}>
                {isMilestoneLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark as Completed
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Milestone Dialog */}
      <Dialog open={showAddMilestoneDialog} onOpenChange={setShowAddMilestoneDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Milestone</DialogTitle>
            <DialogDescription>
              Add a new milestone to track progress towards your goal
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="milestone-title">
                Milestone Title
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="milestone-title"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                placeholder="e.g., Complete training course"
                className="mt-2"
                required
              />
            </div>

            <div>
              <Label htmlFor="milestone-due-date">
                Due Date
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="milestone-due-date"
                type="date"
                value={newMilestoneDueDate}
                onChange={(e) => setNewMilestoneDueDate(e.target.value)}
                className="mt-2"
                min={new Date().toISOString().split('T')[0]}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Select a due date for this milestone
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMilestoneDialog(false);
                setSelectedGoalForMilestone(null);
                setNewMilestoneTitle("");
                setNewMilestoneDueDate("");
              }}
              disabled={isAddMilestoneLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleAddMilestone} disabled={isAddMilestoneLoading}>
              {isAddMilestoneLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

