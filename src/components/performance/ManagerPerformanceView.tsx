import { useState, useEffect } from "react";
import {
  Users, 
  Target, 
  Search,
  Plus,
  TrendingUp,
  CheckCircle2,
  Clock,
  Calendar,
  Briefcase,
  Edit,
  FileText,
  MessageSquare,
  CheckCircle,
  Bell,
  Send,
  RefreshCw,
  X
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGoals, Goal as APIGoal, Milestone as APIMilestone } from "@/hooks/use-goals";
import { useEmployees } from "@/hooks/use-employees";
import { GoalSettingModal, Employee as GoalEmployee } from "./GoalSettingModal";
import { ReviewForms } from "./ReviewForms";
import { ContinuousFeedback } from "./ContinuousFeedback";
import { ManagerSignOff } from "./ManagerSignOff";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { GoalCard } from "./GoalCard";
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
import { TeamMemberGoalsCard } from "./TeamMemberGoalsCard";

interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  yearsOfExperience: number;
  skills: string[];
  photoUrl?: string;
  reporting_to?: string;
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
  evidence?: string;
  completedDate?: string;
  managerApproved?: boolean;
  managerReopened?: boolean;
  managerComment?: string;
}

interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: 'draft' | 'published' | 'completed' | 'pending_manager_approval' | 'manager_reopened';
  completion: number;
  createdAt: string;
  aiSuggested?: boolean;
  milestones?: Milestone[];
  managerApproved?: boolean;
  managerReopened?: boolean;
}

interface MyGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: 'in_progress' | 'completed' | 'pending' | 'pending_manager_approval' | 'manager_reopened';
  completion: number;
  setBy: string;
  milestones?: Milestone[];
  managerApproved?: boolean;
  managerReopened?: boolean;
}

// Helper to convert API Goal to MyGoal
const convertGoalToMyGoal = (goal: APIGoal): MyGoal => {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description || "",
    category: goal.category,
    targetDate: goal.targetDate,
    status: goal.status,
    completion: goal.completion,
    setBy: "Manager",
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

// Helper to convert API Goal to Goal (for team member goals)
const convertGoalToTeamGoal = (goal: APIGoal): Goal => {
  return {
    id: goal.id,
    employeeId: goal.employeeId,
    title: goal.title,
    description: goal.description || "",
    category: goal.category,
    targetDate: goal.targetDate,
    status: goal.status,
    completion: goal.completion,
    createdAt: goal.created_at || new Date().toISOString(),
    milestones: goal.milestones || [],
    managerApproved: goal.managerApproved,
    managerReopened: goal.managerReopened
  };
};

export function ManagerPerformanceView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getEmployeeGoals, createGoal, updateGoal, deleteGoal, createMilestone, updateMilestone, deleteMilestone } = useGoals();
  const { employees } = useEmployees();
  
  const [directReports, setDirectReports] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [myGoals, setMyGoals] = useState<MyGoal[]>([]);
  const [employeeGoals, setEmployeeGoals] = useState<Map<string, Goal[]>>(new Map());
  const [currentManagerEmployeeId, setCurrentManagerEmployeeId] = useState<string | null>(null);
  const [loadingMyGoals, setLoadingMyGoals] = useState(true);
  const [loadingTeamGoals, setLoadingTeamGoals] = useState(false);
  const [loadingGoalEmployeeId, setLoadingGoalEmployeeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [viewMode, setViewMode] = useState<'my-team' | 'my-goals' | 'reviews' | 'feedback' | 'signoff'>('my-team');
  const { preserveScroll } = usePreserveScroll();
  
  // Manager approval states
  const [selectedGoalForApproval, setSelectedGoalForApproval] = useState<{ goal: Goal; employee: Employee } | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reopen' | null>(null);
  
  // Milestone states for manager's own goals
  const [selectedMilestone, setSelectedMilestone] = useState<{ goalId: string; milestone: Milestone } | null>(null);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState<string>("");
  const [milestoneComment, setMilestoneComment] = useState<string>("");
  
  // Add milestone states
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState<string>("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState<string>("");
  
  // Goals pending approval (fetched from API)
  const [pendingApprovalGoals, setPendingApprovalGoals] = useState<Array<{ goal: Goal; employee: Employee }>>([]);

  // Mock growth data for manager's own goals
  const growthData = [
    { month: "Jan", performance: 65, goalsCompleted: 1 },
    { month: "Feb", performance: 72, goalsCompleted: 2 },
    { month: "Mar", performance: 78, goalsCompleted: 2 },
    { month: "Apr", performance: 82, goalsCompleted: 3 },
    { month: "May", performance: 88, goalsCompleted: 4 },
    { month: "Jun", performance: 85, goalsCompleted: 3 }
  ];

  const categoryData = [
    { name: "Leadership", value: 40, color: "#4facfe" },
    { name: "Technical", value: 35, color: "#00f2fe" },
    { name: "Certification", value: 25, color: "#42b983" }
  ];

  // Get manager's employee ID
  useEffect(() => {
    const fetchManagerEmployeeId = async () => {
      if (!user?.email) return;
      
      try {
        const employee = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
        if (employee) {
          setCurrentManagerEmployeeId(employee.id);
        }
      } catch (error) {
        console.error("Error fetching manager employee ID:", error);
      }
    };

    if (user?.email && employees.length > 0) {
      fetchManagerEmployeeId();
    }
  }, [user?.email, employees]);

  // Fetch manager's own goals
  useEffect(() => {
    const fetchMyGoals = async () => {
      if (!currentManagerEmployeeId) return;
      
      try {
        setLoadingMyGoals(true);
        const apiGoals = await getEmployeeGoals(currentManagerEmployeeId);
        const convertedGoals = apiGoals.map(convertGoalToMyGoal);
        setMyGoals(convertedGoals);
      } catch (error) {
        console.error("Error fetching manager goals:", error);
        toast({
          title: "Error",
          description: "Failed to load your goals",
          variant: "destructive"
        });
      } finally {
        setLoadingMyGoals(false);
      }
    };

    if (currentManagerEmployeeId) {
      fetchMyGoals();
    }
  }, [currentManagerEmployeeId, getEmployeeGoals, toast]);

  // Get direct reports (employees who report to current manager)
  useEffect(() => {
    if (!currentManagerEmployeeId) return;
    
    const reports = employees.filter(emp => emp.reporting_to === currentManagerEmployeeId);
    setDirectReports(reports);
  }, [currentManagerEmployeeId, employees]);

  // Fetch goals for a team member
  const fetchTeamMemberGoals = async (employeeId: string) => {
    try {
      setLoadingTeamGoals(true);
      setLoadingGoalEmployeeId(employeeId);
      const apiGoals = await getEmployeeGoals(employeeId);
      const convertedGoals = apiGoals.map(convertGoalToTeamGoal);
      setEmployeeGoals(prev => {
        const newMap = new Map(prev);
        newMap.set(employeeId, convertedGoals);
        return newMap;
      });
    } catch (error) {
      console.error("Error fetching team member goals:", error);
      toast({
        title: "Error",
        description: "Failed to load team member goals",
        variant: "destructive"
      });
    } finally {
      setLoadingTeamGoals(false);
      setLoadingGoalEmployeeId(null);
    }
  };

  // Fetch goals for all direct reports when they're loaded
  useEffect(() => {
    const fetchAllTeamGoals = async () => {
      if (!currentManagerEmployeeId || directReports.length === 0) return;
      
      try {
        // Fetch goals for all direct reports in parallel
        const goalsPromises = directReports.map(async (report) => {
          try {
            const apiGoals = await getEmployeeGoals(report.id);
            const convertedGoals = apiGoals.map(convertGoalToTeamGoal);
            return { employeeId: report.id, goals: convertedGoals };
          } catch (error) {
            console.error(`Error fetching goals for ${report.id}:`, error);
            return { employeeId: report.id, goals: [] };
          }
        });

        const results = await Promise.all(goalsPromises);
        
        // Update the employeeGoals Map with all fetched goals
        setEmployeeGoals(prev => {
          const newMap = new Map(prev);
          results.forEach(({ employeeId, goals }) => {
            newMap.set(employeeId, goals);
          });
          return newMap;
        });
      } catch (error) {
        console.error("Error fetching all team goals:", error);
      }
    };

    if (currentManagerEmployeeId && directReports.length > 0) {
      fetchAllTeamGoals();
    }
  }, [currentManagerEmployeeId, directReports, getEmployeeGoals]);

  // Fetch pending approval goals for team members
  useEffect(() => {
    const fetchPendingApprovalGoals = async () => {
      if (!currentManagerEmployeeId || directReports.length === 0) return;
      
      try {
        const pendingGoals: Array<{ goal: Goal; employee: Employee }> = [];
        
        // Fetch goals for each direct report
        for (const report of directReports) {
          const apiGoals = await getEmployeeGoals(report.id);
          const goalsPendingApproval = apiGoals.filter(g => g.status === 'pending_manager_approval');
          
          for (const apiGoal of goalsPendingApproval) {
            pendingGoals.push({
              goal: convertGoalToTeamGoal(apiGoal),
              employee: report
            });
          }
        }
        
        setPendingApprovalGoals(pendingGoals);
      } catch (error) {
        console.error("Error fetching pending approval goals:", error);
      }
    };

    if (currentManagerEmployeeId && directReports.length > 0) {
      fetchPendingApprovalGoals();
    }
  }, [currentManagerEmployeeId, directReports, getEmployeeGoals]);

  const filteredReports = directReports.filter(emp => {
    return emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.position.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getGoalsForEmployee = (employeeId: string) => {
    return employeeGoals.get(employeeId) || [];
  };

  const getGoalsSummary = (employeeId: string) => {
    const goals = getGoalsForEmployee(employeeId);
    const active = goals.filter(g => g.status === 'in_progress' || g.status === 'pending_manager_approval').length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const total = goals.length;
    return { total, active, completed };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>;
      case 'pending_manager_approval':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending Approval</Badge>;
      case 'manager_reopened':
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Reopened</Badge>;
      case 'pending':
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Milestone handlers for manager's own goals
  const handleMilestoneClick = (goalId: string, milestone: Milestone) => {
    setSelectedMilestone({ goalId, milestone });
    setShowMilestoneDialog(true);
    setEvidenceFile(null);
    setEvidenceFileName("");
    setMilestoneComment(milestone.userComment || "");
  };

  const handleCompleteMilestone = async () => {
    if (!selectedMilestone) return;

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
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: true,
        completedDate: new Date().toISOString(),
        evidence: evidenceFile ? evidenceFileName : milestone.evidence,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Refresh goals
        if (currentManagerEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentManagerEmployeeId);
          const convertedGoals = apiGoals.map(convertGoalToMyGoal);
          setMyGoals(convertedGoals);
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
      }
    } catch (error) {
      console.error("Error completing milestone:", error);
    }
  };

  const handleReopenMilestone = async () => {
    if (!selectedMilestone) return;

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
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: false,
        completedDate: undefined,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Refresh goals
        if (currentManagerEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentManagerEmployeeId);
          const convertedGoals = apiGoals.map(convertGoalToMyGoal);
          setMyGoals(convertedGoals);
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
      }
    } catch (error) {
      console.error("Error reopening milestone:", error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEvidenceFile(file);
      setEvidenceFileName(file.name);
    }
  };

  const areAllMilestonesCompleted = (goal: MyGoal) => {
    return (goal.milestones || []).length > 0 && (goal.milestones || []).every(m => m.completed);
  };

  const handleAddMilestoneClick = (goalId: string) => {
    setSelectedGoalForMilestone(goalId);
    setNewMilestoneTitle("");
    setNewMilestoneDueDate("");
    setShowAddMilestoneDialog(true);
  };

  const handleAddMilestone = async () => {
    if (!selectedGoalForMilestone) return;

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
      const newMilestone = await createMilestone(selectedGoalForMilestone, {
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDueDate
      });

      if (newMilestone) {
        // Refresh goals
        if (currentManagerEmployeeId) {
          const apiGoals = await getEmployeeGoals(currentManagerEmployeeId);
          const convertedGoals = apiGoals.map(convertGoalToMyGoal);
          setMyGoals(convertedGoals);
        }

        setShowAddMilestoneDialog(false);
        setSelectedGoalForMilestone(null);
        setNewMilestoneTitle("");
        setNewMilestoneDueDate("");
      }
    } catch (error) {
      console.error("Error adding milestone:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Direct Reports</p>
                <p className="text-3xl font-bold mt-2">{directReports.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Goals Set</p>
                <p className="text-3xl font-bold mt-2">
                  {Array.from(employeeGoals.values()).flat().filter(g => g.status === 'published').length}
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">My Goals</p>
                <p className="text-3xl font-bold mt-2">{myGoals.length}</p>
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
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-3xl font-bold mt-2">
                  {myGoals.filter(g => g.status === 'in_progress').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => {
        preserveScroll();
        setViewMode(v as any);
      }} className="space-y-4">
        <TabsList className="bg-muted/50 backdrop-blur-sm flex-wrap">
          <TabsTrigger value="my-team">
            <Users className="h-4 w-4 mr-2" />
            My Team
          </TabsTrigger>
          <TabsTrigger value="my-goals">
            <Target className="h-4 w-4 mr-2" />
            My Goals
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <FileText className="h-4 w-4 mr-2" />
            Reviews
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="signoff">
            <CheckCircle className="h-4 w-4 mr-2" />
            Sign-Off
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-team" className="space-y-4">
          {/* Pending Approvals Section */}
          {pendingApprovalGoals.length > 0 && (
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 backdrop-blur-sm border-blue-500/20 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-blue-600" />
                      Goals Pending Approval
                    </CardTitle>
                    <CardDescription>
                      {pendingApprovalGoals.length} goal{pendingApprovalGoals.length !== 1 ? 's' : ''} waiting for your review
                    </CardDescription>
                  </div>
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                    {pendingApprovalGoals.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingApprovalGoals.map(({ goal, employee }) => (
                    <Card key={goal.id} className="bg-background/50 border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {employee.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold">{employee.name}</p>
                                <p className="text-xs text-muted-foreground">{employee.position}</p>
                              </div>
                            </div>
                            <h4 className="font-semibold mb-1">{goal.title}</h4>
                            <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>
                            
                            {/* Milestones */}
                            <div className="space-y-2 mb-3">
                              <p className="text-xs font-semibold text-muted-foreground">Completed Milestones:</p>
                              {goal.milestones?.map((milestone) => (
                                <div key={milestone.id} className="flex items-center gap-2 text-xs">
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  <span className={milestone.completed ? "line-through text-muted-foreground" : ""}>
                                    {milestone.title}
                                  </span>
                                  {milestone.evidence && (
                                    <FileText className="h-3 w-3 text-muted-foreground ml-1" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                              onClick={() => {
                                setSelectedGoalForApproval({ goal, employee });
                                setApprovalAction('approve');
                                setShowApprovalDialog(true);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-500/20 text-orange-600 hover:bg-orange-500/10"
                              onClick={() => {
                                setSelectedGoalForApproval({ goal, employee });
                                setApprovalAction('reopen');
                                setShowApprovalDialog(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reopen
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Search */}
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-background/50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Team Members Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((employee) => {
              const summary = getGoalsSummary(employee.id);
              const employeeGoalsList = getGoalsForEmployee(employee.id);
              return (
                <TeamMemberGoalsCard
                  key={employee.id}
                  employee={employee}
                  summary={summary}
                  goals={employeeGoalsList}
                  isLoading={loadingTeamGoals && loadingGoalEmployeeId === employee.id}
                  onFetchGoals={async () => {
                    setSelectedEmployee(employee);
                    await fetchTeamMemberGoals(employee.id);
                  }}
                  onSetGoals={() => {
                    setSelectedEmployee(employee);
                    setShowGoalModal(true);
                  }}
                  onAddGoal={() => {
                    setSelectedEmployee(employee);
                    setShowGoalModal(true);
                  }}
                  onEditGoal={(goalId) => {
                    setSelectedEmployee(employee);
                    setShowGoalModal(true);
                  }}
                  onDeleteGoal={async (goalId) => {
                    setSelectedEmployee(employee);
                    await deleteGoal(goalId);
                    await fetchTeamMemberGoals(employee.id);
                  }}
                  onMilestoneClick={handleMilestoneClick}
                  onAddMilestone={handleAddMilestoneClick}
                />
              );
            })}
          </div>

          {filteredReports.length === 0 && (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardContent className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No direct reports found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="my-goals" className="space-y-4">
          <Tabs defaultValue="overview" className="space-y-4" onValueChange={() => {
            preserveScroll();
          }}>
            <TabsList className="bg-muted/50 backdrop-blur-sm">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="goals-timeline">Goals & Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Summary Cards for Manager's Own Goals */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                        <p className="text-3xl font-bold mt-2">
                          {myGoals.length > 0
                            ? Math.round(myGoals.reduce((sum, goal) => sum + goal.completion, 0) / myGoals.length)
                            : 0}%
                        </p>
                        <div className="mt-2">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${myGoals.length > 0
                                  ? Math.round(myGoals.reduce((sum, goal) => sum + goal.completion, 0) / myGoals.length)
                                  : 0}%`
                              }}
                            />
                          </div>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.filter(g => g.status === 'in_progress').length}</p>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.filter(g => g.status === 'completed').length}</p>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Assigned to you</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-purple-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
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

                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
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

            <TabsContent value="goals-timeline" className="space-y-4">
              {/* Goals in Card Grid View */}
              {loadingMyGoals ? (
                <div className="flex items-center justify-center p-12">
                  <div className="text-center">
                    <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Loading goals...</p>
                  </div>
                </div>
              ) : myGoals.length === 0 ? (
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-12 text-center">
                    <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No goals set for you yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myGoals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onMilestoneClick={handleMilestoneClick}
                      onAddMilestone={handleAddMilestoneClick}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <ReviewForms />
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <ContinuousFeedback />
        </TabsContent>

        <TabsContent value="signoff" className="space-y-4">
          <ManagerSignOff />
        </TabsContent>
      </Tabs>

      {/* Goal Setting Modal */}
      {showGoalModal && selectedEmployee && (
        <GoalSettingModal
          employee={selectedEmployee as GoalEmployee}
          open={showGoalModal}
          onClose={() => {
            setShowGoalModal(false);
            setSelectedEmployee(null);
          }}
          onAISuggestions={async () => {
            // Refresh team member goals after creating a new goal
            if (selectedEmployee) {
              await fetchTeamMemberGoals(selectedEmployee.id);
            }
          }}
        />
      )}

      {/* Manager Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' ? 'Approve Goal' : 'Reopen Goal'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve' 
                ? 'Approve this goal as completed. The employee will be notified.'
                : 'Reopen this goal. Provide feedback on what needs to be improved.'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedGoalForApproval && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-base font-semibold">Employee</Label>
                <p className="text-sm text-muted-foreground mt-1">{selectedGoalForApproval.employee.name}</p>
              </div>
              
              <div>
                <Label className="text-base font-semibold">Goal</Label>
                <p className="text-sm text-muted-foreground mt-1">{selectedGoalForApproval.goal.title}</p>
              </div>

              <div>
                <Label className="text-base font-semibold">Description</Label>
                <p className="text-sm text-muted-foreground mt-1">{selectedGoalForApproval.goal.description}</p>
              </div>

              {/* Milestones Review */}
              <div>
                <Label className="text-base font-semibold">Completed Milestones</Label>
                <div className="mt-2 space-y-2">
                  {selectedGoalForApproval.goal.milestones?.map((milestone) => (
                    <div key={milestone.id} className="p-3 bg-muted/50 rounded-lg border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">{milestone.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground ml-6">
                        Completed: {milestone.completedDate ? new Date(milestone.completedDate).toLocaleDateString() : 'N/A'}
                        {milestone.evidence && (
                          <span className="ml-2">• Evidence: {milestone.evidence}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="comment">
                  {approvalAction === 'approve' ? 'Comments (Optional)' : 'Feedback (Required)'}
                </Label>
                <Textarea
                  id="comment"
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder={approvalAction === 'approve' 
                    ? 'Add any comments about this goal completion...'
                    : 'Explain what needs to be improved or completed...'}
                  className="mt-2 min-h-[100px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowApprovalDialog(false);
              setSelectedGoalForApproval(null);
              setApprovalComment("");
              setApprovalAction(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedGoalForApproval) return;
                
                try {
                  if (approvalAction === 'approve') {
                    // Approve the goal via API
                    await updateGoal(selectedGoalForApproval.goal.id, {
                      managerApproved: true,
                      status: 'completed'
                    });
                    
                    // Remove from pending list
                    setPendingApprovalGoals(prev => 
                      prev.filter(item => item.goal.id !== selectedGoalForApproval.goal.id)
                    );
                  } else if (approvalAction === 'reopen') {
                    // Reopen the goal via API
                    if (!approvalComment.trim()) {
                      toast({
                        title: "Feedback Required",
                        description: "Please provide feedback when reopening a goal.",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    // Update all milestones with manager comment
                    const updatedMilestones = (selectedGoalForApproval.goal.milestones || []).map(m => ({
                      ...m,
                      managerReopened: true,
                      managerComment: approvalComment.trim()
                    }));
                    
                    await updateGoal(selectedGoalForApproval.goal.id, {
                      managerReopened: true,
                      status: 'manager_reopened',
                      milestones: updatedMilestones
                    });
                    
                    // Remove from pending list
                    setPendingApprovalGoals(prev => 
                      prev.filter(item => item.goal.id !== selectedGoalForApproval.goal.id)
                    );
                  }
                  
                  setShowApprovalDialog(false);
                  setSelectedGoalForApproval(null);
                  setApprovalComment("");
                  setApprovalAction(null);
                  
                  // Refresh team member goals
                  if (selectedGoalForApproval.employee.id) {
                    await fetchTeamMemberGoals(selectedGoalForApproval.employee.id);
                  }
                } catch (error) {
                  console.error("Error processing approval:", error);
                }
              }}
              className={approvalAction === 'approve' 
                ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                : "bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20"}
            >
              {approvalAction === 'approve' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Goal
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reopen Goal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  Comment (Required)
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
            <Button variant="outline" onClick={() => {
              setShowMilestoneDialog(false);
              setSelectedMilestone(null);
              setEvidenceFile(null);
              setEvidenceFileName("");
              setMilestoneComment("");
            }}>
              Cancel
            </Button>
            {selectedMilestone?.milestone.completed ? (
              <Button 
                variant="outline"
                className="border-orange-500/20 text-orange-600 hover:bg-orange-500/10"
                onClick={handleReopenMilestone}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reopen Milestone
              </Button>
            ) : (
              <Button onClick={handleCompleteMilestone}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Completed
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
            <Button variant="outline" onClick={() => {
              setShowAddMilestoneDialog(false);
              setSelectedGoalForMilestone(null);
              setNewMilestoneTitle("");
              setNewMilestoneDueDate("");
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddMilestone}>
              <Plus className="h-4 w-4 mr-2" />
              Add Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

