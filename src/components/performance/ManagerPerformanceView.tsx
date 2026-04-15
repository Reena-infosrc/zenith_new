import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Loader2,
  ChevronLeft,
  Save,
  Star,
  SquarePen,
  AlertCircle
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
import { ManagerReviewWorkspace } from "./ManagerReviewWorkspace";
import { ContinuousFeedback } from "./ContinuousFeedback";
import { EmployeeSelfAssessment } from "./EmployeeSelfAssessment";
import { UserPerformanceView } from "./UserPerformanceView";
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
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { getCachedManagerData, getCachedViewMode } from "@/hooks/use-performance-preload";
import { usePerformancePreload } from "@/hooks/use-performance-preload";

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
  // Employment status from employee API: "active" (default) or "inactive"
  status?: string;
}

type EmployeeReviewStatus =
  | 'not_started'
  | 'self_submitted'
  | 'manager_reviewing'
  | 'clarification_requested'
  | 'clarification_responded'
  | 'needs_clarification'
  | 'manager_submitted'
  | 'hr_approved';

type ManagerFilter =
  | 'needs_clarification'
  | 'review_pending'
  | 'review_completed'
  | 'has_goals';

const FILTER_DESCRIPTIONS: Record<ManagerFilter, string> = {
  needs_clarification: 'reviews needing clarification',
  review_pending: 'performance reviews pending action',
  review_completed: 'completed performance reviews',
  has_goals: 'at least one individual goal set'
};

const clarificationStatuses: EmployeeReviewStatus[] = ['clarification_requested', 'needs_clarification'];

const pendingReviewStatuses: EmployeeReviewStatus[] = [
  'self_submitted',
  'manager_reviewing',
  'clarification_responded',
  'needs_clarification'
];

const isClarificationStatus = (status?: EmployeeReviewStatus | null) =>
  !!status && clarificationStatuses.includes(status as EmployeeReviewStatus);

const isPendingReviewStatus = (status?: EmployeeReviewStatus | null) =>
  !!status && pendingReviewStatuses.includes(status);

type DirectReport = Employee & {
  reviewStatus: EmployeeReviewStatus;
};

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

const MAX_MILESTONES_PER_GOAL = 5;

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
  weightage: goal.weightage,
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
  weightage: goal.weightage,
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
  const { getEmployeeGoals, getBatchEmployeeGoals, getGoal, createGoal, updateGoal, deleteGoal, createMilestone, updateMilestone, deleteMilestone } = useGoals();
  const { employees } = useEmployees();
  const { getCachedData, updateCachedGoals } = usePerformancePreload();

  const [directReports, setDirectReports] = useState<DirectReport[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [myGoals, setMyGoals] = useState<MyGoal[]>([]);
  const [employeeGoals, setEmployeeGoals] = useState<Map<string, Goal[]>>(new Map());
  const [currentManagerEmployeeId, setCurrentManagerEmployeeId] = useState<string | null>(null);
  const [loadingMyGoals, setLoadingMyGoals] = useState(true);
  const [loadingTeamGoals, setLoadingTeamGoals] = useState(false);
  const [loadingGoalEmployeeId, setLoadingGoalEmployeeId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [reviewsCount, setReviewsCount] = useState<number>(0);
  const [loadingReviewsCount, setLoadingReviewsCount] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [employeeReviewStatuses, setEmployeeReviewStatuses] = useState<Map<string, EmployeeReviewStatus>>(new Map());
  const [activeCycle, setActiveCycle] = useState<any | null>(null);
  const [loadingActiveCycle, setLoadingActiveCycle] = useState(false);
  const [allCycles, setAllCycles] = useState<any[]>([]);
  const [showSelfAssessmentForm, setShowSelfAssessmentForm] = useState(false);
  const [selectedCycleYear, setSelectedCycleYear] = useState<string | null>(null);
  const [loadingAllCycles, setLoadingAllCycles] = useState(false);
  // Store all goals from employee goals endpoint - no need for separate getGoal calls
  const allGoalsCache = useRef<Map<string, APIGoal>>(new Map());

  // Cached version of getGoal that uses already-loaded employee goals data
  const getCachedGoal = useCallback(async (goalId: string): Promise<APIGoal | null> => {
    // Check our cache first (from employee goals endpoint)
    const cached = allGoalsCache.current.get(goalId);
    if (cached) {
      return cached;
    }

    // If not found in cache, it means we don't have it yet
    // This shouldn't happen if we preload everything, but fallback to API if needed
    const detail = await getGoal(goalId);
    if (detail) {
      allGoalsCache.current.set(goalId, detail);
    }
    return detail;
  }, [getGoal]);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<ManagerFilter | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [viewMode, setViewMode] = useState<'my-team' | 'my-goals'>('my-team');
  const [showReviewWorkspace, setShowReviewWorkspace] = useState(false);
  const [reviewEmployee, setReviewEmployee] = useState<Employee | null>(null);
  const [hasReviewData, setHasReviewData] = useState(false);
  const saveDraftRef = useRef<(() => void) | null>(null);
  const { preserveScroll } = usePreserveScroll();

  // Manager approval states
  const [selectedGoalForApproval, setSelectedGoalForApproval] = useState<{ goal: Goal; employee: Employee } | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reopen' | 'reject' | null>(null);

  // Milestone states for manager's own goals
  const [selectedMilestone, setSelectedMilestone] = useState<{ goalId: string; milestone: Milestone } | null>(null);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState<string>("");
  const [milestoneComment, setMilestoneComment] = useState<string>("");
  const [originalComment, setOriginalComment] = useState<string>(""); // Store original comment for comparison
  const [isMilestoneLoading, setIsMilestoneLoading] = useState(false);

  const toggleFilter = (filter: ManagerFilter) => {
    setSearchTerm("");
    setActiveFilter((prev) => (prev === filter ? null : filter));
  };

  // Add milestone states
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState<string>("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState<string>("");
  const [isAddMilestoneLoading, setIsAddMilestoneLoading] = useState(false);

  // Submit goal state
  const [submittingGoalId, setSubmittingGoalId] = useState<string | null>(null);
  const [isEditingGoalLoading, setIsEditingGoalLoading] = useState(false);

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

  // Memoized calculation for available weightage (performance optimization)
  const availableWeightageForEdit = useMemo(() => {
    if (!selectedEmployee || !selectedGoalForEdit) return { otherGoalsWeightage: 0, maxAllowed: 100, options: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] };

    const employeeGoalsList = employeeGoals.get(selectedEmployee.id) || [];
    const otherGoalsWeightage = employeeGoalsList
      .filter(g => g.id !== selectedGoalForEdit.id)
      .reduce((sum, g) => sum + (g.weightage || 0), 0);

    const maxAllowed = 100 - otherGoalsWeightage;
    const options = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].filter(opt => opt <= maxAllowed);

    return { otherGoalsWeightage, maxAllowed, options };
  }, [selectedEmployee, selectedGoalForEdit, employeeGoals]);

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

  const clarificationCount = useMemo(
    () => Array.from(employeeReviewStatuses.values()).filter(isClarificationStatus).length,
    [employeeReviewStatuses]
  );
  const pendingReviewsCount = useMemo(
    () => Array.from(employeeReviewStatuses.values()).filter(isPendingReviewStatus).length,
    [employeeReviewStatuses]
  );
  const teamMembersWithGoalsCount = useMemo(
    () => directReports.filter((report) => (employeeGoals.get(report.id)?.length ?? 0) > 0).length,
    [directReports, employeeGoals]
  );

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
    // Goal details are already available from employee goals endpoint, no need to fetch
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

  const refreshGoalPanelStateForEmployee = useCallback((employeeId: string, goals: Goal[]) => {
    setGoalPanelState((prev) => {
      if (!prev.open || prev.employee?.id !== employeeId) {
        return prev;
      }

      let updatedSummary = prev.summary;
      let updatedCategoryGoals = prev.categoryGoals;

      if (prev.goalId) {
        const updatedGoal = goals.find((g) => g.id === prev.goalId);
        if (updatedGoal) {
          updatedSummary = toTeamGoalSnapshot(updatedGoal);
        }
      }

      if (prev.categoryGoals && prev.categoryGoals.length > 0 && prev.categoryName) {
        const filteredGoals = goals.filter(
          (g) => normalizeCategory(g.category) === prev.categoryName
        );
        updatedCategoryGoals = filteredGoals.map(toTeamGoalSnapshot);
      }

      return {
        ...prev,
        summary: updatedSummary,
        categoryGoals: updatedCategoryGoals
      };
    });
  }, []);

  // Track if initial data has been loaded to prevent re-fetching on navigation
  const initialDataLoadedRef = useRef<string | null>(null);

  // Initial data loading - load everything before showing UI (check cache first)
  useEffect(() => {
    // Skip if already loaded for this user
    if (initialDataLoadedRef.current === user?.email) {
      return;
    }

    const loadAllData = async () => {
      if (!user?.email || employees.length === 0) {
        setInitialLoading(false);
        return;
      }

      try {
        setInitialLoading(true);

        const employee = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
        if (!employee) {
          setInitialLoading(false);
          return;
        }

        const managerId = employee.id;
        setCurrentManagerEmployeeId(managerId);
        initialDataLoadedRef.current = user.email; // Mark as loaded

        // Check cache first
        const cachedDataRoot = getCachedData(user.email);
        const cachedManagerData = cachedDataRoot?.managerData;

        // Critical: Only use cache if it actually contains goals data. 
        // If teamGoals is empty, it means the preload likely failed/interrupted previously.
        if (cachedManagerData &&
          cachedManagerData.directReports.length > 0 &&
          cachedManagerData.teamGoals.size > 0) {

          console.log('📦 Using healthy cached manager data');

          // Use cached direct reports, but only keep active employees
          const cachedReports = cachedManagerData.directReports as DirectReport[];
          const activeCachedReports = cachedReports.filter((emp) => !emp.status || emp.status !== "inactive");
          setDirectReports(activeCachedReports);

          // Use manager's own goals from the root of cached data
          setLoadingMessage("Loading your goals...");
          const cachedManagerGoals = cachedDataRoot.goals || [];
          const convertedManagerGoals = cachedManagerGoals.map(convertGoalToMyGoal);
          setMyGoals(convertedManagerGoals);

          const managerTeamGoals = cachedManagerGoals.map(convertGoalToTeamGoal);
          refreshGoalPanelStateForEmployee(managerId, managerTeamGoals);

          cachedManagerGoals.forEach(goal => {
            allGoalsCache.current.set(goal.id, goal);
          });

          // Use cached team goals
          setLoadingMessage("Loading team goals...");
          const teamGoalsMap = new Map<string, Goal[]>();
          cachedManagerData.teamGoals.forEach((goals, employeeId) => {
            const convertedGoals = goals.map(convertGoalToTeamGoal);
            teamGoalsMap.set(employeeId, convertedGoals);

            // Also cache in allGoalsCache
            goals.forEach(goal => {
              allGoalsCache.current.set(goal.id, goal);
            });
          });

          setEmployeeGoals(teamGoalsMap);

          // Refresh goal panel state for all team members
          teamGoalsMap.forEach((goals, employeeId) => {
            refreshGoalPanelStateForEmployee(employeeId, goals);
          });

          setInitialLoading(false);
          setLoadingMyGoals(false);

          // Continue to fetch fresh data in background to ensure we see new goals (stale-while-revalidate)
          // We don't return here anymore, allowing the API calls below to proceed and update the state
          // asking for fresh data
        }

        // If not cached, load from API
        setLoadingMessage("Loading manager information...");

        setLoadingMessage("Loading team members...");
        const reports: DirectReport[] = employees
          // Only include active employees in manager's team
          .filter(emp => {
            const empStatus = (emp as any).status ?? "active";
            return emp.reporting_to === managerId && empStatus !== "inactive";
          })
          .map(emp => ({
            ...emp,
            yearsOfExperience: emp.experienceYears || 0,
            reviewStatus: 'not_started'
          }));
        setDirectReports(reports);

        setLoadingMessage("Loading your goals...");
        const managerApiGoals = await getEmployeeGoals(managerId);
        const convertedManagerGoals = managerApiGoals.map(convertGoalToMyGoal);
        setMyGoals(convertedManagerGoals);
        const managerTeamGoals = managerApiGoals.map(convertGoalToTeamGoal);
        refreshGoalPanelStateForEmployee(managerId, managerTeamGoals);

        managerApiGoals.forEach(goal => {
          allGoalsCache.current.set(goal.id, goal);
        });

        if (reports.length > 0) {
          setLoadingMessage(`Loading goals for ${reports.length} team member${reports.length !== 1 ? 's' : ''}...`);

          // Use batch endpoint for faster loading
          const teamEmployeeIds = reports.map(r => r.id);
          // Force refresh (pass true) to ensuring we get the latest goals including any pending approval
          const batchGoalsMap = await getBatchEmployeeGoals(teamEmployeeIds, true);

          // Convert to the format expected by the component
          const teamGoalsMap = new Map<string, Goal[]>();

          batchGoalsMap.forEach((apiGoals, employeeId) => {
            const convertedGoals = apiGoals.map(convertGoalToTeamGoal);
            teamGoalsMap.set(employeeId, convertedGoals);

            // Cache all goals
            apiGoals.forEach(goal => {
              allGoalsCache.current.set(goal.id, goal);
            });
          });

          // Ensure all employees have an entry (even if empty)
          reports.forEach(report => {
            if (!teamGoalsMap.has(report.id)) {
              teamGoalsMap.set(report.id, []);
            }
          });

          setEmployeeGoals(teamGoalsMap);

          // Refresh goal panel state for all team members
          teamGoalsMap.forEach((goals, employeeId) => {
            refreshGoalPanelStateForEmployee(employeeId, goals);
          });
        }

        setInitialLoading(false);
        setLoadingMyGoals(false);
        initialDataLoadedRef.current = user.email; // Mark as loaded after API fetch
      } catch (error) {
        console.error("Error loading initial data:", error);
        initialDataLoadedRef.current = null; // Allow retry on error
        toast({
          title: "Error",
          description: "Failed to load data. Please refresh the page.",
          variant: "destructive"
        });
        setInitialLoading(false);
        setLoadingMyGoals(false);
      }
    };

    loadAllData();
  }, [user?.email, employees.length, getEmployeeGoals, getBatchEmployeeGoals, getGoal, refreshGoalPanelStateForEmployee, toast]);

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

      // Cache all goals (already have full details from employee goals endpoint)
      apiGoals.forEach(goal => {
        allGoalsCache.current.set(goal.id, goal);
      });

      setEmployeeGoals(prev => {
        const newMap = new Map(prev);
        newMap.set(employeeId, convertedGoals);
        return newMap;
      });

      refreshGoalPanelStateForEmployee(employeeId, convertedGoals);
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

  // Fetch pending approval goals for team members (only after initial loading)
  useEffect(() => {
    const fetchPendingApprovalGoals = async () => {
      if (initialLoading || !currentManagerEmployeeId || directReports.length === 0) return;

      try {
        const pendingGoals: Array<{ goal: Goal; employee: Employee }> = [];

        // Use already loaded goals from employeeGoals map instead of fetching again
        for (const report of directReports) {
          const goals = employeeGoals.get(report.id) || [];
          const goalsPendingApproval = goals.filter(g => g.status === 'pending_manager_approval' || g.status === 'pending');

          for (const goal of goalsPendingApproval) {

            pendingGoals.push({
              goal: goal,
              employee: report
            });
          }
        }

        setPendingApprovalGoals(pendingGoals);
      } catch (error) {
        console.error("Error fetching pending approval goals:", error);
      }
    };

    if (!initialLoading && currentManagerEmployeeId && directReports.length > 0) {
      fetchPendingApprovalGoals();
    }
  }, [initialLoading, currentManagerEmployeeId, directReports, employeeGoals]);

  // Derive completed reviews count from employee status map
  useEffect(() => {
    if (loadingReviews) {
      setLoadingReviewsCount(true);
      return;
    }

    const completedReviews = Array.from(employeeReviewStatuses.values()).filter(
      (status) => status === 'manager_submitted' || status === 'hr_approved'
    ).length;

    setReviewsCount(completedReviews);
    setLoadingReviewsCount(false);
  }, [employeeReviewStatuses, loadingReviews]);

  // Fetch reviews for Annual Reviews section - OPTIMIZED with parallel requests (check cache first)
  const fetchReviews = useCallback(async () => {
    if (!user?.email || employees.length === 0) return;

    try {
      setLoadingReviews(true);

      // Find current user's employee record
      const currentUser = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
      if (!currentUser) {
        setLoadingReviews(false);
        return;
      }

      // For manager view: fetch reviews for direct reports
      // For user view: fetch reviews for the current user
      const employeeIds = currentManagerEmployeeId
        ? directReports.map(r => r.id) // Manager: get direct reports
        : [currentUser.id]; // User: get own reviews

      if (employeeIds.length === 0) {
        setLoadingReviews(false);
        return;
      }

      const allReviews: any[] = [];
      const statusMap = new Map<string, EmployeeReviewStatus>();

      // Check cache first for manager view
      let managerSubmitted: any[] = [];
      let managerDraft: any[] = [];
      let selfSubmitted: any[] = [];
      let selfDraft: any[] = [];

      const cachedManagerData = currentManagerEmployeeId && directReports.length > 0
        ? getCachedManagerData(user.email)
        : null;

      if (cachedManagerData && cachedManagerData.teamReviews) {
        console.log('📦 Using cached team reviews data');
        managerSubmitted = cachedManagerData.teamReviews.managerSubmitted || [];
        managerDraft = cachedManagerData.teamReviews.managerDraft || [];
        selfSubmitted = cachedManagerData.teamReviews.selfSubmitted || [];
        selfDraft = cachedManagerData.teamReviews.selfDraft || [];
      } else {
        // OPTIMIZATION: Use batch endpoint to fetch all reviews in a single API call
        // This reduces from 2N API calls (N employees × 2 review types) to just 2 calls
        const employeeIdsParam = employeeIds.join(',');

        // Fetch manager reviews and self reviews in parallel using batch endpoint
        // Fetch both draft and submitted reviews to ensure we get rejected reviews
        // Note: Batch endpoint doesn't support includeInactive, so we fetch both tables
        const [managerSubmittedResponse, managerDraftResponse, selfSubmittedResponse, selfDraftResponse] = await Promise.all([
          authenticatedFetch(
            `${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=false&includeInactive=true`,
            { method: 'GET' }
          ).catch((error) => {
            console.error('Error fetching manager submitted reviews batch:', error);
            return { ok: false, json: async () => [] };
          }),
          authenticatedFetch(
            `${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=true&includeInactive=true`,
            { method: 'GET' }
          ).catch((error) => {
            console.error('Error fetching manager draft reviews batch:', error);
            return { ok: false, json: async () => [] };
          }),
          authenticatedFetch(
            `${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=false`,
            { method: 'GET' }
          ).catch((error) => {
            console.error('Error fetching self submitted reviews batch:', error);
            return { ok: false, json: async () => [] };
          }),
          authenticatedFetch(
            `${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=true`,
            { method: 'GET' }
          ).catch((error) => {
            console.error('Error fetching self draft reviews batch:', error);
            return { ok: false, json: async () => [] };
          })
        ]);

        // Parse responses and combine draft and submitted reviews
        managerSubmitted = managerSubmittedResponse.ok
          ? await managerSubmittedResponse.json()
          : [];
        managerDraft = managerDraftResponse.ok
          ? await managerDraftResponse.json()
          : [];
        selfSubmitted = selfSubmittedResponse.ok
          ? await selfSubmittedResponse.json()
          : [];
        selfDraft = selfDraftResponse.ok
          ? await selfDraftResponse.json()
          : [];
      }

      const getReviewStatus = (review: any) => review?.status || review?.metadata?.status || '';

      // Combine manager reviews and deduplicate (prioritize processed statuses)
      const allManagerReviews = [...managerSubmitted, ...managerDraft];

      // Debug logging removed for security

      // Group by employeeId first, then deduplicate by reviewId within each employee
      const managerReviewsByEmployee = new Map<string, Map<string, any>>();
      const getPriority = (review: any) => {
        const isActive = review?.isActive !== false;
        return {
          isActive,
          isDraft: !!review?.isDraft,
          timestamp: new Date(review?.updatedAt || review?.submittedAt || review?.createdAt || 0).getTime()
        };
      };
      for (const review of allManagerReviews) {
        const reviewId = review.reviewId || review.id;
        const empId = review.employeeId;
        if (!reviewId || !empId) continue;

        if (!managerReviewsByEmployee.has(empId)) {
          managerReviewsByEmployee.set(empId, new Map());
        }

        const employeeReviews = managerReviewsByEmployee.get(empId)!;
        const existing = employeeReviews.get(reviewId);

        if (!existing) {
          employeeReviews.set(reviewId, review);
        } else {
          const existingPriority = getPriority(existing);
          const candidatePriority = getPriority(review);

          if (candidatePriority.isActive !== existingPriority.isActive) {
            if (candidatePriority.isActive) {
              employeeReviews.set(reviewId, review);
            }
            continue;
          }

          if (candidatePriority.isDraft !== existingPriority.isDraft) {
            if (!candidatePriority.isDraft) {
              employeeReviews.set(reviewId, review);
            }
            continue;
          }

          if (candidatePriority.timestamp >= existingPriority.timestamp) {
            employeeReviews.set(reviewId, review);
          }
        }
      }

      // Flatten back to array
      const managerReviews: any[] = [];
      for (const employeeReviewsMap of managerReviewsByEmployee.values()) {
        for (const review of employeeReviewsMap.values()) {
          managerReviews.push(review);
        }
      }

      // Debug logging removed for security

      // Combine self reviews
      const selfReviews = [...selfSubmitted, ...selfDraft];

      // Group reviews by employee ID for efficient processing
      const reviewsByEmployee = new Map<string, { manager: any[], self: any[] }>();

      // Initialize map for all employees
      employeeIds.forEach(empId => {
        reviewsByEmployee.set(empId, { manager: [], self: [] });
      });

      // Group manager reviews by employee
      managerReviews.forEach((review: any) => {
        const empId = review.employeeId;
        if (reviewsByEmployee.has(empId)) {
          reviewsByEmployee.get(empId)!.manager.push(review);
        }
        allReviews.push(review);
      });

      // Group self reviews by employee
      selfReviews.forEach((review: any) => {
        const empId = review.employeeId;
        if (reviewsByEmployee.has(empId)) {
          reviewsByEmployee.get(empId)!.self.push(review);
        }
        allReviews.push(review);
      });

      const getReviewTimestamp = (review: any) =>
        new Date(review.updatedAt || review.submittedAt || review.createdAt || 0).getTime();

      // Process reviews for each employee to determine status
      for (const empId of employeeIds) {
        const { manager, self } = reviewsByEmployee.get(empId) || { manager: [], self: [] };

        // Process manager reviews
        if (manager.length > 0) {
          let latestSubmitTs = -Infinity;
          let latestProcessedTs = -Infinity;
          let latestDraftTs = -Infinity;
          let latestHrApprovalTs = -Infinity;
          let latestProcessedStatus: 'needs_clarification' | 'clarification_requested' | null = null;
          let latestSubmittedReview: any = null;

          manager.forEach((review: any) => {
            const status = getReviewStatus(review);
            const timestamp = getReviewTimestamp(review);
            const isActive = review.isActive !== false;
            const isDraft = !!review.isDraft;
            const isSubmitted = !isDraft && (status === 'manager_submitted' || review.submittedAt) && isActive;
            const isProcessedStatus =
              status === 'needs_clarification' ||
              status === 'changes_requested' ||
              status === 'hr_rejected' ||
              status === 'clarification_requested';
            const isHrApprovedStatus =
              status === 'hr_approved' ||
              status === 'approved' ||
              status === 'finalized';

            if (isSubmitted && timestamp > latestSubmitTs) {
              latestSubmitTs = timestamp;
              latestSubmittedReview = review;
            }

            if (isDraft && isActive && timestamp > latestDraftTs) {
              latestDraftTs = timestamp;
            }

            if (isProcessedStatus && timestamp > latestProcessedTs) {
              latestProcessedTs = timestamp;
              latestProcessedStatus = status === 'clarification_requested' ? 'clarification_requested' : 'needs_clarification';
            }

            if (isHrApprovedStatus && timestamp > latestHrApprovalTs) {
              latestHrApprovalTs = timestamp;
            }
          });

          console.log('[ManagerPerformanceView] Status timeline', {
            empId,
            latestSubmitTs,
            latestProcessedTs,
            latestDraftTs,
            latestProcessedStatus
          });

          if (latestHrApprovalTs !== -Infinity) {
            statusMap.set(empId, 'hr_approved');
          } else if (latestProcessedTs !== -Infinity && (latestSubmitTs === -Infinity || latestProcessedTs >= latestSubmitTs)) {
            statusMap.set(empId, latestProcessedStatus || 'needs_clarification');
          } else if (latestSubmitTs !== -Infinity && latestSubmittedReview?.isActive !== false) {
            statusMap.set(empId, 'manager_submitted');
          } else if (latestDraftTs !== -Infinity) {
            statusMap.set(empId, 'manager_reviewing');
          }
        }

        // Process self reviews
        if (self.length > 0) {
          // Check if employee has responded to clarification
          const respondedSelfReview = self.find((r: any) => {
            const metadataStatus = getReviewStatus(r);
            return metadataStatus === 'clarification_responded' ||
              (r.metadata?.employeeClarificationRespondedAt && r.submittedAt);
          });

          if (respondedSelfReview) {
            // Employee has responded to clarification - show notification
            statusMap.set(empId, 'clarification_responded');
          } else if (!statusMap.has(empId)) {
            // Check if employee has submitted self-review (only if no manager status set)
            const submittedSelfReview = self.find((r: any) => r.submittedAt && !r.isDraft);
            if (submittedSelfReview) {
              // Check if there was a clarification request that hasn't been responded to
              const selfReviewStatus = getReviewStatus(submittedSelfReview) as EmployeeReviewStatus;
              const hasPendingClarification = isClarificationStatus(selfReviewStatus) ||
                (submittedSelfReview.metadata?.clarificationRequests &&
                  submittedSelfReview.metadata.clarificationRequests.some((req: any) => req.status === 'pending'));

              if (hasPendingClarification) {
                statusMap.set(empId, 'clarification_requested');
              } else {
                statusMap.set(empId, 'self_submitted');
              }
            }
          }
        }
      }

      // Sort by cycle year and created date (most recent first)
      allReviews.sort((a, b) => {
        const yearA = String(a.cycleYear || '');
        const yearB = String(b.cycleYear || '');
        if (yearA !== yearB) {
          return yearB.localeCompare(yearA);
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      setReviews(allReviews);
      setEmployeeReviewStatuses(statusMap);

      setDirectReports((prev) => {
        let hasChanges = false;
        const next = prev.map((report) => {
          const status = statusMap.get(report.id);
          if (!status || report.reviewStatus === status) {
            return report;
          }
          hasChanges = true;
          return { ...report, reviewStatus: status };
        });
        return hasChanges ? next : prev;
      });
    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast({
        title: "Error",
        description: "Failed to load reviews",
        variant: "destructive"
      });
    } finally {
      setLoadingReviews(false);
    }
  }, [user, employees, currentManagerEmployeeId, directReports, toast]);

  // Memoize employee IDs to prevent unnecessary re-fetches
  const employeeIdsForReviews = useMemo(() => {
    if (!currentManagerEmployeeId || directReports.length === 0) return [];
    return directReports.map(r => r.id);
  }, [currentManagerEmployeeId, directReports]);

  // Track if reviews have been loaded to prevent re-fetching on navigation
  const reviewsLoadedRef = useRef(false);

  useEffect(() => {
    // Skip if already loaded or if we have cached data
    if (reviewsLoadedRef.current) {
      return;
    }

    // Check if we have cached reviews data
    const cachedManagerData = currentManagerEmployeeId && directReports.length > 0
      ? getCachedManagerData(user?.email || '')
      : null;

    if (cachedManagerData && cachedManagerData.teamReviews) {
      console.log(' Using cached reviews - skipping fetchReviews API call');
      // Process cached reviews data
      const managerSubmitted = cachedManagerData.teamReviews.managerSubmitted || [];
      const managerDraft = cachedManagerData.teamReviews.managerDraft || [];
      const selfSubmitted = cachedManagerData.teamReviews.selfSubmitted || [];
      const selfDraft = cachedManagerData.teamReviews.selfDraft || [];

      // Process and set reviews from cache (same logic as fetchReviews but without API call)
      const allReviews: any[] = [];
      const statusMap = new Map<string, EmployeeReviewStatus>();

      const allManagerReviews = [...managerSubmitted, ...managerDraft];
      const selfReviews = [...selfSubmitted, ...selfDraft];

      // Group reviews by employee ID
      const reviewsByEmployee = new Map<string, { manager: any[], self: any[] }>();
      employeeIdsForReviews.forEach(empId => {
        reviewsByEmployee.set(empId, { manager: [], self: [] });
      });

      allManagerReviews.forEach((review: any) => {
        const empId = review.employeeId;
        if (reviewsByEmployee.has(empId)) {
          reviewsByEmployee.get(empId)!.manager.push(review);
        }
        allReviews.push(review);
      });

      selfReviews.forEach((review: any) => {
        const empId = review.employeeId;
        if (reviewsByEmployee.has(empId)) {
          reviewsByEmployee.get(empId)!.self.push(review);
        }
        allReviews.push(review);
      });

      // Process statuses (simplified - same logic as fetchReviews)
      const getReviewStatus = (review: any) => review?.status || review?.metadata?.status || '';
      const getReviewTimestamp = (review: any) =>
        new Date(review.updatedAt || review.submittedAt || review.createdAt || 0).getTime();

      for (const empId of employeeIdsForReviews) {
        const { manager, self } = reviewsByEmployee.get(empId) || { manager: [], self: [] };

        if (manager.length > 0) {
          let latestHrApprovalTs = -Infinity;
          let latestProcessedTs = -Infinity;
          let latestSubmitTs = -Infinity;
          let latestDraftTs = -Infinity;
          let latestProcessedStatus: 'needs_clarification' | 'clarification_requested' | null = null;

          manager.forEach((review: any) => {
            const status = getReviewStatus(review);
            const timestamp = getReviewTimestamp(review);
            const isActive = review.isActive !== false;
            const isDraft = !!review.isDraft;
            const isSubmitted = !isDraft && (status === 'manager_submitted' || review.submittedAt) && isActive;
            const isProcessedStatus = status === 'needs_clarification' || status === 'changes_requested' || status === 'hr_rejected' || status === 'clarification_requested';
            const isHrApprovedStatus = status === 'hr_approved' || status === 'approved' || status === 'finalized';

            if (isSubmitted && timestamp > latestSubmitTs) latestSubmitTs = timestamp;
            if (isDraft && isActive && timestamp > latestDraftTs) latestDraftTs = timestamp;
            if (isProcessedStatus && timestamp > latestProcessedTs) {
              latestProcessedTs = timestamp;
              latestProcessedStatus = status === 'clarification_requested' ? 'clarification_requested' : 'needs_clarification';
            }
            if (isHrApprovedStatus && timestamp > latestHrApprovalTs) latestHrApprovalTs = timestamp;
          });

          if (latestHrApprovalTs !== -Infinity) {
            statusMap.set(empId, 'hr_approved');
          } else if (latestProcessedTs !== -Infinity && (latestSubmitTs === -Infinity || latestProcessedTs >= latestSubmitTs)) {
            statusMap.set(empId, latestProcessedStatus || 'needs_clarification');
          } else if (latestSubmitTs !== -Infinity) {
            statusMap.set(empId, 'manager_submitted');
          } else if (latestDraftTs !== -Infinity) {
            statusMap.set(empId, 'manager_reviewing');
          }
        }

        if (self.length > 0 && !statusMap.has(empId)) {
          const submittedSelfReview = self.find((r: any) => r.submittedAt && !r.isDraft);
          if (submittedSelfReview) {
            const selfReviewStatus = getReviewStatus(submittedSelfReview) as EmployeeReviewStatus;
            const hasPendingClarification = isClarificationStatus(selfReviewStatus);
            statusMap.set(empId, hasPendingClarification ? 'clarification_requested' : 'self_submitted');
          }
        }
      }

      allReviews.sort((a, b) => {
        const yearA = String(a.cycleYear || '');
        const yearB = String(b.cycleYear || '');
        if (yearA !== yearB) return yearB.localeCompare(yearA);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      setReviews(allReviews);
      setEmployeeReviewStatuses(statusMap);
      setDirectReports((prev) => {
        let hasChanges = false;
        const next = prev.map((report) => {
          const status = statusMap.get(report.id);
          if (!status || report.reviewStatus === status) return report;
          hasChanges = true;
          return { ...report, reviewStatus: status };
        });
        return hasChanges ? next : prev;
      });

      reviewsLoadedRef.current = true;
      return;
    }

    // Only fetch if not cached and initial loading is complete
    if (!initialLoading && user?.email && employees.length > 0 && employeeIdsForReviews.length > 0) {
      reviewsLoadedRef.current = true;
      fetchReviews();
    }
  }, [initialLoading, user?.email, employees.length, employeeIdsForReviews.length, currentManagerEmployeeId, directReports.length, fetchReviews]);

  // Track if cycles have been loaded to prevent re-fetching on navigation
  const cyclesLoadedRef = useRef(false);

  // Fetch all review cycles
  useEffect(() => {
    // Skip if already loaded
    if (cyclesLoadedRef.current) {
      return;
    }

    const fetchCycles = async () => {
      if (!user?.email) return;

      try {
        setLoadingActiveCycle(true);
        setLoadingAllCycles(true);

        // Check cache first
        const cached = getCachedData(user.email);
        if (cached && cached.cycles.length > 0) {
          console.log('📦 Using cached cycles data - NO API CALL');
          const filteredCycles = cached.cycles.filter((cycle: any) => cycle.status !== 'draft');
          if (filteredCycles.length > 0) {
            const sortedCycles = filteredCycles.sort((a: any, b: any) =>
              b.year.localeCompare(a.year)
            );
            setAllCycles(sortedCycles);
            const active = sortedCycles.find((c: any) => c.status === 'open' || c.status === 'active');
            if (active) {
              setActiveCycle(active);
            }
          }
          setLoadingActiveCycle(false);
          setLoadingAllCycles(false);
          cyclesLoadedRef.current = true;
          return;
        }

        // Fetch from API if not cached (only once)
        cyclesLoadedRef.current = true;
        const response = await authenticatedFetch(
          `${API_BASE_URL}/reviews/cycles`,
          { method: 'GET' }
        );

        if (response.ok) {
          const cycles = await response.json();
          // Filter out draft cycles - draft cycles should not be visible to anyone in performance module
          const filteredCycles = cycles.filter((cycle: any) => cycle.status !== 'draft');

          // Sort by year descending (most recent first)
          const sortedCycles = filteredCycles.sort((a: any, b: any) => b.year.localeCompare(a.year));
          setAllCycles(sortedCycles);

          // Find the active cycle (status === 'open' in backend, 'active' in frontend)
          const active = sortedCycles.find((cycle: any) => cycle.status === 'open' || cycle.status === 'active');
          setActiveCycle(active || null);
        }
      } catch (error) {
        console.error("Error fetching cycles:", error);
        cyclesLoadedRef.current = false; // Allow retry on error
      } finally {
        setLoadingActiveCycle(false);
        setLoadingAllCycles(false);
      }
    };

    if (!initialLoading) {
      fetchCycles();
    }
  }, [initialLoading, user?.email, getCachedData]);

  const filteredReports = directReports.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.position.toLowerCase().includes(searchTerm.toLowerCase());

    const reviewStatus = employeeReviewStatuses.get(emp.id);
    let matchesFilter = true;

    switch (activeFilter) {
      case 'needs_clarification':
        matchesFilter = isClarificationStatus(reviewStatus);
        break;
      case 'review_pending':
        matchesFilter = isPendingReviewStatus(reviewStatus);
        break;
      case 'review_completed':
        matchesFilter = reviewStatus === 'manager_submitted' || reviewStatus === 'hr_approved';
        break;
      case 'has_goals':
        matchesFilter = (employeeGoals.get(emp.id)?.length ?? 0) > 0;
        break;
      default:
        matchesFilter = true;
    }

    return matchesSearch && matchesFilter;
  });

  const getGoalsForEmployee = (employeeId: string) => {
    return employeeGoals.get(employeeId) || [];
  };

  const getGoalsSummary = (employeeId: string) => {
    const goals = getGoalsForEmployee(employeeId);
    const active = goals.filter(g => ['in_progress', 'manager_reopened'].includes(g.status)).length;
    const pending = goals.filter(g => ['pending_manager_approval', 'pending'].includes(g.status)).length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const total = goals.length;
    return { total, active, pending, completed };
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

  const getGoalMilestoneCount = (goalId: string): number => {
    const cachedGoal = allGoalsCache.current.get(goalId);
    if (cachedGoal) {
      return cachedGoal.milestones?.length || 0;
    }
    const ownGoal = myGoals.find((g) => g.id === goalId);
    if (ownGoal) {
      return ownGoal.milestones?.length || 0;
    }
    for (const goals of employeeGoals.values()) {
      const found = goals.find((g) => g.id === goalId);
      if (found) {
        return found.milestones?.length || 0;
      }
    }
    return 0;
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
            const managerTeamGoals = apiGoals.map(convertGoalToTeamGoal);
            refreshGoalPanelStateForEmployee(currentManagerEmployeeId, managerTeamGoals);


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
            const managerTeamGoals = apiGoals.map(convertGoalToTeamGoal);
            refreshGoalPanelStateForEmployee(currentManagerEmployeeId, managerTeamGoals);


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
    if (getGoalMilestoneCount(goalId) >= MAX_MILESTONES_PER_GOAL) {
      toast({
        title: "Milestone limit reached",
        description: `You can add up to ${MAX_MILESTONES_PER_GOAL} milestones per goal.`,
        variant: "destructive"
      });
      return;
    }
    setSelectedGoalForMilestone(goalId);
    setNewMilestoneTitle("");
    setNewMilestoneDueDate("");
    setShowAddMilestoneDialog(true);
  };

  const handleAddMilestone = async () => {
    if (!selectedGoalForMilestone) return;
    if (getGoalMilestoneCount(selectedGoalForMilestone) >= MAX_MILESTONES_PER_GOAL) {
      toast({
        title: "Milestone limit reached",
        description: `You can add up to ${MAX_MILESTONES_PER_GOAL} milestones per goal.`,
        variant: "destructive"
      });
      return;
    }

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
            const managerTeamGoals = apiGoals.map(convertGoalToTeamGoal);
            refreshGoalPanelStateForEmployee(currentManagerEmployeeId, managerTeamGoals);


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
      // Update cache with refreshed goals
      apiGoals.forEach(goal => {
        allGoalsCache.current.set(goal.id, goal);
      });
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

  // Show loader while initial data is loading
  if (initialLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-16 min-h-[500px]">
        <div className="relative">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
          {/* Inner spinning loader */}
          <div className="relative w-16 h-16">
            <Loader2 className="h-16 w-16 animate-spin text-primary" style={{ animationDuration: '1s' }} />
            {/* Center dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="mt-8 text-center space-y-2">
          <div className="text-xl font-semibold text-foreground animate-pulse">
            {loadingMessage}
          </div>
          <div className="text-sm text-muted-foreground">
            Please wait while we fetch the latest data
          </div>
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  const isGoalsFilterActive = activeFilter === 'has_goals';
  const isPendingFilterActive = activeFilter === 'review_pending';
  const isCompletedFilterActive = activeFilter === 'review_completed';
  const isClarificationFilterActive = activeFilter === 'needs_clarification';

  return (
    <div className="space-y-6">
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
          {/* Feedback tab - commented out/hidden */}
          {/* <TabsTrigger value="feedback">
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </TabsTrigger> */}
        </TabsList>

        <TabsContent value="my-team" className="space-y-4">
          {/* Summary Cards - only shown in My Team section */}
          {!showReviewWorkspace && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

              <Card
                className={cn(
                  "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm shadow-lg transition-all duration-300 border-2 group",
                  isGoalsFilterActive
                    ? "border-green-500/60 ring-2 ring-green-500/30 cursor-pointer"
                    : "border-border/50 hover:border-green-500/40 hover:ring-2 hover:ring-green-500/20 cursor-pointer"
                )}
                onClick={() => toggleFilter('has_goals')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Individual goal set</p>
                      <p className="text-3xl font-bold mt-2">
                        {teamMembersWithGoalsCount}
                      </p>
                      {!isGoalsFilterActive && (
                        <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to filter
                        </p>
                      )}
                    </div>
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center transition-all",
                      isGoalsFilterActive
                        ? "bg-green-500/20 text-green-600 scale-110 shadow-green-500/20"
                        : "bg-green-500/10 text-green-500"
                    )}>
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                  {isGoalsFilterActive && (
                    <Badge variant="outline" className="mt-3 text-xs bg-green-500/20 text-green-700 border-green-500/40">
                      Active
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm shadow-lg transition-all duration-300 border-2 group",
                  isPendingFilterActive
                    ? "border-blue-500/60 ring-2 ring-blue-500/30 cursor-pointer"
                    : "border-border/50 hover:border-blue-500/40 hover:ring-2 hover:ring-blue-500/20 cursor-pointer"
                )}
                onClick={() => toggleFilter('review_pending')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Performance Review Pending</p>
                      <p className="text-3xl font-bold mt-2">
                        {loadingReviews ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          pendingReviewsCount
                        )}
                      </p>
                      {!isPendingFilterActive && !loadingReviews && (
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to filter
                        </p>
                      )}
                    </div>
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center transition-all",
                      isPendingFilterActive
                        ? "bg-blue-500/20 text-blue-600 scale-110 shadow-blue-500/20"
                        : "bg-blue-500/10 text-blue-500"
                    )}>
                      <Clock className="h-6 w-6" />
                    </div>
                  </div>
                  {isPendingFilterActive && (
                    <Badge variant="outline" className="mt-3 text-xs bg-blue-500/20 text-blue-700 border-blue-500/40">
                      Active
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm shadow-lg transition-all duration-300 border-2 group",
                  isCompletedFilterActive
                    ? "border-primary/50 ring-2 ring-primary/30 cursor-pointer"
                    : "border-border/50 hover:border-primary/40 hover:ring-2 hover:ring-primary/20 cursor-pointer"
                )}
                onClick={() => toggleFilter('review_completed')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Performance Review Completed</p>
                      <p className="text-3xl font-bold mt-2">
                        {loadingReviewsCount ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          reviewsCount
                        )}
                      </p>
                      {!isCompletedFilterActive && !loadingReviewsCount && (
                        <p className="text-xs text-muted-foreground/80 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to filter
                        </p>
                      )}
                    </div>
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center transition-all",
                      isCompletedFilterActive
                        ? "bg-primary/15 text-primary scale-110 shadow-primary/20"
                        : "bg-muted/40 text-muted-foreground"
                    )}>
                      <FileText className="h-6 w-6" />
                    </div>
                  </div>
                  {isCompletedFilterActive && (
                    <Badge variant="outline" className="mt-3 text-xs bg-primary/10 text-primary border-primary/30">
                      Active
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm shadow-lg transition-all duration-300 border-2 group",
                  isClarificationFilterActive
                    ? "border-amber-500/60 ring-2 ring-amber-500/30 cursor-pointer"
                    : "border-border/50 hover:border-amber-500/40 hover:ring-2 hover:ring-amber-500/20 cursor-pointer"
                )}
                onClick={() => toggleFilter('needs_clarification')}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        "text-sm font-medium transition-colors",
                        isClarificationFilterActive ? "text-amber-700 dark:text-amber-400" : "text-amber-600 dark:text-amber-500"
                      )}>
                        Needs Clarification
                      </p>
                      <p className={cn(
                        "text-3xl font-bold mt-2 transition-colors",
                        isClarificationFilterActive ? "text-amber-700 dark:text-amber-400" : "text-foreground"
                      )}>
                        {loadingReviews ? (
                          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                        ) : (
                          clarificationCount
                        )}
                      </p>
                      {!isClarificationFilterActive && !loadingReviews && (
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to filter
                        </p>
                      )}
                    </div>
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center transition-all",
                      isClarificationFilterActive
                        ? "bg-amber-500/20 text-amber-600 scale-110 shadow-amber-500/20"
                        : "bg-amber-500/10 text-amber-500"
                    )}>
                      <AlertCircle className="h-6 w-6" />
                    </div>
                  </div>
                  {isClarificationFilterActive && (
                    <Badge variant="outline" className="mt-3 text-xs bg-amber-500/20 text-amber-700 border-amber-500/40">
                      Active
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Review Workspace - shown when View Reviews is clicked */}
          {showReviewWorkspace && reviewEmployee && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setShowReviewWorkspace(false);
                      setReviewEmployee(null);
                      setHasReviewData(false);
                    }}
                    className="h-10 w-10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                      Review - {reviewEmployee.name}
                    </h2>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('=== Save Draft Button Clicked ===');
                    console.log('saveDraftRef:', saveDraftRef);
                    console.log('saveDraftRef.current:', saveDraftRef.current);
                    console.log('reviewEmployee:', reviewEmployee);

                    if (!saveDraftRef.current) {
                      console.error('❌ saveDraftRef.current is null or undefined!');
                      alert('Save Draft function is not available. Please ensure you are viewing a review.');
                      return;
                    }

                    console.log('✅ Calling saveDraftRef.current()...');
                    try {
                      await saveDraftRef.current();
                      console.log('✅ saveDraftRef.current() completed successfully');
                    } catch (error) {
                      console.error('❌ Error calling saveDraftRef.current():', error);
                      alert('Error saving draft: ' + (error instanceof Error ? error.message : String(error)));
                    }
                  }}
                  type="button"
                  className="border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  disabled={!hasReviewData || !saveDraftRef.current}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              </div>
              <ManagerReviewWorkspace
                initialEmployeeId={reviewEmployee.id}
                initialCycleYear={selectedCycleYear}
                hideHeader={true}
                onSaveDraftRef={saveDraftRef}
                onReviewDataStatusChange={setHasReviewData}
              />
            </div>
          )}

          {/* Team Members Grid - shown when review workspace is not active */}
          {!showReviewWorkspace && (
            <>
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
                                <h4 className="font-semibold mb-1">
                                  {goal.title}
                                  {goal.status === 'pending' && (
                                    <Badge variant="outline" className="ml-2 bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] h-4">Proposed</Badge>
                                  )}
                                </h4>
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
                                  Request Changes
                                </Button>
                                {goal.status === "pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      setSelectedGoalForApproval({ goal, employee });
                                      setApprovalAction('reject');
                                      setShowApprovalDialog(true);
                                    }}
                                  >
                                    <X className="h-4 w-4 mr-2" />
                                    Reject
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Search and Filter Info */}
              <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search team members..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 bg-background/50"
                      />
                    </div>
                    {activeFilter && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveFilter(null);
                          setSearchTerm("");
                        }}
                        className="text-primary border-primary/30 hover:bg-primary/10 whitespace-nowrap"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear Filter
                      </Button>
                    )}
                  </div>
                  {activeFilter && (
                    <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
                      <p className="text-xs text-primary flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Showing only employees with {FILTER_DESCRIPTIONS[activeFilter]}
                      </p>
                    </div>
                  )}
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
                        // Remove from cache
                        allGoalsCache.current.delete(goalId);
                        // Force refresh to get updated goals after deletion
                        await fetchTeamMemberGoals(employee.id, true);
                        // Update cache with refreshed goals
                        const refreshedGoals = await getEmployeeGoals(employee.id);
                        refreshedGoals.forEach(goal => {
                          allGoalsCache.current.set(goal.id, goal);
                        });
                      }}
                      onOpenGoal={(goal, teamMember, trigger) => handleOpenGoalPanel(goal, teamMember, trigger)}
                      onOpenCategoryGoals={(category, categoryGoals, teamMember, trigger) => handleOpenCategoryGoals(category, categoryGoals, teamMember, trigger)}
                      onViewReviews={() => {
                        setReviewEmployee(employee);
                        setShowReviewWorkspace(true);
                      }}
                      activeGoalId={goalPanelState.open ? goalPanelState.goalId : null}
                      panelId={goalPanelId}
                      reviewStatus={employeeReviewStatuses.get(employee.id) || 'not_started'}
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
            </>
          )}
        </TabsContent>

        <TabsContent value="my-goals" className="space-y-4">
          {/* Use the same UserPerformanceView component for consistency */}
          <UserPerformanceView employeeId={currentManagerEmployeeId} />
        </TabsContent>

        {/* Feedback tab content - commented out/hidden */}
        {/* <TabsContent value="feedback" className="space-y-4">
          <ContinuousFeedback />
        </TabsContent> */}

      </Tabs>

      <GoalDetailPanel
        open={goalPanelState.open}
        goalId={goalPanelState.goalId}
        summary={goalPanelState.summary}
        categoryGoals={goalPanelState.categoryGoals}
        categoryName={goalPanelState.categoryName}
        employee={goalPanelState.employee ?? managerSummary}
        onClose={handleCloseGoalPanel}
        getGoal={getCachedGoal}
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
        onDeleteGoal={async (goalId) => {
          await deleteGoal(goalId);
          if (goalPanelState.employee?.id) {
            await fetchTeamMemberGoals(goalPanelState.employee.id, true);
          }
        }}
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
          onAISuggestions={async (employeeId) => {
            await fetchTeamMemberGoals(employeeId, true);

            if (employeeId === currentManagerEmployeeId) {
              const apiGoals = await getEmployeeGoals(employeeId, true);
              const convertedGoals = apiGoals.map(convertGoalToMyGoal);
              setMyGoals(convertedGoals);
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
                    {availableWeightageForEdit.options.length > 0 ? (
                      availableWeightageForEdit.options.map((value) => (
                        <SelectItem key={value} value={value.toString()}>
                          {value}%
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="0" disabled>No weightage available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Other goals: {availableWeightageForEdit.otherGoalsWeightage}% • Available: {availableWeightageForEdit.maxAllowed}%
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

                // Validate weightage doesn't exceed 100%
                const newTotal = availableWeightageForEdit.otherGoalsWeightage + editGoalForm.weightage;
                if (newTotal > 100) {
                  toast({
                    title: "Validation Error",
                    description: `Total weightage cannot exceed 100%. Other goals: ${availableWeightageForEdit.otherGoalsWeightage}%, Selected: ${editGoalForm.weightage}% = ${newTotal}%`,
                    variant: "destructive"
                  });
                  return;
                }

                try {
                  setIsEditingGoalLoading(true);
                  const updateData = {
                    title: editGoalForm.title.trim(),
                    description: editGoalForm.description || undefined,
                    category: editGoalForm.category,
                    targetDate: editGoalForm.targetDate,
                    weightage: editGoalForm.weightage
                  };

                  const updatedGoal = await updateGoal(selectedGoalForEdit.id, updateData);

                  if (updatedGoal) {
                    // Update local cache immediately without refetching
                    allGoalsCache.current.set(selectedGoalForEdit.id, updatedGoal);

                    // Update employeeGoals Map with the updated goal
                    if (selectedEmployee) {
                      const currentGoals = employeeGoals.get(selectedEmployee.id) || [];
                      const updatedTeamGoals = currentGoals.map(g =>
                        g.id === updatedGoal.id ? convertGoalToTeamGoal(updatedGoal) : g
                      );

                      // Trigger re-render by creating a new Map instance
                      setEmployeeGoals(prev => {
                        const newMap = new Map(prev);
                        newMap.set(selectedEmployee.id, updatedTeamGoals);
                        return newMap;
                      });

                      // Also refresh the panel state if it's open for this employee to show updated weightage/details
                      refreshGoalPanelStateForEmployee(selectedEmployee.id, updatedTeamGoals);

                      // CRITICAL FIX: Update the performance preload cache (localStorage) with updated goals
                      // This ensures hard refresh shows the correct weightage
                      if (user?.email) {
                        // Get all current goals for this employee (with the updated goal)
                        const allEmployeeGoals = updatedTeamGoals.map(g => {
                          // Find the full API goal from cache
                          return allGoalsCache.current.get(g.id) || updatedGoal;
                        }).filter(g => g.employeeId === selectedEmployee.id);

                        // Update the performance cache to persist the changes
                        updateCachedGoals(user.email, selectedEmployee.id, allEmployeeGoals);
                      }
                    }

                    // If it's the manager's own goal, update myGoals state too
                    if (currentManagerEmployeeId && selectedGoalForEdit.employeeId === currentManagerEmployeeId) {
                      setMyGoals(prev => prev.map(g =>
                        g.id === updatedGoal.id ? convertGoalToMyGoal(updatedGoal) : g
                      ));

                      // Also update the performance cache for manager's own goals
                      if (user?.email) {
                        const allManagerGoals = [...(employeeGoals.get(currentManagerEmployeeId) || [])].map(g => {
                          if (g.id === updatedGoal.id) return convertGoalToTeamGoal(updatedGoal);
                          return g;
                        }).map(g => allGoalsCache.current.get(g.id) || updatedGoal)
                          .filter(g => g.employeeId === currentManagerEmployeeId);

                        updateCachedGoals(user.email, currentManagerEmployeeId, allManagerGoals);
                      }
                    }

                    // CRITICAL: Directly update the goalPanelState if this goal is currently being displayed
                    // This ensures the UI updates immediately without waiting for other state updates
                    setGoalPanelState(prev => {
                      if (prev.open && prev.goalId === updatedGoal.id) {
                        // Update the summary snapshot with the latest goal data
                        return {
                          ...prev,
                          summary: toTeamGoalSnapshot(convertGoalToTeamGoal(updatedGoal))
                        };
                      }
                      return prev;
                    });

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
                } finally {
                  setIsEditingGoalLoading(false);
                }
              }}
              disabled={isEditingGoalLoading}
            >
              {isEditingGoalLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve'
                ? (selectedGoalForApproval?.goal.status === 'pending' ? 'Approve Proposed Goal' : 'Approve Completed Goal')
                : approvalAction === 'reject'
                  ? 'Reject Proposed Goal'
                  : 'Request Goal Changes'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve'
                ? (selectedGoalForApproval?.goal.status === 'pending'
                  ? 'Approve this proposed goal to move it to "In Progress".'
                  : 'Approve this goal as completed. The employee will be notified.')
                : approvalAction === 'reject'
                  ? 'Reject this proposed goal. Add a reason for the employee.'
                  : 'Request changes to this goal. Provide feedback on what needs to be improved.'}
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
                    : approvalAction === 'reject'
                      ? 'Explain why this proposed goal is rejected...'
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
                    const isProposed = selectedGoalForApproval.goal.status === 'pending';
                    const updatedGoal = await updateGoal(selectedGoalForApproval.goal.id, {
                      managerApproved: true,
                      status: isProposed ? 'in_progress' : 'completed'
                    });


                    // Update cache with new goal data
                    if (updatedGoal) {
                      allGoalsCache.current.set(selectedGoalForApproval.goal.id, updatedGoal);
                    }
                    // Remove from pending list
                    setPendingApprovalGoals(prev =>
                      prev.filter(item => item.goal.id !== selectedGoalForApproval.goal.id)
                    );
                  } else if (approvalAction === 'reopen') {
                    // Reopen the goal via API
                    if (!approvalComment.trim()) {
                      toast({
                        title: "Feedback Required",
                        description: "Please provide feedback when requesting changes.",
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

                    const updatedGoal = await updateGoal(selectedGoalForApproval.goal.id, {
                      managerReopened: true,
                      status: 'manager_reopened',
                      milestones: updatedMilestones
                    });

                    // Update cache with new goal data
                    if (updatedGoal) {
                      allGoalsCache.current.set(selectedGoalForApproval.goal.id, updatedGoal);
                    }

                    // Remove from pending list
                    setPendingApprovalGoals(prev =>
                      prev.filter(item => item.goal.id !== selectedGoalForApproval.goal.id)
                    );
                  } else if (approvalAction === 'reject') {
                    if (!approvalComment.trim()) {
                      toast({
                        title: "Feedback Required",
                        description: "Please provide feedback when rejecting a proposed goal.",
                        variant: "destructive"
                      });
                      return;
                    }

                    await deleteGoal(selectedGoalForApproval.goal.id);

                    // Remove from local caches and pending list.
                    allGoalsCache.current.delete(selectedGoalForApproval.goal.id);
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
                : approvalAction === 'reject'
                  ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                  : "bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-orange-500/20"}
            >
              {approvalAction === 'approve' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Goal
                </>
              ) : approvalAction === 'reject' ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Reject Goal
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Request Changes
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
              Add a new milestone to track progress towards your goal (up to {MAX_MILESTONES_PER_GOAL} milestones).
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

