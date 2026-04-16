import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Loader2,
  Star,
  Save,
  SquarePen,
  ChevronLeft,
  Users,
  AlertCircle,
  MessageSquare
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
import { usePerformancePreload } from "@/hooks/use-performance-preload";
import { GoalDetailPanel, GoalDetailSnapshot } from "./GoalDetailPanel";
import { GoalSummaryCard, GoalSummary } from "./GoalSummaryCard";
import { GoalSettingModal } from "./GoalSettingModal";
import { EmployeeSelfAssessment } from "./EmployeeSelfAssessment";
import { ClientRMFeedbackTab } from "./ClientRMFeedbackTab";

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
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import {
  normalizeGoalStatus,
  isPendingApprovalStatus,
  canMutateMilestonesForStatus
} from "@/utils/goal-status";

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

const MAX_MILESTONES_PER_GOAL = 5;

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

const resolveReviewStatus = (review?: any) =>
  review?.metadata?.status ||
  review?.status ||
  review?.state ||
  review?.lifecycleStatus ||
  review?.reviewStatus ||
  '';

interface GrowthData {
  month: string;
  performance: number;
  goalsCompleted: number;
}

interface UserPerformanceViewProps {
  /**
   * Optional employee ID to use instead of finding from current user.
   * If provided, this employee's goals and reviews will be displayed.
   * If not provided, the component will find the employee ID from the current user.
   */
  employeeId?: string | null;
}

export function UserPerformanceView({ employeeId: providedEmployeeId }: UserPerformanceViewProps = {}) {
  const { preserveScroll } = usePreserveScroll();
  const { toast } = useToast();
  const { user } = useAuth();
  const { getEmployeeGoals, getGoal, createMilestone, updateMilestone, deleteMilestone, updateGoal, loading: goalsLoading } = useGoals();
  const { employees } = useEmployees();
  const { getCachedData, updateCachedGoals } = usePerformancePreload();

  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(providedEmployeeId || null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any | null>(null);
  const [loadingActiveCycle, setLoadingActiveCycle] = useState(false);
  const [showSelfAssessmentForm, setShowSelfAssessmentForm] = useState(false);
  const [selfAssessmentSaveDraft, setSelfAssessmentSaveDraft] = useState<(() => void) | null>(null);
  const [selfAssessmentSaving, setSelfAssessmentSaving] = useState(false);
  const [selfAssessmentReadOnly, setSelfAssessmentReadOnly] = useState(false);
  useEffect(() => {
    if (!showSelfAssessmentForm) {
      setSelfAssessmentSaveDraft(null);
      setSelfAssessmentSaving(false);
      setSelfAssessmentReadOnly(false);
    }
  }, [showSelfAssessmentForm]);

  const handleRegisterSelfSaveDraft = useCallback((handler: (() => void) | null) => {
    if (handler) {
      setSelfAssessmentSaveDraft(() => handler);
    } else {
      setSelfAssessmentSaveDraft(null);
    }
  }, []);

  const handleSelfAssessmentReadOnlyChange = useCallback((readOnly: boolean) => {
    setSelfAssessmentReadOnly(readOnly);
  }, []);
  const [selectedCycleYear, setSelectedCycleYear] = useState<string | null>(null);
  const [allCycles, setAllCycles] = useState<any[]>([]);
  const [loadingAllCycles, setLoadingAllCycles] = useState(false);
  const [showManagerFeedbackModal, setShowManagerFeedbackModal] = useState(false);
  const [managerReviewData, setManagerReviewData] = useState<any | null>(null);
  const [loadingManagerReview, setLoadingManagerReview] = useState(false);
  const [clientRmNotificationCount, setClientRmNotificationCount] = useState(0);
  const [clientRmOpenPeriodActive, setClientRmOpenPeriodActive] = useState(false);

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
  const [originalComment, setOriginalComment] = useState<string>(""); // Store original comment for comparison
  const [isMilestoneLoading, setIsMilestoneLoading] = useState(false);

  // Add milestone states
  const [showAddMilestoneDialog, setShowAddMilestoneDialog] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState<string>("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState<string>("");
  const [submittingGoalId, setSubmittingGoalId] = useState<string | null>(null);
  const [isAddMilestoneLoading, setIsAddMilestoneLoading] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);

  const [goalPanelState, setGoalPanelState] = useState<{

    open: boolean;
    goalId: string | null;
    summary: GoalDetailSnapshot | null;
  }>({ open: false, goalId: null, summary: null });
  const selectedPanelGoal = useMemo(
    () => goals.find((goal) => goal.id === goalPanelState.goalId) ?? null,
    [goals, goalPanelState.goalId]
  );
  const canEditMilestonesForPanelGoal = useMemo(() => {
    if (!selectedPanelGoal) return false;
    return canMutateMilestonesForStatus(selectedPanelGoal.status);
  }, [selectedPanelGoal]);
  const goalPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const goalPanelId = "goal-detail-panel";

  const toGoalPanelSnapshot = useCallback((goal: PerformanceGoal): GoalDetailSnapshot => ({
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
  }), []);

  const refreshGoalPanelState = useCallback((updatedGoals: PerformanceGoal[]) => {
    setGoalPanelState((prev) => {
      if (!prev.open || !prev.goalId) {
        return prev;
      }

      const updatedGoal = updatedGoals.find((goal) => goal.id === prev.goalId);
      if (!updatedGoal) {
        return prev;
      }

      const updatedSummary = toGoalPanelSnapshot(updatedGoal);
      const prevMs = prev.summary?.milestones ?? [];
      const nextMs = updatedSummary.milestones ?? [];
      const milestonesChanged =
        prevMs.length !== nextMs.length ||
        nextMs.some((m, i) => {
          const p = prevMs[i];
          return !p || p.id !== m.id || p.completed !== m.completed || p.completedDate !== m.completedDate;
        });
      const hasChanged =
        !prev.summary ||
        milestonesChanged ||
        prev.summary.completion !== updatedSummary.completion ||
        prev.summary.status !== updatedSummary.status ||
        prev.summary.managerApproved !== updatedSummary.managerApproved ||
        prev.summary.managerReopened !== updatedSummary.managerReopened;

      if (!hasChanged) {
        return prev;
      }

      return {
        ...prev,
        summary: updatedSummary
      };
    });
  }, [toGoalPanelSnapshot]);


  // Get current user's employee ID
  // Use provided employeeId if available, otherwise find from user
  useEffect(() => {
    if (providedEmployeeId) {
      setCurrentEmployeeId(providedEmployeeId);
      return;
    }

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
  }, [providedEmployeeId, user?.email, employees]);

  // Load goals from API (force refresh) so reportees see manager approvals without stale preload/hook cache.
  useEffect(() => {
    if (!currentEmployeeId || !user?.email) return;

    let cancelled = false;

    const fetchGoals = async () => {
      try {
        setLoading(true);

        const cached = getCachedData(user.email);
        if (cached && cached.employeeId === currentEmployeeId && cached.goals.length > 0) {
          const convertedGoals = cached.goals.map(convertGoalToPerformanceGoal);
          if (!cancelled) {
            setGoals(convertedGoals);
            refreshGoalPanelState(convertedGoals);
          }
        }

        const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
        if (cancelled) return;

        const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
        setGoals(convertedGoals);
        updateCachedGoals(user.email, currentEmployeeId, apiGoals);
        refreshGoalPanelState(convertedGoals);
      } catch (error) {
        console.error("Error fetching goals:", error);
        toast({
          title: "Error",
          description: "Failed to load goals",
          variant: "destructive"
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchGoals();
    return () => {
      cancelled = true;
    };
  }, [currentEmployeeId, getEmployeeGoals, toast, refreshGoalPanelState, user?.email, getCachedData, updateCachedGoals]);

  // When returning to the tab, refresh goals so cross-session manager actions are reflected.
  useEffect(() => {
    if (!currentEmployeeId || !user?.email) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
          const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
          setGoals(convertedGoals);
          updateCachedGoals(user.email, currentEmployeeId, apiGoals);
          refreshGoalPanelState(convertedGoals);
        } catch (e) {
          console.error("Error refreshing goals on visibility:", e);
        }
      })();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [currentEmployeeId, user?.email, getEmployeeGoals, updateCachedGoals, refreshGoalPanelState]);

  // Track if reviews have been loaded to prevent re-fetching on navigation
  const reviewsLoadedRef = useRef<string | null>(null);

  // Fetch reviews for Annual Reviews section - check cache first
  const fetchReviews = useCallback(async () => {
    // Skip if already loaded for this employee
    if (reviewsLoadedRef.current === currentEmployeeId) {
      return;
    }

    if (!currentEmployeeId || !user?.email) return;

    try {
      setLoadingReviews(true);

      // Check cache first
      const cached = getCachedData(user.email);
      if (cached && cached.employeeId === currentEmployeeId && cached.reviews.length > 0) {
        console.log('📦 Using cached reviews data - NO API CALL');
        const sortedReviews = cached.reviews.sort((a: any, b: any) => {
          if (a.cycleYear !== b.cycleYear) {
            return b.cycleYear.localeCompare(a.cycleYear);
          }
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        // Only update state if reviews have actually changed
        setReviews(prevReviews => {
          const reviewsChanged = prevReviews.length !== sortedReviews.length ||
            prevReviews.some((r, i) => r.id !== sortedReviews[i]?.id);
          return reviewsChanged ? sortedReviews : prevReviews;
        });
        setLoadingReviews(false);
        reviewsLoadedRef.current = currentEmployeeId;
        return;
      }

      // Fetch from API if not cached (only once per employee)
      reviewsLoadedRef.current = currentEmployeeId;
      const response = await authenticatedFetch(
        `${API_BASE_URL}/reviews?employeeId=${currentEmployeeId}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          // Sort by cycle year and created date (most recent first)
          const sortedReviews = data.sort((a: any, b: any) => {
            if (a.cycleYear !== b.cycleYear) {
              return b.cycleYear.localeCompare(a.cycleYear);
            }
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });
          setReviews(sortedReviews);
        }
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
      reviewsLoadedRef.current = null; // Allow retry on error
      toast({
        title: "Error",
        description: "Failed to load reviews",
        variant: "destructive"
      });
    } finally {
      setLoadingReviews(false);
    }
  }, [currentEmployeeId, user?.email, toast, getCachedData]);

  useEffect(() => {
    if (currentEmployeeId) {
      fetchReviews();
    }
  }, [currentEmployeeId, fetchReviews]);

  // Fetch manager review for feedback modal
  const fetchManagerReview = useCallback(async (cycleYear: string) => {
    if (!currentEmployeeId) {
      toast({
        title: "Error",
        description: "Employee ID not found",
        variant: "destructive"
      });
      setShowManagerFeedbackModal(false);
      return;
    }

    setManagerReviewData(null);
    setLoadingManagerReview(true);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/reviews?employeeId=${currentEmployeeId}&cycleYear=${cycleYear}&reviewType=manager&isDraft=false&includeInactive=true`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = await response.json();
        // Find the most recent submitted manager review
        const managerReviews = Array.isArray(data) ? data : [];
        const submittedReview = managerReviews
          .filter((r: any) => !r.isDraft && r.submittedAt)
          .sort((a: any, b: any) =>
            new Date(b.submittedAt || b.updatedAt || 0).getTime() -
            new Date(a.submittedAt || a.updatedAt || 0).getTime()
          )[0];

        setManagerReviewData(submittedReview || null);

        if (!submittedReview) {
          toast({
            title: "No Feedback Available",
            description: "Manager feedback is not available for this review cycle.",
            variant: "default"
          });
        }
      } else {
        const errorText = await response.text();
        console.error("Error fetching manager review:", errorText);
        toast({
          title: "Error",
          description: "Failed to load manager feedback",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error fetching manager review:", error);
      toast({
        title: "Error",
        description: "Failed to load manager feedback",
        variant: "destructive"
      });
    } finally {
      setLoadingManagerReview(false);
    }
  }, [currentEmployeeId, toast]);

  // Track if cycles have been loaded to prevent re-fetching on navigation
  const cyclesLoadedRef = useRef(false);

  // Fetch all review cycles - check cache first
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
            // Only update state if cycles have actually changed
            setAllCycles(prevCycles => {
              const cyclesChanged = prevCycles.length !== sortedCycles.length ||
                prevCycles.some((c, i) => c.id !== sortedCycles[i]?.id);
              return cyclesChanged ? sortedCycles : prevCycles;
            });
            const active = sortedCycles.find((c: any) => c.status === 'open' || c.status === 'active');
            if (active) {
              setActiveCycle(prevActive => prevActive?.id === active.id ? prevActive : active);
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
        } else {
          console.error("Failed to fetch cycles:", response.status, response.statusText);
          cyclesLoadedRef.current = false; // Allow retry on error
        }
      } catch (error) {
        console.error("Error fetching cycles:", error);
        cyclesLoadedRef.current = false; // Allow retry on error
        toast({
          title: "Error",
          description: "Failed to load review cycles",
          variant: "destructive"
        });
      } finally {
        setLoadingActiveCycle(false);
        setLoadingAllCycles(false);
      }
    };

    // Always fetch cycles (they're not employee-specific) - but only once
    fetchCycles();
  }, [user?.email, getCachedData, toast]);

  useEffect(() => {
    const fetchClientRmNotifications = async () => {
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/notifications/summary`);
        if (!response.ok) return;
        const data = await response.json();
        const count = Number(data.manager_pending_count || 0) + Number(data.reportee_unread_count || 0);
        setClientRmNotificationCount(count);
        setClientRmOpenPeriodActive(Number(data.open_period_count || 0) > 0);
      } catch {
        // Keep performance page resilient when feedback module is unavailable.
      }
    };
    fetchClientRmNotifications();
  }, []);

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
    const n = normalizeGoalStatus(status);
    switch (n) {
      case 'completed':
        return <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-100 border-2 border-emerald-500/55 px-3 py-1.5 text-sm font-semibold"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-green-600/15 text-green-800 dark:text-green-100 border-2 border-green-500/60 px-3 py-1.5 text-sm font-semibold"><Clock className="h-3.5 w-3.5 mr-1" />In Progress</Badge>;
      case 'pending_manager_approval':
        return <Badge className="bg-orange-500/15 text-orange-900 dark:text-orange-100 border-2 border-orange-500/55 px-3 py-1.5 text-sm font-semibold"><Send className="h-3.5 w-3.5 mr-1" />Pending Approval</Badge>;
      case 'pending':
        return <Badge className="bg-amber-400/20 text-amber-950 dark:text-amber-50 border-2 border-amber-500/65 px-3 py-1.5 text-sm font-semibold">Pending</Badge>;
      case 'manager_reopened':
        return <Badge className="bg-red-500/15 text-red-900 dark:text-red-100 border-2 border-red-500/55 px-3 py-1.5 text-sm font-semibold"><RefreshCw className="h-3.5 w-3.5 mr-1" />Reopened</Badge>;
      default:
        return <Badge className="bg-amber-400/20 text-amber-950 dark:text-amber-50 border-2 border-amber-500/65 px-3 py-1.5 text-sm font-semibold">Pending</Badge>;
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
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal || !canMutateMilestonesForStatus(targetGoal.status)) {
      toast({
        title: "Manager approval required",
        description: "Milestones can be updated only after the manager approves the goal.",
        variant: "destructive"
      });
      return;
    }
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

  // Handle milestone completion
  const handleCompleteMilestone = async () => {
    if (!selectedMilestone) return;

    const trimmedComment = milestoneComment.trim();
    // Validate comment is provided
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
          refreshGoalPanelState(convertedGoals);
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

  // Handle milestone reopening/uncompleting
  const handleReopenMilestone = async () => {
    if (!selectedMilestone) return;

    const trimmedComment = milestoneComment.trim();
    // Validate comment is provided
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
          refreshGoalPanelState(convertedGoals);
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
    const targetGoal = goals.find((g) => g.id === goalId);
    if (!targetGoal || !canMutateMilestonesForStatus(targetGoal.status)) {
      toast({
        title: "Manager approval required",
        description: "You can add milestones only after the manager approves this goal.",
        variant: "destructive"
      });
      return;
    }
    if ((targetGoal.milestones?.length || 0) >= MAX_MILESTONES_PER_GOAL) {
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

  // Handle adding a new milestone
  const handleAddMilestone = async () => {
    if (!selectedGoalForMilestone) return;
    const targetGoal = goals.find((g) => g.id === selectedGoalForMilestone);
    if ((targetGoal?.milestones?.length || 0) >= MAX_MILESTONES_PER_GOAL) {
      toast({
        title: "Milestone limit reached",
        description: `You can add up to ${MAX_MILESTONES_PER_GOAL} milestones per goal.`,
        variant: "destructive"
      });
      return;
    }

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
          refreshGoalPanelState(convertedGoals);
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
      refreshGoalPanelState(convertedGoals);
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
          <TabsTrigger value="annual-review">Annual Review</TabsTrigger>
          <TabsTrigger value="client-rm-feedback" className="relative pr-6">
            <span className="relative inline-flex items-center">
              Client RM Feedback
              {clientRmOpenPeriodActive && (
                <span
                  className="absolute -right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.85)] animate-pulse"
                  aria-hidden
                  title="A monthly feedback period is open"
                />
              )}
            </span>
            {clientRmNotificationCount > 0 && (
              <span className="ml-2 inline-flex min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs items-center justify-center">
                {clientRmNotificationCount > 99 ? "99+" : clientRmNotificationCount}
              </span>
            )}
          </TabsTrigger>
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
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart
                    data={growthData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorPerformance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4facfe" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4facfe" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.3}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        fontSize: '14px'
                      }}
                      formatter={(value: number) => [`${value}%`, 'Performance']}
                    />
                    <Area
                      type="monotone"
                      dataKey="performance"
                      stroke="#4facfe"
                      strokeWidth={2}
                      fill="url(#colorPerformance)"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {/* Chart Information Label */}
                <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="w-2 h-2 rounded-full bg-[#4facfe] shadow-sm" style={{ boxShadow: '0 0 6px rgba(79, 172, 254, 0.4)' }} />
                    <span className="text-xs font-medium text-muted-foreground">
                      Performance percentage tracked over 6 months
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Goals by Category */}
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Goals by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ResponsiveContainer width="100%" height={220}>
                  <RechartsPieChart>
                    <defs>
                      {categoryData.map((entry, index) => (
                        <linearGradient key={`gradient-${index}`} id={`gradient-user-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={false}
                      outerRadius={80}
                      innerRadius={30}
                      fill="#8884d8"
                      dataKey="value"
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeWidth={2}
                      animationBegin={0}
                      animationDuration={800}
                      animationEasing="ease-out"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={`url(#gradient-user-${index})`}
                          style={{
                            filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))",
                            transition: "all 0.3s ease"
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                        border: "1px solid rgba(0, 0, 0, 0.1)",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                        fontSize: "14px"
                      }}
                      formatter={(value: number, name: string) => [
                        `${value}%`,
                        name
                      ]}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                {/* Legend - Outside Recharts, inside Card */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-border/30">
                  {categoryData.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 border border-border/30 hover:bg-background/80 hover:border-primary/30 transition-all duration-200"
                    >
                      <div
                        className="w-3 h-3 rounded-full shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: entry.color,
                          boxShadow: `0 0 8px ${entry.color}40`
                        }}
                      />
                      <span className="text-sm font-medium text-foreground whitespace-nowrap">
                        {entry.name}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {entry.value}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Your Goals</h3>
              <p className="text-sm text-muted-foreground">Manage and track your performance objectives.</p>
            </div>
            <Button
              onClick={() => setShowGoalModal(true)}
              className="bg-primary hover:bg-primary/90 shadow-sm"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Propose New Goal
            </Button>
          </div>

          {loading ? (

            <div className="flex items-center justify-center p-16">
              <div className="text-center space-y-4">
                <div className="relative mx-auto w-14 h-14">
                  <Target className="h-14 w-14 animate-spin text-primary/60" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-medium text-foreground">Loading your goals</p>
                  <p className="text-sm text-muted-foreground">Fetching the latest updates...</p>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
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
            <div className="space-y-5">
              {goals.filter((goal) => isPendingApprovalStatus(goal.status)).length > 0 && (
                <Card className="bg-blue-500/5 border-blue-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Send className="h-4 w-4 text-blue-600" />
                      Proposed Goals Waiting for Manager Approval
                    </CardTitle>
                    <CardDescription>
                      You cannot add milestones until your manager approves these goals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {goals
                      .filter((goal) => isPendingApprovalStatus(goal.status))
                      .map((goal) => (
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
                  </CardContent>
                </Card>
              )}

              {goals.filter((goal) => !isPendingApprovalStatus(goal.status)).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {goals
                    .filter((goal) => !isPendingApprovalStatus(goal.status))
                    .map((goal) => (
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
            </div>
          )}
        </TabsContent>

        <TabsContent value="annual-review" className="space-y-4">
          {!showSelfAssessmentForm ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Annual Review Cycles</h3>

              {loadingAllCycles ? (
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-12 text-center">
                    <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading review cycles...</p>
                  </CardContent>
                </Card>
              ) : allCycles.length > 0 ? (
                <div className="space-y-3">
                  {allCycles
                    .filter((cycle) => {
                      // Filter out draft cycles - draft cycles should not be visible to anyone in performance module
                      return cycle.status !== 'draft';
                    })
                    .map((cycle) => {
                      const isActive = cycle.status === 'open' || cycle.status === 'active';

                      // Normalize year comparison and prefer submitted reviews if both draft and submitted exist
                      const normalizedCycleYear = (cycle.year || cycle.metadata?.cycleYear || cycle.name?.match(/\d{4}/)?.[0] || '').toString().trim();
                      const isSameCycle = (item: any) => {
                        const reviewYear = (item.cycleYear || item.metadata?.cycleYear || '').toString().trim();
                        return normalizedCycleYear && reviewYear ? reviewYear === normalizedCycleYear : false;
                      };

                      const cycleSelfReviews = reviews.filter((r: any) => {
                        const reviewYear = (r.cycleYear || r.metadata?.cycleYear || '').toString().trim();
                        const sameYear = normalizedCycleYear && reviewYear ? reviewYear === normalizedCycleYear : false;
                        return sameYear && r.reviewType === 'self' && r.employeeId === currentEmployeeId;
                      });

                      const submittedReview = cycleSelfReviews.find((r: any) => !r.isDraft && r.submittedAt);
                      const cycleReview = submittedReview || cycleSelfReviews[0];

                      // If self-review is missing, fall back to manager review to determine state (self must have been submitted)
                      const cycleManagerReview = reviews.find((r: any) => isSameCycle(r) && r.reviewType === 'manager' && r.employeeId === currentEmployeeId);

                      // Determine review status
                      let reviewStatus: 'not_started' | 'draft' | 'submitted' | 'under_manager_review' | 'finalized' | 'needs_clarification' = 'not_started';
                      let isHrApprovedStatus = false;
                      if (cycleReview) {
                        if (cycleReview.isDraft || !cycleReview.submittedAt) {
                          reviewStatus = 'draft';
                        }
                        if (cycleReview.submittedAt && !cycleReview.isDraft) {
                          const metadataStatus = resolveReviewStatus(cycleReview);
                          if (metadataStatus === 'changes_requested' || metadataStatus === 'hr_rejected' || metadataStatus === 'clarification_requested') {
                            reviewStatus = 'needs_clarification';
                            isHrApprovedStatus = false;
                          } else if (metadataStatus === 'self_submitted' || metadataStatus === 'manager_reviewing' || metadataStatus === 'clarification_responded') {
                            reviewStatus = 'under_manager_review';
                            isHrApprovedStatus = false;
                          } else if (
                            metadataStatus === 'manager_submitted' ||
                            metadataStatus === 'finalized' ||
                            metadataStatus === 'hr_approved' ||
                            metadataStatus === 'approved'
                          ) {
                            reviewStatus = 'finalized';
                            isHrApprovedStatus = metadataStatus === 'hr_approved' || metadataStatus === 'approved';
                          } else if (!metadataStatus || metadataStatus === 'self_submitted') {
                            reviewStatus = 'submitted';
                            isHrApprovedStatus = false;
                          } else {
                            reviewStatus = 'under_manager_review';
                            isHrApprovedStatus = false;
                          }
                        }
                      }

                      if (cycleManagerReview && !cycleManagerReview.isDraft) {
                        const managerStatus = resolveReviewStatus(cycleManagerReview);
                        if (managerStatus === 'hr_rejected' || managerStatus === 'changes_requested' || managerStatus === 'clarification_requested') {
                          reviewStatus = 'needs_clarification';
                          isHrApprovedStatus = false;
                        } else if (managerStatus === 'hr_approved' || managerStatus === 'approved') {
                          reviewStatus = 'finalized';
                          isHrApprovedStatus = true;
                        } else if (managerStatus === 'manager_submitted' || managerStatus === 'finalized') {
                          reviewStatus = 'finalized';
                          // keep existing isHrApprovedStatus flag (could already be true from self review)
                        } else if (reviewStatus === 'not_started' || reviewStatus === 'draft' || reviewStatus === 'submitted') {
                          reviewStatus = 'under_manager_review';
                          isHrApprovedStatus = false;
                        }
                      }

                      // Enable button when action is required
                      const isEnabled = isActive && (reviewStatus === 'not_started' || reviewStatus === 'draft' || reviewStatus === 'needs_clarification');

                      // Determine badge status and styling
                      let badgeConfig: { label: string; className: string; icon: any } = {
                        label: 'Active',
                        className: 'bg-green-500/10 text-green-600 border-green-500/20',
                        icon: CheckCircle2
                      };

                      if (reviewStatus === 'needs_clarification') {
                        badgeConfig = {
                          label: 'Needs Clarification',
                          className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                          icon: AlertCircle
                        };
                      } else if (reviewStatus === 'under_manager_review' || reviewStatus === 'submitted') {
                        badgeConfig = {
                          label: reviewStatus === 'under_manager_review' ? 'Under Review' : 'Submitted',
                          className: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
                          icon: FileText
                        };
                      } else if (reviewStatus === 'finalized') {
                        badgeConfig = {
                          label: isHrApprovedStatus ? 'HR Approved' : 'Completed',
                          className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                          icon: CheckCircle2
                        };
                      } else if (reviewStatus === 'draft') {
                        badgeConfig = {
                          label: 'Draft',
                          className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                          icon: SquarePen
                        };
                      } else if (isActive) {
                        badgeConfig = {
                          label: 'Active',
                          className: 'bg-green-500/10 text-green-600 border-green-500/20',
                          icon: CheckCircle2
                        };
                      } else if (cycle.status === 'draft') {
                        badgeConfig = {
                          label: 'Draft',
                          className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                          icon: SquarePen
                        };
                      } else {
                        badgeConfig = {
                          label: 'Closed',
                          className: 'bg-muted/50 text-muted-foreground',
                          icon: Clock
                        };
                      }

                      const BadgeIcon = badgeConfig.icon;

                      return (
                        <div
                          key={cycle.cycleId || cycle.year}
                          className="group relative rounded-xl border bg-gradient-to-r from-background/95 via-background/90 to-background/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 overflow-hidden"
                        >
                          {/* Subtle gradient overlay on hover */}
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                          <div className="relative flex items-center justify-between p-4 gap-4">
                            {/* Left Section - Cycle Info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                                    {cycle.name || `${cycle.year} Annual Performance Review`}
                                  </h3>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "rounded-full border px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0",
                                      badgeConfig.className
                                    )}
                                  >
                                    <BadgeIcon className="h-3 w-3" />
                                    {badgeConfig.label}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  {cycle.startDate && cycle.endDate && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                      <Calendar className="h-3.5 w-3.5" />
                                      {new Date(cycle.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(cycle.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  )}
                                  {cycle.metadata?.selfReviewEnabled && (
                                    <Badge variant="outline" className="flex items-center gap-1.5 text-xs h-5 px-2">
                                      <FileText className="h-3 w-3" /> Self Review
                                    </Badge>
                                  )}
                                  {reviewStatus === 'submitted' || reviewStatus === 'under_manager_review' ? (
                                    <Badge variant="outline" className="flex items-center gap-1.5 text-xs h-5 px-2 bg-purple-500/10 text-purple-600 border-purple-500/20">
                                      <Send className="h-3 w-3" /> Submitted to Manager
                                    </Badge>
                                  ) : reviewStatus === 'finalized' ? (
                                    <Badge variant="outline" className={cn(
                                      "flex items-center gap-1.5 text-xs h-5 px-2 border shadow-sm",
                                      isHrApprovedStatus
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                        : "bg-green-500/10 text-green-600 border-green-500/20"
                                    )}>
                                      <CheckCircle2 className="h-3 w-3" /> {isHrApprovedStatus ? "HR Approved" : "Completed"}
                                    </Badge>
                                  ) : reviewStatus === 'draft' ? (
                                    <Badge variant="outline" className="flex items-center gap-1.5 text-xs h-5 px-2 bg-blue-500/10 text-blue-600 border-blue-500/20">
                                      <SquarePen className="h-3 w-3" /> In Progress
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {/* Right Section - Action Buttons */}
                            <div className="flex-shrink-0 flex items-center gap-2">
                              {isHrApprovedStatus && (
                                <Button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Manager Feedback button clicked for cycle:', cycle.year, 'employeeId:', currentEmployeeId);
                                    // Open modal immediately
                                    setShowManagerFeedbackModal(true);
                                    setManagerReviewData(null);
                                    // Then fetch data
                                    fetchManagerReview(cycle.year);
                                  }}
                                  className="transition-all duration-300 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md hover:shadow-lg"
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  disabled={loadingManagerReview}
                                >
                                  {loadingManagerReview ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Loading...
                                    </>
                                  ) : (
                                    <>
                                      <MessageSquare className="h-4 w-4 mr-2" />
                                      Manager Feedback
                                    </>
                                  )}
                                </Button>
                              )}
                              <Button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('Review button clicked for cycle:', cycle.year, 'status:', reviewStatus);

                                  setSelectedCycleYear(cycle.year);
                                  setShowSelfAssessmentForm(true);

                                  // Scroll to the self-assessment section
                                  setTimeout(() => {
                                    const selfAssessmentSection = document.querySelector('[data-section="self-assessment"]');
                                    if (selfAssessmentSection) {
                                      selfAssessmentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                  }, 100);
                                }}
                                className={cn(
                                  "transition-all duration-300",
                                  isEnabled
                                    ? "bg-gradient-to-r from-primary to-primary/80 shadow-lg hover:shadow-xl hover:scale-105"
                                    : "hover:bg-accent"
                                )}
                                type="button"
                                disabled={false}
                                variant={isEnabled ? "default" : "outline"}
                                size="sm"
                              >
                                {reviewStatus === 'submitted' || reviewStatus === 'under_manager_review' || reviewStatus === 'finalized' ? (
                                  <>
                                    <FileText className="h-4 w-4 mr-2" />
                                    {reviewStatus === 'finalized' ? 'View Submission' : 'View Review'}
                                  </>
                                ) : reviewStatus === 'draft' ? (
                                  <>
                                    <SquarePen className="h-4 w-4 mr-2" />
                                    Continue
                                  </>
                                ) : reviewStatus === 'needs_clarification' ? (
                                  <>
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    Resolve Feedback
                                  </>
                                ) : (
                                  <>
                                    <SquarePen className="h-4 w-4 mr-2" />
                                    Start
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No annual review cycles available yet</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div data-section="self-assessment">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold">Self Assessment</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {!selfAssessmentReadOnly && (
                    <Button
                      variant="outline"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!selfAssessmentSaveDraft) return;
                        try {
                          await selfAssessmentSaveDraft();
                        } catch (error) {
                          console.error('Self assessment save draft failed:', error);
                        }
                      }}
                      className="flex items-center gap-2"
                      type="button"
                      disabled={!selfAssessmentSaveDraft || selfAssessmentSaving}
                    >
                      {selfAssessmentSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          {selfAssessmentSaveDraft ? 'Save Draft' : 'Preparing...'}
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setShowSelfAssessmentForm(false);
                      setSelectedCycleYear(null);
                      setSelfAssessmentSaveDraft(null);
                      setSelfAssessmentSaving(false);
                      setSelfAssessmentReadOnly(false);
                      // Refresh reviews to get updated status
                      await fetchReviews();
                    }}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Cycles
                  </Button>
                </div>
              </div>
              <EmployeeSelfAssessment
                initialSection="form"
                onRegisterSaveDraft={handleRegisterSelfSaveDraft}
                onSavingStateChange={setSelfAssessmentSaving}
                onReadOnlyChange={handleSelfAssessmentReadOnlyChange}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="client-rm-feedback" className="space-y-4">
          <ClientRMFeedbackTab currentEmployeeId={currentEmployeeId} />
        </TabsContent>

        <GoalDetailPanel
          open={goalPanelState.open}
          goalId={goalPanelState.goalId}
          summary={goalPanelState.summary}
          employee={currentEmployeeSummary}
          onClose={handleCloseGoalPanel}
          getGoal={getGoal}
          onAddMilestone={canEditMilestonesForPanelGoal ? handleAddMilestoneClick : undefined}
          onMilestoneClick={canEditMilestonesForPanelGoal ? handleMilestoneClick : undefined}
          requireApprovedGoalForMilestones
          onSubmitGoal={handleSubmitGoal}
          isSubmittingGoal={submittingGoalId === goalPanelState.goalId}
          triggerRef={goalPanelTriggerRef}
          panelId={goalPanelId}
          onGoalUpdate={async () => {
            // Refresh goals after update
            if (currentEmployeeId) {
              const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
              const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
              setGoals(convertedGoals);
            }
          }}
        />
      </Tabs>

      {currentEmployeeSummary && (
        <GoalSettingModal
          open={showGoalModal}
          onClose={() => setShowGoalModal(false)}
          employee={{
            id: currentEmployeeSummary.id,
            name: currentEmployeeSummary.name,
            email: user?.email || "",
            position: currentEmployeeSummary.role || "",
            department: currentEmployeeSummary.department || "",
            yearsOfExperience: employees.find(emp => emp.id === currentEmployeeId)?.experienceYears || 0,
            skills: employees.find(emp => emp.id === currentEmployeeId)?.skills || []
          }}
          onAISuggestions={async () => {
            // Refresh goals if needed
            if (currentEmployeeId) {
              const apiGoals = await getEmployeeGoals(currentEmployeeId, true);
              const convertedGoals = apiGoals.map(convertGoalToPerformanceGoal);
              setGoals(convertedGoals);
            }
          }}
        />
      )}

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

      {/* Manager Feedback Modal - Sleek Enhanced Design
          Enhanced design features:
          - Optimized spacing with consistent padding (px-8, py-5) for better breathing room
          - Sleeker header with refined typography and icon treatment
          - Enhanced overall rating card with better visual hierarchy
          - Refined card designs with improved padding and spacing
          - Better content spacing (space-y-5) for clearer section separation
          - Polished goal review cards with refined hover states
          - Improved typography scale and line heights
          - Enhanced visual polish with subtle shadows and borders
          - All functionality remains unchanged
      */}
      <Dialog open={showManagerFeedbackModal} onOpenChange={setShowManagerFeedbackModal}>
        <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          {/* Sleek Header Section */}
          <DialogHeader className="px-8 pt-7 pb-5 border-b border-border/40">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-sm">
                <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 pt-0.5">
                <DialogTitle className="text-2xl font-semibold tracking-tight mb-1.5">Manager Feedback</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Review your manager's comprehensive feedback and final performance rating
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable Content Area - Optimized Spacing */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {loadingManagerReview ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <Loader2 className="h-9 w-9 animate-spin text-emerald-600 dark:text-emerald-400" />
                  <div className="absolute inset-0 h-9 w-9 animate-ping opacity-20">
                    <Loader2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-5 font-medium">Loading manager feedback...</p>
              </div>
            ) : managerReviewData ? (
              <div className="space-y-5">
                {/* Overall Rating Card - Enhanced Prominence */}
                <Card className="border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/60 via-emerald-50/30 to-background dark:from-emerald-950/15 dark:via-emerald-950/8 dark:to-background shadow-md hover:shadow-lg transition-shadow duration-300">
                  <CardContent className="p-7">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                            <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <Label className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">Overall Rating</Label>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <Star
                                key={rating}
                                className={cn(
                                  "h-8 w-8 transition-all duration-200",
                                  (managerReviewData.metadata?.finalRating?.overallRating ||
                                    managerReviewData.ratings?.overall || 0) >= rating
                                    ? "fill-emerald-500 text-emerald-500 drop-shadow-sm"
                                    : "fill-muted/15 text-muted-foreground/15"
                                )}
                              />
                            ))}
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                              {managerReviewData.metadata?.finalRating?.overallRating ||
                                managerReviewData.ratings?.overall || '—'}
                            </span>
                            <span className="text-lg font-medium text-muted-foreground">/5</span>
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 shadow-sm px-4 py-1.5 h-auto text-sm font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        HR Approved
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary Feedback - Refined Card */}
                {managerReviewData.metadata?.finalRating?.summaryFeedback || managerReviewData.comments ? (
                  <Card className="hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/20">
                          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        Summary Feedback
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {managerReviewData.metadata?.finalRating?.summaryFeedback || managerReviewData.comments || 'No feedback provided'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Development Recommendations - Refined Card */}
                {managerReviewData.metadata?.finalRating?.developmentRecommendations ? (
                  <Card className="hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/20">
                          <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        Development Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {managerReviewData.metadata.finalRating.developmentRecommendations}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Development Need - Refined Card */}
                {managerReviewData.metadata?.finalRating?.developmentNeed ? (
                  <Card className="hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/20">
                          <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        Development Need
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {managerReviewData.metadata.finalRating.developmentNeed}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Action Plan - Refined Card */}
                {managerReviewData.metadata?.finalRating?.actionPlan ? (
                  <Card className="hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-3">
                        <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/20">
                          <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        Action Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {managerReviewData.metadata.finalRating.actionPlan}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Goal Reviews - Enhanced Card */}
                {managerReviewData.metadata?.goalReviews && managerReviewData.metadata.goalReviews.length > 0 ? (
                  <Card className="hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-3">
                          <div className="p-1.5 rounded-md bg-cyan-100 dark:bg-cyan-900/20">
                            <Briefcase className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                          </div>
                          Goal Reviews
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs font-medium px-2.5 py-1">
                          {managerReviewData.metadata.goalReviews.length} {managerReviewData.metadata.goalReviews.length === 1 ? 'Goal' : 'Goals'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                      {managerReviewData.metadata.goalReviews.map((goalReview: any, index: number) => (
                        <div
                          key={goalReview.goalId || index}
                          className="group p-5 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted/60 hover:border-border transition-all duration-200"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm text-foreground mb-2 leading-snug">
                                {goalReview.goalDescription || `Goal ${index + 1}`}
                              </h4>
                              {goalReview.weightage && (
                                <Badge variant="outline" className="text-xs font-medium px-2 py-0.5">
                                  <Target className="h-3 w-3 mr-1" />
                                  Weightage: {goalReview.weightage}%
                                </Badge>
                              )}
                            </div>
                            {goalReview.managerRating && (
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((rating) => (
                                    <Star
                                      key={rating}
                                      className={cn(
                                        "h-5 w-5 transition-all duration-200",
                                        goalReview.managerRating >= rating
                                          ? "fill-emerald-500 text-emerald-500"
                                          : "fill-muted/20 text-muted-foreground/20"
                                      )}
                                    />
                                  ))}
                                </div>
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 min-w-[2.25rem] text-right">
                                  {goalReview.managerRating}/5
                                </span>
                              </div>
                            )}
                          </div>
                          {goalReview.managerComments && (
                            <div className="mt-4 pt-4 border-t border-border/50">
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {goalReview.managerComments}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No manager feedback available for this review cycle.</p>
              </div>
            )}
          </div>

          {/* Sleek Footer */}
          <DialogFooter className="px-8 py-5 border-t border-border/40 bg-muted/20">
            <Button
              onClick={() => setShowManagerFeedbackModal(false)}
              variant="outline"
              className="min-w-[100px]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

