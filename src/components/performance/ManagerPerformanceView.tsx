import { useState, useEffect, useMemo, useRef } from "react";
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
  X,
  Loader2
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGoals, Goal as APIGoal, Milestone as APIMilestone } from "@/hooks/use-goals";
import { useEmployees } from "@/hooks/use-employees";
import { GoalSettingModal, Employee as GoalEmployee } from "./GoalSettingModal";
import { GoalDetailPanel, GoalDetailSnapshot } from "./GoalDetailPanel";
import { ReviewForms } from "./ReviewForms";
import { ContinuousFeedback } from "./ContinuousFeedback";
import { ManagerSignOff } from "./ManagerSignOff";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { GoalSummaryCard } from "./GoalSummaryCard";
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
import { calculateGoalDistribution } from "@/utils/goal-distribution";

interface Employee {
  id: string;
  name: string;
  email?: string;
  position: string;
  department: string;
  yearsOfExperience?: number;
  skills?: string[];
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
  userComment?: string;
}

interface Goal {
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
  weightage?: number;
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
    weightage: goal.weightage,
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
    weightage: goal.weightage,
    createdAt: goal.created_at || new Date().toISOString(),
    milestones: goal.milestones || [],
    managerApproved: goal.managerApproved,
    managerReopened: goal.managerReopened
  };
};

const toTeamGoalSnapshot = (goal: Goal): GoalDetailSnapshot => ({
  id: goal.id,
  title: goal.title,
  status: goal.status,
  completion: goal.completion,
  category: goal.category,
  targetDate: goal.targetDate,
  description: goal.description,
  managerApproved: goal.managerApproved,
  managerReopened: goal.managerReopened,
  milestones: goal.milestones ?? []
});

const toMyGoalSnapshot = (goal: MyGoal): GoalDetailSnapshot => ({
  id: goal.id,
  title: goal.title,
  status: goal.status,
  completion: goal.completion,
  category: goal.category,
  targetDate: goal.targetDate,
  description: goal.description,
  managerApproved: goal.managerApproved,
  managerReopened: goal.managerReopened,
  milestones: goal.milestones ?? []
});

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

export function ManagerPerformanceView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getEmployeeGoals, getGoal, createGoal, updateGoal, deleteGoal, createMilestone, updateMilestone, deleteMilestone } = useGoals();
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
  const [originalComment, setOriginalComment] = useState<string>(""); // Store original comment for comparison
  const [isMilestoneLoading, setIsMilestoneLoading] = useState(false);
  
  // Add milestone states
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState<string>("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState<string>("");
  const [isAddMilestoneLoading, setIsAddMilestoneLoading] = useState(false);
  
  // Submit goal state
  const [submittingGoalId, setSubmittingGoalId] = useState<string | null>(null);
  
  // Edit goal states
  const [selectedGoalForEdit, setSelectedGoalForEdit] = useState<Goal | null>(null);
  const [showEditGoalDialog, setShowEditGoalDialog] = useState(false);
  const [editGoalForm, setEditGoalForm] = useState({
    title: "",
    description: "",
    category: "Business/Project Goals",
    targetDate: "",
    weightage: 10
  });
  
  // Goals pending approval (fetched from API)
  const [pendingApprovalGoals, setPendingApprovalGoals] = useState<Array<{ goal: Goal; employee: Employee }>>([]);

  const [goalPanelState, setGoalPanelState] = useState<{
    open: boolean;
    goalId: string | null;
    summary: GoalDetailSnapshot | null;
    categoryGoals?: GoalDetailSnapshot[];
    categoryName?: string;
    employee: { id: string; name: string; role?: string; department?: string; avatarUrl?: string } | null;
  }>({ open: false, goalId: null, summary: null, employee: null });
  const goalPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const goalPanelId = "manager-goal-detail-panel";

  const managerRecord = useMemo(() => {
    if (!currentManagerEmployeeId) return null;
    return employees.find(emp => emp.id === currentManagerEmployeeId) ?? null;
  }, [currentManagerEmployeeId, employees]);

  const managerSummary = useMemo(() => {
    if (managerRecord) {
      return {
        id: managerRecord.id,
        name: managerRecord.name,
        role: managerRecord.position,
        department: managerRecord.department,
        avatarUrl: managerRecord.photoUrl
      };
    }

    if (user?.name || user?.email) {
      return {
        id: currentManagerEmployeeId ?? "",
        name: user?.name ?? user?.email ?? "Manager"
      };
    }

    return null;
  }, [currentManagerEmployeeId, managerRecord, user?.email, user?.name]);

  const openEditGoalDialog = (goalToEdit: Goal, owner: Employee) => {
    setSelectedEmployee(owner);

    let dateValue = goalToEdit.targetDate || "";
    if (dateValue.includes("T")) {
      dateValue = dateValue.split("T")[0];
    } else if (dateValue && !dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      try {
        const parsed = new Date(dateValue);
        if (!Number.isNaN(parsed.getTime())) {
          dateValue = parsed.toISOString().split("T")[0];
        }
      } catch (error) {
        console.warn("Could not parse date:", dateValue);
      }
    }

    setEditGoalForm({
      title: goalToEdit.title || "",
      description: goalToEdit.description || "",
      category: normalizeCategory(goalToEdit.category),
      targetDate: dateValue,
      weightage: goalToEdit.weightage || 10
    });

    setSelectedGoalForEdit(goalToEdit);
    setTimeout(() => {
      setShowEditGoalDialog(true);
    }, 0);
  };

  const handleOpenGoalPanel = (goal: Goal, employee: Employee, trigger: HTMLButtonElement | null) => {
    goalPanelTriggerRef.current = trigger;
    setGoalPanelState({
      open: true,
      goalId: goal.id,
      summary: toTeamGoalSnapshot(goal),
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.position,
        department: employee.department,
        avatarUrl: employee.photoUrl
      }
    });
  };

  const handleOpenCategoryGoals = (category: string, categoryGoals: Goal[], employee: Employee, trigger: HTMLButtonElement | null) => {
    goalPanelTriggerRef.current = trigger;
    const categorySnapshots = categoryGoals.map(toTeamGoalSnapshot);
    setGoalPanelState({
      open: true,
      goalId: null,
      summary: null,
      categoryGoals: categorySnapshots,
      categoryName: category,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.position,
        department: employee.department,
        avatarUrl: employee.photoUrl
      }
    });
  };

  const handleOpenMyGoalPanel = (goal: MyGoal, trigger: HTMLButtonElement | null) => {
    goalPanelTriggerRef.current = trigger;
    setGoalPanelState({
      open: true,
      goalId: goal.id,
      summary: toMyGoalSnapshot(goal),
      employee: managerSummary
    });
  };

  const handleCloseGoalPanel = () => {
    setGoalPanelState((prev) => ({ ...prev, open: false }));
  };

  const handlePanelEditGoal = (goalId: string) => {
    const ownerId = goalPanelState.employee?.id;
    if (ownerId) {
      const ownerEmployee = employees.find((emp) => emp.id === ownerId) ?? null;
      const teamGoals = employeeGoals.get(ownerId) ?? [];
      const teamGoal = teamGoals.find((g) => g.id === goalId);
      if (teamGoal && ownerEmployee) {
        openEditGoalDialog(teamGoal, ownerEmployee);
        return;
      }
    }

    const myGoalRecord = myGoals.find((g) => g.id === goalId);
    if (myGoalRecord && managerRecord) {
      const converted: Goal = {
        id: myGoalRecord.id,
        employeeId: managerRecord.id,
        title: myGoalRecord.title,
        description: myGoalRecord.description,
        category: myGoalRecord.category,
        targetDate: myGoalRecord.targetDate,
        status: myGoalRecord.status,
        completion: myGoalRecord.completion,
        weightage: myGoalRecord.weightage,
        createdAt: new Date().toISOString(),
        milestones: myGoalRecord.milestones ?? [],
        managerApproved: myGoalRecord.managerApproved,
        managerReopened: myGoalRecord.managerReopened
      };
      openEditGoalDialog(converted, managerRecord);
    }
  };

  // Initialize edit form when goal is selected for editing
  useEffect(() => {
    if (selectedGoalForEdit && showEditGoalDialog) {
      // Extract date part (handle both ISO format and date-only format)
      let dateValue = selectedGoalForEdit.targetDate;
      if (dateValue.includes('T')) {
        dateValue = dateValue.split('T')[0];
      } else if (dateValue && !dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Handle date strings like "30/11/2025" or other formats
        try {
          const date = new Date(dateValue);
          if (!isNaN(date.getTime())) {
            dateValue = date.toISOString().split('T')[0];
          }
        } catch (e) {
          console.warn("Could not parse date:", dateValue);
        }
      }
      
      setEditGoalForm({
        title: selectedGoalForEdit.title || "",
        description: selectedGoalForEdit.description || "",
        category: normalizeCategory(selectedGoalForEdit.category),
        targetDate: dateValue || "",
        weightage: selectedGoalForEdit.weightage || 10
      });
    }
  }, [selectedGoalForEdit, showEditGoalDialog]);

  // Mock growth data for manager's own goals
  const growthData = [
    { month: "Jan", performance: 65, goalsCompleted: 1 },
    { month: "Feb", performance: 72, goalsCompleted: 2 },
    { month: "Mar", performance: 78, goalsCompleted: 2 },
    { month: "Apr", performance: 82, goalsCompleted: 3 },
    { month: "May", performance: 88, goalsCompleted: 4 },
    { month: "Jun", performance: 85, goalsCompleted: 3 }
  ];

  // Calculate goal distribution using shared utility function
  const categoryData = calculateGoalDistribution(myGoals);

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

  // Fetch goals for a team member (with caching check)
  const fetchTeamMemberGoals = async (employeeId: string, forceRefresh: boolean = false) => {
    // Check if we already have goals for this employee in the Map
    if (!forceRefresh && employeeGoals.has(employeeId)) {
      // Goals already loaded, no need to fetch again
      return;
    }
    
    try {
      setLoadingTeamGoals(true);
      setLoadingGoalEmployeeId(employeeId);
      const apiGoals = await getEmployeeGoals(employeeId, forceRefresh);
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

  // Fetch goals for all direct reports when they're loaded (pre-load all team goals)
  useEffect(() => {
    const fetchAllTeamGoals = async () => {
      if (!currentManagerEmployeeId || directReports.length === 0) return;
      
      try {
        // Fetch goals for all direct reports in parallel (only if not already cached)
        const reportsToFetch = directReports.filter(report => !employeeGoals.has(report.id));
        
        if (reportsToFetch.length === 0) {
          // All goals already loaded
          return;
        }
        
        const goalsPromises = reportsToFetch.map(async (report) => {
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
  }, [currentManagerEmployeeId, directReports, getEmployeeGoals, employeeGoals]);

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
           emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  // Helper function to find which employee a goal belongs to
  const findEmployeeIdForGoal = (goalId: string): string | null => {
    // Check if it's the manager's own goal
    if (myGoals.some(g => g.id === goalId)) {
      return currentManagerEmployeeId;
    }
    
    // Check team member goals
    for (const [employeeId, goals] of employeeGoals.entries()) {
      if (goals.some(g => g.id === goalId)) {
        return employeeId;
      }
    }
    
    return null;
  };

  // Milestone handlers for manager's own goals and team member goals
  const handleMilestoneClick = (goalId: string, milestone: Milestone) => {
    setSelectedMilestone({ goalId, milestone });
    setShowMilestoneDialog(true);
    setEvidenceFile(null);
    setEvidenceFileName("");
    // Store original comment for comparison
    const existingComment = milestone.userComment || milestone.managerComment || "";
    setOriginalComment(existingComment);
    // If reopening (milestone is completed), leave comment field empty
    // If completing (milestone is not completed), prefill with existing comment if available
    if (milestone.completed) {
      setMilestoneComment(""); // Empty when reopening
    } else {
      setMilestoneComment(existingComment); // Prefill when completing
    }
  };

  const handleCompleteMilestone = async () => {
    if (!selectedMilestone) return;

    const trimmedComment = milestoneComment.trim();
    if (!trimmedComment) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment before completing the milestone.",
        variant: "destructive"
      });
      return;
    }

    // If there was an original comment, require that it has been modified
    if (originalComment && trimmedComment === originalComment.trim()) {
      toast({
        title: "Comment Required",
        description: "Please update the comment or provide a new one before completing the milestone.",
        variant: "destructive"
      });
      return;
    }

    const { goalId, milestone } = selectedMilestone;
    
    try {
      setIsMilestoneLoading(true);
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: true,
        completedDate: new Date().toISOString(),
        evidence: evidenceFile ? evidenceFileName : milestone.evidence,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Find which employee this goal belongs to and refresh their goals
        const employeeId = findEmployeeIdForGoal(goalId);
        if (employeeId) {
          if (employeeId === currentManagerEmployeeId) {
            // Manager's own goal
            const apiGoals = await getEmployeeGoals(currentManagerEmployeeId, true);
            const convertedGoals = apiGoals.map(convertGoalToMyGoal);
            setMyGoals(convertedGoals);
          } else {
            // Team member's goal - refresh their goals in the cache
            await fetchTeamMemberGoals(employeeId, true);
          }
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
        setOriginalComment("");
      }
    } catch (error) {
      console.error("Error completing milestone:", error);
    } finally {
      setIsMilestoneLoading(false);
    }
  };

  const handleReopenMilestone = async () => {
    if (!selectedMilestone) return;

    const trimmedComment = milestoneComment.trim();
    if (!trimmedComment) {
      toast({
        title: "Comment Required",
        description: "Please provide a comment explaining why you're reopening this milestone.",
        variant: "destructive"
      });
      return;
    }
    // When reopening, comment field starts empty, so no need to check if it's different from original

    const { goalId, milestone } = selectedMilestone;
    
    try {
      setIsMilestoneLoading(true);
      const updatedMilestone = await updateMilestone(goalId, milestone.id, {
        completed: false,
        completedDate: undefined,
        userComment: milestoneComment.trim()
      });

      if (updatedMilestone) {
        // Find which employee this goal belongs to and refresh their goals
        const employeeId = findEmployeeIdForGoal(goalId);
        if (employeeId) {
          if (employeeId === currentManagerEmployeeId) {
            // Manager's own goal
            const apiGoals = await getEmployeeGoals(currentManagerEmployeeId, true);
            const convertedGoals = apiGoals.map(convertGoalToMyGoal);
            setMyGoals(convertedGoals);
          } else {
            // Team member's goal - refresh their goals in the cache
            await fetchTeamMemberGoals(employeeId, true);
          }
        }

        setShowMilestoneDialog(false);
        setSelectedMilestone(null);
        setEvidenceFile(null);
        setEvidenceFileName("");
        setMilestoneComment("");
        setOriginalComment("");
      }
    } catch (error) {
      console.error("Error reopening milestone:", error);
    } finally {
      setIsMilestoneLoading(false);
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
      setIsAddMilestoneLoading(true);
      const newMilestone = await createMilestone(selectedGoalForMilestone, {
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDueDate
      });

      if (newMilestone) {
        // Find which employee this goal belongs to and refresh their goals
        const employeeId = findEmployeeIdForGoal(selectedGoalForMilestone);
        if (employeeId) {
          if (employeeId === currentManagerEmployeeId) {
            // Manager's own goal
            const apiGoals = await getEmployeeGoals(currentManagerEmployeeId, true);
            const convertedGoals = apiGoals.map(convertGoalToMyGoal);
            setMyGoals(convertedGoals);
          } else {
            // Team member's goal - refresh their goals in the cache
            await fetchTeamMemberGoals(employeeId, true);
          }
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
    if (!currentManagerEmployeeId) return;

    try {
      setSubmittingGoalId(goalId);
      await updateGoal(goalId, { status: 'pending_manager_approval' });
      // Refresh manager's own goals
      const apiGoals = await getEmployeeGoals(currentManagerEmployeeId, true);
      const convertedGoals = apiGoals.map(convertGoalToMyGoal);
      setMyGoals(convertedGoals);
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

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">My Team</p>
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
                <p className="text-sm font-medium text-muted-foreground">Individual goal set</p>
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
                <p className="text-sm font-medium text-muted-foreground">Performance Review's Set</p>
                <p className="text-3xl font-bold mt-2">
                  {0}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => {
        preserveScroll();
        setViewMode(v as any);
        // When switching to "my-team" tab, ensure all team goals are loaded
        if (v === 'my-team' && currentManagerEmployeeId && directReports.length > 0) {
          // Check if any team member goals are missing and fetch them
          const missingGoals = directReports.filter(report => !employeeGoals.has(report.id));
          if (missingGoals.length > 0) {
            // Fetch missing goals in parallel
            Promise.all(missingGoals.map(report => fetchTeamMemberGoals(report.id)));
          }
        }
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
                    // Only fetch if goals are not already loaded
                    if (!employeeGoals.has(employee.id)) {
                      await fetchTeamMemberGoals(employee.id);
                    }
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
                    const goalToEdit = employeeGoalsList.find(g => g.id === goalId);
                    if (goalToEdit) {
                      openEditGoalDialog(goalToEdit, employee);
                    }
                  }}
                  onDeleteGoal={async (goalId) => {
                    setSelectedEmployee(employee);
                    await deleteGoal(goalId);
                    // Force refresh to get updated goals after deletion
                    await fetchTeamMemberGoals(employee.id, true);
                  }}
                  onOpenGoal={(goal, teamMember, trigger) => handleOpenGoalPanel(goal, teamMember, trigger)}
                  onOpenCategoryGoals={(category, categoryGoals, teamMember, trigger) => handleOpenCategoryGoals(category, categoryGoals, teamMember, trigger)}
                  activeGoalId={goalPanelState.open ? goalPanelState.goalId : null}
                  panelId={goalPanelId}
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
                      onOpen={(_, trigger) => handleOpenMyGoalPanel(goal, trigger)}
                      isOpen={goalPanelState.open && goalPanelState.goalId === goal.id}
                      controlsId={goalPanelId}
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

      <GoalDetailPanel
        open={goalPanelState.open}
        goalId={goalPanelState.goalId}
        summary={goalPanelState.summary}
        categoryGoals={goalPanelState.categoryGoals}
        categoryName={goalPanelState.categoryName}
        employee={goalPanelState.employee ?? managerSummary}
        onClose={handleCloseGoalPanel}
        getGoal={getGoal}
        onEditGoal={
          // Only show Edit Goal for team member goals, not for manager's own goals
          goalPanelState.employee?.id && goalPanelState.employee.id !== currentManagerEmployeeId
            ? handlePanelEditGoal
            : undefined
        }
        onAddMilestone={handleAddMilestoneClick}
        onMilestoneClick={handleMilestoneClick}
        onSubmitGoal={
          // Only show Submit for Review for manager's own goals
          goalPanelState.employee?.id === currentManagerEmployeeId
            ? handleSubmitGoal
            : undefined
        }
        isSubmittingGoal={submittingGoalId === goalPanelState.goalId}
        triggerRef={goalPanelTriggerRef}
        panelId={goalPanelId}
      />
 
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

      {/* Edit Goal Dialog */}
      <Dialog open={showEditGoalDialog} onOpenChange={setShowEditGoalDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
            <DialogDescription>
              Update the goal details below
            </DialogDescription>
          </DialogHeader>
          
          {selectedGoalForEdit && (
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-goal-title">
                  Goal Title
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Input
                  id="edit-goal-title"
                  value={editGoalForm.title}
                  onChange={(e) => setEditGoalForm({ ...editGoalForm, title: e.target.value })}
                  placeholder="e.g., Master React Performance Optimization"
                  className="mt-2"
                  required
                />
    </div>

              <div>
                <Label htmlFor="edit-goal-description">Description</Label>
                <Textarea
                  id="edit-goal-description"
                  value={editGoalForm.description}
                  onChange={(e) => setEditGoalForm({ ...editGoalForm, description: e.target.value })}
                  placeholder="Describe the goal in detail..."
                  className="mt-2 min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-goal-category">
                    Category
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Select 
                    value={editGoalForm.category || ""} 
                    onValueChange={(value) => setEditGoalForm({ ...editGoalForm, category: value })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Business/Project Goals">Business/Project Goals</SelectItem>
                      <SelectItem value="Functional/Behavioral Competencies">Functional/Behavioral Competencies</SelectItem>
                      <SelectItem value="Innovation/Initiatives/Collaboration">Innovation/Initiatives/Collaboration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-goal-target-date">
                    Target Date
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="edit-goal-target-date"
                    type="date"
                    value={editGoalForm.targetDate}
                    onChange={(e) => setEditGoalForm({ ...editGoalForm, targetDate: e.target.value })}
                    className="mt-2"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-goal-weightage">
                  Weightage (%)
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Select 
                  value={editGoalForm.weightage?.toString() || "10"} 
                  onValueChange={(value) => setEditGoalForm({ ...editGoalForm, weightage: parseInt(value) })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select weightage" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                      <SelectItem key={value} value={value.toString()}>
                        {value}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Select the percentage weightage for this goal (max 100%)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEditGoalDialog(false);
                setSelectedGoalForEdit(null);
                setEditGoalForm({
                  title: "",
                  description: "",
                  category: "Business/Project Goals",
                  targetDate: "",
                  weightage: 10
                });
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!selectedGoalForEdit) return;
                
                if (!editGoalForm.title.trim() || !editGoalForm.targetDate) {
                  toast({
                    title: "Validation Error",
                    description: "Please fill in all required fields (Title and Target Date).",
                    variant: "destructive"
                  });
                  return;
                }

                try {
                  const updateData = {
                    title: editGoalForm.title.trim(),
                    description: editGoalForm.description || undefined,
                    category: editGoalForm.category,
                    targetDate: editGoalForm.targetDate,
                    weightage: editGoalForm.weightage
                  };

                  const updatedGoal = await updateGoal(selectedGoalForEdit.id, updateData);
                  
                  if (updatedGoal) {
                    // Refresh goals for the employee
                    if (selectedEmployee) {
                      await fetchTeamMemberGoals(selectedEmployee.id, true);
                    }
                    
                    toast({
                      title: "Success",
                      description: "Goal updated successfully",
                    });
                    
                    setShowEditGoalDialog(false);
                    setSelectedGoalForEdit(null);
                    setEditGoalForm({
                      title: "",
                      description: "",
                      category: "Business/Project Goals",
                      targetDate: "",
                      weightage: 10
                    });
                  }
                } catch (error) {
                  console.error("Error updating goal:", error);
                  toast({
                    title: "Error",
                    description: "Failed to update goal",
                    variant: "destructive"
                  });
                }
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                {originalComment && !selectedMilestone.milestone.completed && (
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Previous comment is shown below. Please update it or provide a new comment.
                  </p>
                )}
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
                    : (originalComment && milestoneComment.trim() === originalComment.trim()
                        ? "Please update the comment or provide a new one before completing."
                        : "Please provide a comment before completing this milestone.")}
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

