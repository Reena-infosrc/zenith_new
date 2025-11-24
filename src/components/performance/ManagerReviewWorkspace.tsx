import { useState, useEffect, useCallback, useMemo, Dispatch, SetStateAction } from "react";
import {
  Users,
  Search,
  Filter,
  Eye,
  Star,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  MessageSquare,
  Upload,
  Link as LinkIcon,
  X,
  Save,
  ChevronRight,
  User,
  Target,
  Award,
  TrendingUp,
  Download,
  RefreshCw,
  HelpCircle,
  Calendar,
  Briefcase,
  Mail,
  Bell,
  ChevronLeft,
  Edit,
  Loader2,
  Check,
  ChevronDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/use-employees";
import { useAuth } from "@/hooks/use-auth";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";

// Types
interface DirectReport {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  photoUrl?: string;
  reviewStatus: 'not_started' | 'self_submitted' | 'manager_reviewing' | 'clarification_requested' | 'clarification_responded' | 'manager_submitted';
  selfReviewSubmittedAt?: string;
  cycleId: string;
  cycleName: string;
}

interface EmployeeSelfReview {
  employeeId: string;
  keyAccomplishments: string;
  beyondResponsibilities: string;
  challenges: string;
  areasToImprove: string;
  skillsAcquired: string;
  trainingsCompleted: string;
  trainingsToPursue: string;
  toolsAndTechnologies: ToolsAndTechnology[];
}

interface ToolsAndTechnology {
  testType: string;
  tool: string;
  rating: number; // 1-3
}

interface GoalReview {
  goalId: string;
  goalDescription: string;
  weightage: number;
  completion?: number; // Completion percentage
  employeeRating?: number; // 5-1
  managerRating?: number; // 5-1
  managerComments?: string;
}

interface CompetencyReview {
  competencyId: string;
  competencyName: string;
  weightage: number;
  managerRating?: number; // 5-1
  managerComments?: string;
}

interface ManagerFinalRating {
  overallRating?: number; // 5-1
  summaryFeedback: string;
  developmentRecommendations: string;
  developmentNeed: string;
  actionPlan: string;
  evidenceLinks: string[];
  evidenceFiles: File[];
}

interface ClarificationRequest {
  id: string;
  field: string;
  question: string;
  employeeResponse?: string;
  status: 'pending' | 'responded' | 'resolved';
  requestedAt?: string;
  requestedBy?: string;
}

interface ReviewPayload {
  cycleYear: string;
  employeeId: string;
  reviewerId: string;
  reviewType: string;
  goalIds: string[];
  ratings: Record<string, any>;
  comments?: string;
  strengths?: string[];
  improvements?: string[];
  attachments: string[];
  metadata: Record<string, any>;
  submittedAt?: string;  // undefined = draft, set timestamp when submitting
}

const COMPETENCIES = [
  { id: 'business_project', name: 'Business / Project Goals', weightage: 60 },
  { id: 'functional_behavioral', name: 'Functional / Behavioural', weightage: 20 },
  { id: 'innovation_initiatives', name: 'Innovation / Initiatives / Collaboration', weightage: 20 }
];

interface ManagerReviewWorkspaceProps {
  initialEmployeeId?: string;
  initialCycleYear?: string | null;
  hideHeader?: boolean;
  onSaveDraftRef?: React.MutableRefObject<(() => void) | null>;
  onReviewDataStatusChange?: (hasReviewData: boolean) => void;
}

export function ManagerReviewWorkspace({ initialEmployeeId, initialCycleYear, hideHeader = false, onSaveDraftRef, onReviewDataStatusChange }: ManagerReviewWorkspaceProps = {}) {
  const { user } = useAuth();
  const { employees, isLoading: employeesLoading } = useEmployees();
  const { toast } = useToast();
  const { preserveScroll } = usePreserveScroll();
  
  const [directReports, setDirectReports] = useState<DirectReport[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<DirectReport | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Review data
  const [employeeSelfReview, setEmployeeSelfReview] = useState<EmployeeSelfReview | null>(null);
  const [goalReviews, setGoalReviews] = useState<GoalReview[]>([]);
  const [competencyReviews, setCompetencyReviews] = useState<CompetencyReview[]>([]);
  const [finalRating, setFinalRating] = useState<ManagerFinalRating>({
    summaryFeedback: '',
    developmentRecommendations: '',
    developmentNeed: '',
    actionPlan: '',
    evidenceLinks: [],
    evidenceFiles: []
  });
  const [clarificationRequests, setClarificationRequests] = useState<ClarificationRequest[]>([]);
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewCycleYear, setReviewCycleYear] = useState<string | null>(null);
  const [reviewEmployeeId, setReviewEmployeeId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [isClarificationRequested, setIsClarificationRequested] = useState(false);
  const [isClarificationResponded, setIsClarificationResponded] = useState(false);
  const [employeeSelfReviewId, setEmployeeSelfReviewId] = useState<string | null>(null);

  // Fetch direct reports
  const fetchDirectReports = useCallback(async () => {
    if (!user?.email) return;
    
    try {
      setLoading(true);
      // Find current user's employee record
      const currentUser = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
      if (!currentUser) return;

      // Find direct reports (employees who report to current user)
      const reports = employees
        .filter(emp => emp.reporting_to === currentUser.id)
        .map(emp => ({
          id: emp.id,
          name: emp.name || 'Unknown',
          email: emp.email || '',
          position: emp.position || '',
          department: emp.department || '',
          photoUrl: emp.photoUrl,
          reviewStatus: 'not_started' as const,
          selfReviewSubmittedAt: undefined,
          cycleId: initialCycleYear || '',
          cycleName: initialCycleYear ? `${initialCycleYear} Annual Performance Review` : 'Annual Performance Review'
        }));

      setDirectReports(reports);
    } catch (error) {
      console.error('Error fetching direct reports:', error);
      toast({
        title: "Error",
        description: "Failed to load direct reports",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [user, employees, toast, initialCycleYear]);

  useEffect(() => {
    fetchDirectReports();
  }, [fetchDirectReports]);

  // Fetch employee review data
  const fetchEmployeeReview = useCallback(async (employeeId: string, cycleYear?: string | null) => {
    try {
      // Clear previous data immediately
      setEmployeeSelfReview(null);
      setGoalReviews([]);
      setCompetencyReviews(COMPETENCIES.map(comp => ({
        competencyId: comp.id,
        competencyName: comp.name,
        weightage: comp.weightage
      })));
      setFinalRating({
        summaryFeedback: '',
        developmentRecommendations: '',
        developmentNeed: '',
        actionPlan: '',
        evidenceLinks: [],
        evidenceFiles: []
      });
      setReviewCycleYear(null);
      setReviewEmployeeId(null);
      setActiveReviewId(null);
      setEmployeeSelfReviewId(null);
      setIsClarificationResponded(false);
      
      setLoading(true);
      
      // Fetch reviews from API - need both self-review (employee's submission) and manager review
      let employeeSelfReviewData = null;
      let managerReviewData = null;
      
      if (cycleYear) {
        // OPTIMIZED: Fetch both manager review and self-review in a single API call
        // The API now automatically includes self-reviews when querying manager reviews
        const managerReviewResponse = await authenticatedFetch(
          `${API_BASE_URL}/reviews?employeeId=${employeeId}&cycleYear=${cycleYear}&reviewType=manager`,
          { method: 'GET' }
        );
        
        if (managerReviewResponse.ok) {
          const allReviews = await managerReviewResponse.json();
          console.log(`Fetched ${allReviews?.length || 0} reviews for employee ${employeeId}, cycle ${cycleYear}:`, allReviews);
          
          // Separate manager reviews and self-reviews from the response
          const managerReviews = allReviews.filter((r: any) => r.reviewType === 'manager');
          const selfReviews = allReviews.filter((r: any) => r.reviewType === 'self');
          
          console.log(`Found ${managerReviews.length} manager review(s) and ${selfReviews.length} self-review(s)`);
          
          // Process manager review
          if (managerReviews.length > 0) {
            // Prefer submitted review over draft
            const submittedReview = managerReviews.find((r: any) => !r.isDraft && r.submittedAt);
            managerReviewData = submittedReview || managerReviews.find((r: any) => r.isDraft) || managerReviews[0];
            console.log('Selected manager review data:', managerReviewData);
          }
          
          // Process self-review
          if (selfReviews.length > 0) {
            // Prefer submitted review over draft
            const submittedReview = selfReviews.find((r: any) => !r.isDraft && r.submittedAt);
            employeeSelfReviewData = submittedReview || selfReviews.find((r: any) => r.isDraft) || selfReviews[0];
            console.log('Selected self-review data:', employeeSelfReviewData);
            // Store the self-review ID for clarification requests
            if (employeeSelfReviewData?.reviewId) {
              setEmployeeSelfReviewId(employeeSelfReviewData.reviewId);
            }
          } else {
            console.log('No self-reviews found in response - employee may not have submitted yet');
            setEmployeeSelfReviewId(null);
          }
        } else {
          console.error('Failed to fetch reviews:', managerReviewResponse.status, await managerReviewResponse.text());
        }
      } else {
        // Fallback: fetch latest reviews for employee (without cycleYear)
        // Try to fetch manager reviews first, which should include self-reviews
        const managerReviewResponse = await authenticatedFetch(
          `${API_BASE_URL}/reviews?employeeId=${employeeId}&reviewType=manager`,
          { method: 'GET' }
        );
        
        if (managerReviewResponse.ok) {
          const allReviews = await managerReviewResponse.json();
          console.log(`Fetched ${allReviews?.length || 0} reviews (fallback) for employee ${employeeId}:`, allReviews);
          
          // Separate manager reviews and self-reviews
          const managerReviews = allReviews.filter((r: any) => r.reviewType === 'manager');
          const selfReviews = allReviews.filter((r: any) => r.reviewType === 'self');
          
          // Process manager review
          if (managerReviews.length > 0) {
            const submittedReview = managerReviews.find((r: any) => !r.isDraft && r.submittedAt);
            managerReviewData = submittedReview || managerReviews.find((r: any) => r.isDraft) || managerReviews[0];
          }
          
          // Process self-review
          if (selfReviews.length > 0) {
            const submittedReview = selfReviews.find((r: any) => !r.isDraft && r.submittedAt);
            employeeSelfReviewData = submittedReview || selfReviews.find((r: any) => r.isDraft) || selfReviews[0];
            console.log('Selected self-review data (fallback):', employeeSelfReviewData);
            // Store the self-review ID for clarification requests
            if (employeeSelfReviewData?.reviewId) {
              setEmployeeSelfReviewId(employeeSelfReviewData.reviewId);
            }
          } else {
            // If no self-review in manager response, try fetching self-reviews separately
            const selfReviewResponse = await authenticatedFetch(
              `${API_BASE_URL}/reviews?employeeId=${employeeId}&reviewType=self`,
              { method: 'GET' }
            );
            
            if (selfReviewResponse.ok) {
              const selfReviewsOnly = await selfReviewResponse.json();
              if (Array.isArray(selfReviewsOnly) && selfReviewsOnly.length > 0) {
                const submittedReview = selfReviewsOnly.find((r: any) => !r.isDraft && r.submittedAt);
                employeeSelfReviewData = submittedReview || selfReviewsOnly.find((r: any) => r.isDraft) || selfReviewsOnly[0];
                console.log('Selected self-review data (separate fallback):', employeeSelfReviewData);
              }
            }
          }
        } else {
          console.error('Failed to fetch reviews (fallback):', managerReviewResponse.status, await managerReviewResponse.text());
        }
      }

      // Process employee self-review data (for displaying employee's submission)
      let selfReview: EmployeeSelfReview | null = null;
      
      console.log('Processing employee self-review data:', employeeSelfReviewData);
      
      if (employeeSelfReviewData) {
        const selfMeta = employeeSelfReviewData.metadata || {};
        const selfReviewFields = selfMeta.selfReviewFields || {};
        
        // Check if we have any self-review data at all
        const hasSelfReviewData = 
          selfReviewFields.significantAccomplishments ||
          selfReviewFields.beyondRoleContributions ||
          selfReviewFields.challengesAndSolutions ||
          selfReviewFields.areasNeedingImprovement ||
          selfReviewFields.certificationsCompleted ||
          selfReviewFields.certificationsPlanned ||
          selfReviewFields.newSkillsAcquired ||
          selfMeta.toolsAndTechnologies?.length > 0 ||
          employeeSelfReviewData.comments; // Also check comments field
        
        if (hasSelfReviewData) {
          // Try to extract from comments if metadata fields are empty
          let accomplishments = selfReviewFields.significantAccomplishments || '';
          let beyondRole = selfReviewFields.beyondRoleContributions || '';
          let challenges = selfReviewFields.challengesAndSolutions || '';
          let improvements = selfReviewFields.areasNeedingImprovement || '';
          let certifications = selfReviewFields.certificationsCompleted || '';
          let certificationsPlanned = selfReviewFields.certificationsPlanned || '';
          
          // If metadata fields are empty but comments exist, try to parse comments
          if (employeeSelfReviewData.comments && !accomplishments && !beyondRole) {
            // Comments might contain the self-review data in a formatted way
            // For now, we'll use the comments as a fallback display
            accomplishments = employeeSelfReviewData.comments;
          }
          
          selfReview = {
        employeeId,
            keyAccomplishments: accomplishments,
            beyondResponsibilities: beyondRole,
            challenges: challenges,
            areasToImprove: improvements,
            skillsAcquired: selfReviewFields.newSkillsAcquired || '',
            trainingsCompleted: certifications,
            trainingsToPursue: certificationsPlanned,
            toolsAndTechnologies: selfMeta.toolsAndTechnologies || []
          };
          
          console.log('Extracted self-review:', selfReview);
        } else {
          console.log('No self-review data found in response');
        }
      }

      // Process manager review data (for manager's ratings and comments)
      let goalReviews: GoalReview[] = [];
      let competencyReviews: CompetencyReview[] = [];
      let finalRatingData: ManagerFinalRating = {
        summaryFeedback: '',
        developmentRecommendations: '',
        developmentNeed: '',
        actionPlan: '',
        evidenceLinks: [],
        evidenceFiles: []
      };

      if (managerReviewData?.metadata) {
        const managerMeta = managerReviewData.metadata;
        
        // Map goal reviews from manager review metadata
        if (managerMeta.goalReviews && Array.isArray(managerMeta.goalReviews)) {
          goalReviews = managerMeta.goalReviews.map((goal: any) => ({
            goalId: goal.goalId,
            goalDescription: goal.goalDescription || '',
            weightage: goal.weightage || 0,
            completion: goal.completion || 0,
            employeeRating: goal.employeeRating || undefined,
            managerRating: goal.managerRating || undefined,
            managerComments: goal.managerComments || ''
          }));
        } else if (employeeSelfReviewData?.metadata?.goalAssessments) {
          // Fallback: use employee's goal assessments if manager review doesn't have goalReviews
          const goalAssessments = employeeSelfReviewData.metadata.goalAssessments;
          goalReviews = goalAssessments.map((goal: any) => ({
            goalId: goal.goalId,
            goalDescription: goal.goalDescription || '',
            weightage: goal.weightage || 0,
            completion: goal.completion || 0,
            employeeRating: goal.employeeRating || undefined,
            managerRating: goal.managerRating || undefined,
            managerComments: goal.managerComments || ''
          }));
        }

        // Map competency reviews from manager review metadata
        if (managerMeta.competencyReviews && Array.isArray(managerMeta.competencyReviews)) {
          competencyReviews = managerMeta.competencyReviews.map((comp: any) => ({
            competencyId: comp.competencyId,
            competencyName: comp.competencyName || '',
            weightage: comp.weightage || 0,
            managerRating: comp.managerRating || undefined
          }));
        } else {
          // Fallback: initialize from COMPETENCIES
          competencyReviews = COMPETENCIES.map(comp => ({
            competencyId: comp.id,
            competencyName: comp.name,
            weightage: comp.weightage,
            managerRating: managerReviewData.ratings?.competencies?.[comp.id] || undefined
          }));
        }

        // Set final rating from manager review
        if (managerMeta.finalRating) {
          finalRatingData = {
            overallRating: managerReviewData.ratings?.overall || managerMeta.finalRating.overallRating,
            summaryFeedback: managerMeta.finalRating.summaryFeedback || '',
            developmentRecommendations: managerMeta.finalRating.developmentRecommendations || '',
            developmentNeed: managerMeta.finalRating.developmentNeed || '',
            actionPlan: managerMeta.finalRating.actionPlan || '',
            evidenceLinks: managerMeta.finalRating.evidenceLinks || [],
            evidenceFiles: []
          };
        }
      } else if (employeeSelfReviewData?.metadata) {
        // If no manager review, initialize from employee review structure
        const empMeta = employeeSelfReviewData.metadata;
        if (empMeta.goalAssessments && Array.isArray(empMeta.goalAssessments)) {
          goalReviews = empMeta.goalAssessments.map((goal: any) => ({
            goalId: goal.goalId,
            goalDescription: goal.goalDescription || '',
            weightage: goal.weightage || 0,
            completion: goal.completion || 0,
            employeeRating: goal.employeeRating || undefined,
            managerRating: goal.managerRating || undefined,
            managerComments: goal.managerComments || ''
          }));
        }
        competencyReviews = COMPETENCIES.map(comp => ({
        competencyId: comp.id,
        competencyName: comp.name,
        weightage: comp.weightage
      }));
      } else {
        // No review data found, set empty state
        setEmployeeSelfReview(null);
        setGoalReviews([]);
        setCompetencyReviews(COMPETENCIES.map(comp => ({
          competencyId: comp.id,
          competencyName: comp.name,
          weightage: comp.weightage
        })));
        setReviewCycleYear(null);
        setReviewEmployeeId(null);
        return;
      }

      // Only update self-review if we got new data, otherwise preserve existing
      // This ensures self-review data persists even after saving manager draft
      setEmployeeSelfReview(prev => {
        if (selfReview) {
          console.log('Setting new self-review data:', selfReview);
          return selfReview;
        } else {
          console.log('No self-review data in response, preserving existing:', prev);
          // Preserve existing self-review data - don't clear it
          return prev;
        }
      });
      
      setGoalReviews(goalReviews);
      setCompetencyReviews(competencyReviews);
      setFinalRating(finalRatingData);
      
      // Set active review ID for saving (prefer manager review ID)
      const activeReview = managerReviewData || employeeSelfReviewData;
      if (activeReview?.reviewId) {
        setActiveReviewId(activeReview.reviewId);
      }
      
      // Store cycle year and employee ID from review response
      if (activeReview?.cycleYear) {
        setReviewCycleYear(activeReview.cycleYear);
      }
      if (activeReview?.employeeId || activeReview?.employee_id) {
        setReviewEmployeeId(activeReview.employeeId || activeReview.employee_id);
      }
      
      // Load clarification requests from self-review metadata
      const selfReviewMeta = employeeSelfReviewData?.metadata || {};
      const managerClarificationRequests = selfReviewMeta.clarificationRequests || [];
      const managerClarificationFields = selfReviewMeta.managerClarificationFields || [];
      const managerClarificationQuestion = selfReviewMeta.managerClarificationQuestion || '';
      const managerClarificationRequestedAt = selfReviewMeta.managerClarificationRequestedAt;
      
      // Set clarification requests state
      if (managerClarificationRequests.length > 0) {
        setClarificationRequests(managerClarificationRequests);
      }
      
      // Check if review was rejected (needs clarification) or if employee responded
      const metadataStatus = managerReviewData?.metadata?.status || activeReview?.metadata?.status || employeeSelfReviewData?.metadata?.status || '';
      const hrRejectionReason = managerReviewData?.metadata?.hrRejectionReason || activeReview?.metadata?.hrRejectionReason || null;
      const employeeClarificationRespondedAt = employeeSelfReviewData?.metadata?.employeeClarificationRespondedAt;
      
      // Check if manager has sent clarification request
      const hasManagerClarificationRequest = managerClarificationRequestedAt || managerClarificationFields.length > 0 || managerClarificationRequests.length > 0;
      
      // Check HR rejection separately (independent of manager clarification)
      if (metadataStatus === 'changes_requested' || metadataStatus === 'hr_rejected') {
        // HR has rejected - set rejection reason (but don't clear manager clarification)
        setRejectionReason(hrRejectionReason);
        // Update direct report status to clarification_requested
        setDirectReports(prev => prev.map(rep => 
          rep.id === employeeId 
            ? { ...rep, reviewStatus: 'clarification_requested' }
            : rep
        ));
      } else {
        // Only clear rejection reason if it's not an HR rejection
        // Don't clear it if HR has rejected, even if manager also sent clarification
        if (!hrRejectionReason) {
          setRejectionReason(null);
        }
      }
      
      // Check if employee has responded to clarification
      if (metadataStatus === 'clarification_responded' || employeeClarificationRespondedAt) {
        setIsClarificationResponded(true);
        setIsClarificationRequested(false);
        // Update direct report status to clarification_responded
        setDirectReports(prev => prev.map(rep => 
          rep.id === employeeId 
            ? { ...rep, reviewStatus: 'clarification_responded' }
            : rep
        ));
      } else if (hasManagerClarificationRequest && metadataStatus === 'clarification_requested') {
        // Manager has sent clarification request (independent of HR rejection)
        setIsClarificationRequested(true);
        setIsClarificationResponded(false);
        // Update direct report status to clarification_requested
        setDirectReports(prev => prev.map(rep => 
          rep.id === employeeId 
            ? { ...rep, reviewStatus: 'clarification_requested' }
            : rep
        ));
      } else if (!hasManagerClarificationRequest && !hrRejectionReason) {
        // Only clear these if neither manager clarification nor HR rejection exists
        setIsClarificationRequested(false);
        setIsClarificationResponded(false);
      }
    } catch (error) {
      console.error('Error fetching employee review:', error);
      toast({
        title: "Error",
        description: "Failed to load employee review data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Auto-select initial employee if provided
  useEffect(() => {
    if (initialEmployeeId && directReports.length > 0 && !selectedEmployee) {
      const employee = directReports.find(rep => rep.id === initialEmployeeId);
      if (employee) {
        setSelectedEmployee(employee);
      }
    }
  }, [initialEmployeeId, directReports, selectedEmployee]);

  // Fetch review when employee is selected
  useEffect(() => {
    if (selectedEmployee) {
      fetchEmployeeReview(selectedEmployee.id, initialCycleYear);
    }
  }, [selectedEmployee, initialCycleYear, fetchEmployeeReview]);

  // Notify parent about review data status
  useEffect(() => {
    if (onReviewDataStatusChange) {
      const hasReviewData = !!(employeeSelfReview || goalReviews.length > 0);
      onReviewDataStatusChange(hasReviewData);
    }
  }, [employeeSelfReview, goalReviews, onReviewDataStatusChange]);

  const filteredReports = directReports.filter(report => {
    const matchesStatus = filterStatus === 'all' || report.reviewStatus === filterStatus;
    const matchesSearch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         report.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: DirectReport['reviewStatus']) => {
    const variants: Record<string, { label: string; className: string; icon: any }> = {
      not_started: { label: 'Not Started', className: 'bg-muted/50 text-muted-foreground', icon: Clock },
      self_submitted: { label: 'Self Review Submitted', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: FileText },
      manager_reviewing: { label: 'Under Review', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Eye },
      clarification_requested: { label: 'Clarification Requested', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: HelpCircle },
      clarification_responded: { label: 'Response Received', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 animate-pulse', icon: Bell },
      manager_submitted: { label: 'Submitted to HR', className: 'bg-green-500/10 text-green-600 border-green-500/20', icon: CheckCircle2 }
    };
    const config = variants[status] || variants.not_started;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("flex items-center gap-1", config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleViewReview = (employee: DirectReport) => {
    setSelectedEmployee(employee);
    setActiveReviewId(null);
    setClarificationRequests([]);
    fetchEmployeeReview(employee.id);
  };

  const handleCloseReview = () => {
    setSelectedEmployee(null);
    setEmployeeSelfReview(null);
    setGoalReviews([]);
    setCompetencyReviews([]);
    setFinalRating({
      summaryFeedback: '',
      developmentRecommendations: '',
      developmentNeed: '',
      actionPlan: '',
      evidenceLinks: [],
      evidenceFiles: []
    });
    setClarificationRequests([]);
    setActiveReviewId(null);
  };

  const buildReviewPayload = useCallback((overrides: Partial<ReviewPayload> = {}): ReviewPayload => {
    if (!selectedEmployee) {
      throw new Error("No employee selected");
    }

    const cycleMatch = selectedEmployee.cycleName?.match(/\d{4}/);
    const cycleYear = cycleMatch ? cycleMatch[0] : new Date().getFullYear().toString();
    const reviewerId = user?.email || user?.id || 'unknown';

    const sanitizedFinalRating = {
      ...finalRating,
      evidenceFiles: finalRating.evidenceFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
    };

    const payload: ReviewPayload = {
      cycleYear,
      employeeId: selectedEmployee.id,
      reviewerId,
      reviewType: 'manager',
      goalIds: goalReviews.map((goal) => goal.goalId),
      ratings: {
        overall: finalRating.overallRating ?? null,
        goals: goalReviews.reduce<Record<string, number | null>>((acc, goal) => {
          acc[goal.goalId] = goal.managerRating ?? null;
          return acc;
        }, {}),
        competencies: competencyReviews.reduce<Record<string, number | null>>((acc, comp) => {
          acc[comp.competencyId] = comp.managerRating ?? null;
          return acc;
        }, {})
      },
      comments: finalRating.summaryFeedback,
      strengths: [],
      improvements: [],
      attachments: finalRating.evidenceLinks,
      metadata: {
        goalReviews,
        competencyReviews,
        finalRating: sanitizedFinalRating,
        clarificationRequests
      },
      submittedAt: undefined,  // undefined = draft
    };

    const mergedPayload: ReviewPayload = {
      ...payload,
      ...overrides,
      metadata: overrides.metadata
        ? { ...payload.metadata, ...overrides.metadata }
        : payload.metadata
    };

    return mergedPayload;
  }, [selectedEmployee, user, goalReviews, competencyReviews, finalRating, clarificationRequests]);

  const upsertReview = useCallback(
    async (payload: ReviewPayload) => {
      const endpoint = activeReviewId
        ? `${API_BASE_URL}/reviews/${activeReviewId}`
        : `${API_BASE_URL}/reviews`;
      const method = activeReviewId ? 'PUT' : 'POST';

      const response = await authenticatedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorMessage = await response.text().catch(() => 'Failed to save review');
        throw new Error(errorMessage || 'Failed to save review');
      }

      const data = await response.json();
      if (data?.reviewId) {
        setActiveReviewId(data.reviewId);
      }
      return data;
    },
    [activeReviewId]
  );

  const handleSaveDraft = useCallback(async () => {
    console.log('handleSaveDraft called, selectedEmployee:', selectedEmployee);
    if (!selectedEmployee) {
      console.warn('No employee selected');
      toast({
        title: "No employee selected",
        description: "Please choose an employee before saving a draft",
        variant: "destructive"
      });
      return;
    }
  
    try {
      console.log('Building review payload...');
      setLoading(true);
      const payload = buildReviewPayload({
        submittedAt: undefined,  // undefined = draft
        metadata: { status: 'manager_draft' }
      });
      console.log('Payload built:', payload);
      console.log('Calling upsertReview...');
      const result = await upsertReview(payload);
      console.log('upsertReview result:', result);

      toast({
        title: "Draft Saved",
        description: "Your review has been saved as a draft"
      });

      // Reload the review data after saving to ensure UI is in sync
      // This will re-fetch both manager review and employee self-review
      // The fetchEmployeeReview function will preserve existing self-review if new data isn't found
      if (selectedEmployee) {
        console.log('Re-fetching employee review after saving draft...');
        await fetchEmployeeReview(selectedEmployee.id, initialCycleYear || reviewCycleYear);
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save draft",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, buildReviewPayload, upsertReview, toast, fetchEmployeeReview, initialCycleYear, reviewCycleYear]);

  // Expose save draft function via ref
  useEffect(() => {
    if (onSaveDraftRef) {
      console.log('Setting saveDraftRef.current, selectedEmployee:', selectedEmployee);
      onSaveDraftRef.current = handleSaveDraft;
      console.log('saveDraftRef.current set to:', typeof onSaveDraftRef.current);
    }
    return () => {
      if (onSaveDraftRef) {
        onSaveDraftRef.current = null;
      }
    };
  }, [onSaveDraftRef, handleSaveDraft, selectedEmployee]);

  const handleRatingChange = (goalId: string, rating: number) => {
    setGoalReviews(prev => prev.map(goal => 
      goal.goalId === goalId ? { ...goal, managerRating: rating } : goal
    ));
  };

  const handleCompetencyRatingChange = (competencyId: string, rating: number) => {
    setCompetencyReviews(prev => prev.map(comp => 
      comp.competencyId === competencyId ? { ...comp, managerRating: rating } : comp
    ));
  };

  const handleAddEvidenceLink = () => {
    const link = prompt("Enter Google Drive link:");
    if (link) {
      setFinalRating(prev => ({
        ...prev,
        evidenceLinks: [...prev.evidenceLinks, link]
      }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setFinalRating(prev => ({
        ...prev,
        evidenceFiles: [...prev.evidenceFiles, ...Array.from(files)]
      }));
    }
  };

  const handleRequestClarification = () => {
    setShowClarificationModal(true);
  };

  const handleSubmitReview = async () => {
    try {
      console.log('=== handleSubmitReview called ===');
      console.log('selectedEmployee:', selectedEmployee);
      
      if (!selectedEmployee) {
        console.error('No selected employee');
        toast({
          title: "Error",
          description: "No employee selected",
          variant: "destructive"
        });
        return;
      }

      console.log('=== Validation Check ===');
      console.log('Goal Reviews:', goalReviews);
      console.log('Competency Reviews:', competencyReviews);
      console.log('Final Rating:', finalRating);

    // Validate required fields
      // Only require goal ratings if there are goals
      const hasAllGoalRatings = goalReviews.length === 0 || goalReviews.every(goal => goal.managerRating !== undefined && goal.managerRating !== null);
      // Competency ratings are optional - not required
      const hasOverallRating = finalRating.overallRating !== undefined && finalRating.overallRating !== null;
      const hasSummaryFeedback = finalRating.summaryFeedback && typeof finalRating.summaryFeedback === 'string' && finalRating.summaryFeedback.trim().length > 0;

      console.log('Validation Results:', {
        hasAllGoalRatings,
        hasOverallRating,
        hasSummaryFeedback,
        goalReviewsCount: goalReviews.length,
        competencyReviewsCount: competencyReviews.length,
        overallRatingValue: finalRating.overallRating,
        summaryFeedbackValue: finalRating.summaryFeedback
      });

      // Build detailed error message (only for required fields)
      const missingFields: string[] = [];
      if (!hasAllGoalRatings && goalReviews.length > 0) {
        const missingGoals = goalReviews.filter(g => g.managerRating === undefined || g.managerRating === null).map(g => g.goalDescription || g.goalId);
        missingFields.push(`Goal ratings: ${missingGoals.join(', ')}`);
      }
      // Competency ratings are optional - removed from validation
      if (!hasOverallRating) {
        missingFields.push('Overall rating');
      }
      if (!hasSummaryFeedback) {
        missingFields.push('Summary feedback');
      }

      if (!hasAllGoalRatings || !hasOverallRating || !hasSummaryFeedback) {
        console.error('Validation failed. Missing fields:', missingFields);
      toast({
        title: "Incomplete Review",
          description: `Please complete all required fields: ${missingFields.join(', ')}`,
        variant: "destructive"
      });
      return;
    }

      console.log('Validation passed. Proceeding with submission...');

      setLoading(true);
      const payload = buildReviewPayload({
        submittedAt: new Date().toISOString(),  // Setting submittedAt moves to submitted table
        metadata: { status: 'manager_submitted' }
      });
      
      console.log('Submitting payload:', payload);
      await upsertReview(payload);

      console.log('Submission successful');
      toast({
        title: "Success",
        description: "Review submitted successfully to HR"
      });

      // Update status and clear clarification flags
      setDirectReports(prev => prev.map(rep => 
        rep.id === selectedEmployee.id 
          ? { ...rep, reviewStatus: 'manager_submitted' }
          : rep
      ));
      
      // Clear clarification request state
      setIsClarificationRequested(false);
      setRejectionReason(null);

      handleCloseReview();
    } catch (error) {
      console.error('Error in handleSubmitReview:', error);
      toast({
        title: "Error",
      description: error instanceof Error ? error.message : "Failed to submit review",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderRatingStars = (value: number | undefined, onChange: (value: number) => void, disabled = false) => {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => !disabled && onChange(rating)}
              disabled={disabled}
              className={cn(
                "transition-all duration-200",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-110",
                value !== undefined && rating <= value ? "text-yellow-400" : "text-muted-foreground"
              )}
            >
              <Star className={cn("h-5 w-5", value !== undefined && rating <= value ? "fill-current" : "")} />
            </button>
          ))}
        </div>
        {value !== undefined && (
          <span className="text-sm font-medium text-muted-foreground">
            {value === 5 ? 'Outstanding' : value === 4 ? 'Exceeds' : value === 3 ? 'Meets' : value === 2 ? 'Below' : 'Needs Improvement'}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header - hidden when embedded in My Team */}
      {!hideHeader && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                Performance Reviews
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Review and rate your direct reports' performance
              </p>
            </div>
          </div>

          {/* Filters */}
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-background/50"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[200px] bg-background/50">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="self_submitted">Self Review Submitted</SelectItem>
                    <SelectItem value="manager_reviewing">Under Review</SelectItem>
                    <SelectItem value="clarification_requested">Clarification Requested</SelectItem>
                    <SelectItem value="manager_submitted">Submitted to HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Conditionally render Employee Cards or Review Form */}
      {!selectedEmployee ? (
        <>
          {/* Direct Reports List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => (
              <Card
                key={report.id}
                className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarImage src={report.photoUrl} />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {report.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{report.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">{report.position}</p>
                      <p className="text-xs text-muted-foreground truncate">{report.department}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Review Cycle</span>
                      <Badge variant="outline" className="text-xs">
                        {report.cycleName}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      {getStatusBadge(report.reviewStatus)}
                    </div>

                    {report.selfReviewSubmittedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Submitted</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(report.selfReviewSubmittedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-border/50">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewReview(report)}
                        className="flex-1 hover:bg-primary/10"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Review
                      </Button>
                      {report.reviewStatus === 'self_submitted' && (
                        <Button
                          size="sm"
                          onClick={() => handleViewReview(report)}
                          className="flex-1 bg-gradient-to-r from-primary to-primary/80"
                        >
                          <Star className="h-4 w-4 mr-2" />
                          Rate
                        </Button>
                      )}
                      {report.reviewStatus === 'clarification_requested' && (
                        <Button
                          size="sm"
                          onClick={() => handleViewReview(report)}
                          className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Review & Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
      ) : (
        /* Inline Review Workspace - Same design as EmployeeSelfAssessment */
        <div className="space-y-6">
          {loading ? (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardContent className="p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading review data...</p>
              </CardContent>
            </Card>
          ) : (
          <ReviewWorkspaceInline
            employee={selectedEmployee}
            employeeSelfReview={employeeSelfReview}
            goalReviews={goalReviews}
            setGoalReviews={setGoalReviews}
            competencyReviews={competencyReviews}
            setCompetencyReviews={setCompetencyReviews}
            finalRating={finalRating}
            setFinalRating={setFinalRating}
            onRequestClarification={handleRequestClarification}
            onSubmit={handleSubmitReview}
            onSaveDraft={handleSaveDraft}
            onBack={handleCloseReview}
            loading={loading}
            renderRatingStars={renderRatingStars}
            handleRatingChange={handleRatingChange}
            handleCompetencyRatingChange={handleCompetencyRatingChange}
              initialCycleYear={initialCycleYear}
              reviewCycleYear={reviewCycleYear}
              reviewEmployeeId={reviewEmployeeId}
              employees={employees}
              hasReviewData={!!(employeeSelfReview || goalReviews.length > 0)}
              isClarificationRequested={isClarificationRequested}
              rejectionReason={rejectionReason}
              isClarificationResponded={isClarificationResponded}
              clarificationRequests={clarificationRequests}
          />
          )}
        </div>
      )}

      {/* Clarification Request Modal */}
      <ClarificationRequestModal
        open={showClarificationModal}
        onOpenChange={setShowClarificationModal}
        employee={selectedEmployee}
        requests={clarificationRequests}
        setRequests={setClarificationRequests}
        employeeSelfReview={employeeSelfReview}
        employeeId={reviewEmployeeId}
        cycleYear={reviewCycleYear}
        employeeSelfReviewId={employeeSelfReviewId}
        onClarificationSent={async () => {
          // Refresh the employee review to show updated status
          if (selectedEmployee && reviewCycleYear) {
            await fetchEmployeeReview(selectedEmployee.id, reviewCycleYear);
          }
        }}
      />
    </div>
  );
}

// Review Workspace Inline Component - Same design as EmployeeSelfAssessment
type ReviewSection = 'employee-details' | 'self-review' | 'goals' | 'competencies' | 'final-rating';

interface ReviewWorkspaceInlineProps {
  employee: DirectReport;
  employeeSelfReview: EmployeeSelfReview | null;
  goalReviews: GoalReview[];
  setGoalReviews: Dispatch<SetStateAction<GoalReview[]>>;
  competencyReviews: CompetencyReview[];
  setCompetencyReviews: Dispatch<SetStateAction<CompetencyReview[]>>;
  finalRating: ManagerFinalRating;
  setFinalRating: Dispatch<SetStateAction<ManagerFinalRating>>;
  onRequestClarification: () => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onBack: () => void;
  loading: boolean;
  renderRatingStars: (value: number | undefined, onChange: (value: number) => void, disabled?: boolean) => JSX.Element;
  handleRatingChange: (goalId: string, rating: number) => void;
  handleCompetencyRatingChange: (competencyId: string, rating: number) => void;
  initialCycleYear?: string | null;
  reviewCycleYear?: string | null;
  reviewEmployeeId?: string | null;
  employees?: any[];
  hasReviewData?: boolean;
  isClarificationRequested?: boolean;
  rejectionReason?: string | null;
  isClarificationResponded?: boolean;
  clarificationRequests?: ClarificationRequest[];
}

function ReviewWorkspaceInline({
  employee,
  employeeSelfReview,
  goalReviews,
  setGoalReviews,
  competencyReviews,
  setCompetencyReviews,
  finalRating,
  setFinalRating,
  onRequestClarification,
  onSubmit,
  onSaveDraft,
  onBack,
  loading,
  renderRatingStars,
  handleRatingChange,
  handleCompetencyRatingChange,
  initialCycleYear,
  reviewCycleYear,
  reviewEmployeeId,
  employees = [],
  hasReviewData = false,
  isClarificationRequested = false,
  rejectionReason = null,
  isClarificationResponded = false,
  clarificationRequests = []
}: ReviewWorkspaceInlineProps) {
  // Find the full employee object from employees list to get employeeId
  const fullEmployee = employees.find(emp => emp.id === employee.id);
  const employeeIdFromTable = fullEmployee?.employeeId || '';
  const [activeSection, setActiveSection] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const { preserveScroll } = usePreserveScroll();
  
  // Calculate dynamic descriptions based on actual data
  const getSelfReviewDescription = () => {
    if (!employeeSelfReview) {
      return 'Share your accomplishments and growth';
    }
    // Count only the 5 fields that are actually displayed in the UI
    const filledFields = [
      employeeSelfReview.keyAccomplishments?.trim().length > 0,
      employeeSelfReview.beyondResponsibilities?.trim().length > 0,
      employeeSelfReview.challenges?.trim().length > 0,
      employeeSelfReview.areasToImprove?.trim().length > 0,
      employeeSelfReview.trainingsCompleted?.trim().length > 0
    ].filter(Boolean).length;
    
    return filledFields > 0 
      ? `${filledFields}/5 responses completed`
      : 'Share your accomplishments and growth';
  };

  const sections = [
    { id: 'employee-details', label: 'Employee & Goals Overview', description: `${employee.position} • ${employee.department}`, icon: User },
    { id: 'self-review', label: 'Self Review', description: getSelfReviewDescription(), icon: FileText },
    { id: 'goals', label: 'Goals Review', description: 'Rate and comment on employee goals', icon: Target },
    { id: 'final-rating', label: 'Final Rating', description: 'Rate yourself and sign the form', icon: Star }
  ];

  const handleSaveDraftClick = async () => {
    console.log('Save Draft button clicked');
    console.log('onSaveDraft function exists:', typeof onSaveDraft === 'function');
    console.log('saving state:', saving);
    console.log('loading state:', loading);
    
    if (!onSaveDraft) {
      console.error('onSaveDraft is not defined!');
      return;
    }
    
    if (saving || loading) {
      console.warn('Button is disabled, saving:', saving, 'loading:', loading);
      return;
    }
    
    setSaving(true);
    try {
      console.log('Calling onSaveDraft...');
      await onSaveDraft();
      console.log('onSaveDraft completed');
    } catch (error) {
      console.error('Error in handleSaveDraftClick:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddEvidenceLink = () => {
    const link = prompt("Enter Google Drive link:");
    if (link) {
      setFinalRating(prev => ({
        ...prev,
        evidenceLinks: [...prev.evidenceLinks, link]
      }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setFinalRating(prev => ({
        ...prev,
        evidenceFiles: [...prev.evidenceFiles, ...Array.from(files)]
      }));
    }
  };

  const goToSection = (index: number) => {
    setActiveSection(index);
    preserveScroll();
  };

  const goToNext = () => {
    if (activeSection < sections.length - 1) {
      goToSection(activeSection + 1);
    }
  };

  const goToPrevious = () => {
    if (activeSection > 0) {
      goToSection(activeSection - 1);
    }
  };

  // Check if section is completed - same pattern as EmployeeSelfAssessment
  const checkSectionCompletion = (sectionIndex: number): boolean => {
    switch (sectionIndex) {
      case 0: // Employee & Goals Overview
        // Always completed if employee data exists
        return !!employee;
      case 1: // Self Review
        // Completed if self-review exists and has data
        // Only check the 5 fields that are actually displayed in the UI:
        // 1. Most Significant Accomplishments (keyAccomplishments)
        // 2. Contributions Beyond Role (beyondResponsibilities)
        // 3. Challenges + Solutions (challenges)
        // 4. Areas Needing Improvement (areasToImprove)
        // 5. Certifications/Trainings Completed Last Year (trainingsCompleted)
        // Note: Tools & Technologies is shown in this section but is a separate section in navigation
        if (!employeeSelfReview) return false;
        
        // Count how many of the 5 fields are filled
        const filledFields = [
          employeeSelfReview.keyAccomplishments?.trim().length > 0,
          employeeSelfReview.beyondResponsibilities?.trim().length > 0,
          employeeSelfReview.challenges?.trim().length > 0,
          employeeSelfReview.areasToImprove?.trim().length > 0,
          employeeSelfReview.trainingsCompleted?.trim().length > 0
        ].filter(Boolean).length;
        
        // Section is completed if at least one field is filled (or all 5 for full completion)
        return filledFields > 0;
      case 2: // Goals Review
        // Completed if goal reviews exist and at least one has a manager rating or manager comments
        if (goalReviews.length === 0) return false;
        return goalReviews.some(goal => 
          (goal.managerRating !== undefined && goal.managerRating > 0) ||
          (goal.managerComments && goal.managerComments.trim().length > 0)
        );
      case 3: // Final Rating
        // Completed if final rating has been set (rating is required)
        return !!(finalRating.overallRating && finalRating.overallRating > 0);
      default:
        return false;
    }
  };

  // Update completed sections - same pattern as EmployeeSelfAssessment
  useEffect(() => {
    const newCompleted = new Set<number>();
    // Check all 4 sections (0-3)
    for (let index = 0; index < 4; index++) {
      if (checkSectionCompletion(index)) {
        newCompleted.add(index);
      }
    }
    setCompletedSections(newCompleted);
  }, [employee, employeeSelfReview, goalReviews, finalRating.overallRating]);

  const getStepCardClasses = (index: number) => {
    const isCompleted = completedSections.has(index);
    const isActive = activeSection === index;
    
    if (isCompleted && !isActive) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    }
    if (isActive) {
      return 'border-primary/60 bg-primary/5 shadow-lg text-primary';
    }
    return 'border-border/60 bg-muted/20 text-muted-foreground';
  };

  const getStepBadgeClasses = (index: number) => {
    const isCompleted = completedSections.has(index);
    const isActive = activeSection === index;
    
    if (isCompleted && !isActive) {
      return 'bg-emerald-500 text-white';
    }
    if (isActive) {
      return 'bg-primary text-primary-foreground';
    }
    return 'bg-background border border-border/50 text-muted-foreground';
  };

  // Show message if no review data is found
  if (!hasReviewData && !loading) {
  return (
    <div className="space-y-6">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-12 text-center">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <FileText className="h-12 w-12 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Review Submitted</h3>
            <p className="text-muted-foreground mb-4">
              The employee has not yet submitted their review for this cycle.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Rejection Reason Banner - Modern Glossy Compact (HR Rejection) */}
      {rejectionReason && (
        <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-amber-500/5 backdrop-blur-md border border-amber-500/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/20">
          {/* Glossy overlay effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-amber-500/5 pointer-events-none"></div>
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(245,158,11,0.4),transparent_60%)]"></div>
          </div>
          
          <CardContent className="p-3 relative z-10">
            <div className="flex items-start gap-2.5">
              {/* Compact Glossy Icon */}
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-500/20 shadow-sm border border-amber-500/30 flex-shrink-0 backdrop-blur-sm">
                <AlertCircle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
              </div>
              
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Header with Badge - Ultra Compact */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-bold text-amber-900 dark:text-amber-100 flex items-center gap-1">
                    Action Required: HR Changes Requested
                  </h3>
                  <Badge className="bg-gradient-to-r from-amber-600 to-amber-700 text-white border-0 shadow-sm text-[10px] px-1.5 py-0 h-4">
                    Needs Clarification
                  </Badge>
                </div>
                
                {/* HR Feedback Box - Compact Inline */}
                <div className="bg-gradient-to-br from-amber-50/80 dark:from-amber-950/40 to-background/60 rounded-md p-2 border border-amber-500/30 shadow-sm">
                  <div className="flex items-center gap-1 mb-1">
                    <MessageSquare className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-tight">
                      HR Feedback
                    </p>
                  </div>
                  <p className="text-[11px] font-medium text-foreground leading-snug whitespace-pre-wrap">
                    {rejectionReason}
                  </p>
                </div>
                
                {/* Action Hint - Ultra Compact */}
                <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                  <Edit className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-medium">Edit sections below, then click "Send to HR" to resubmit.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager's Clarification Request Banner - Modern Glossy Compact */}
      {/* Show this banner independently - can appear alongside HR rejection banner */}
      {clarificationRequests.length > 0 && !isClarificationResponded && (
        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-blue-500/5 backdrop-blur-md border border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/20">
          {/* Glossy overlay effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-blue-500/5 pointer-events-none"></div>
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.4),transparent_60%)]"></div>
          </div>
          
          <CardContent className="p-3 relative z-10">
            <div className="flex items-start gap-2.5">
              {/* Compact Glossy Icon */}
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/30 to-blue-500/20 shadow-sm border border-blue-500/30 flex-shrink-0 backdrop-blur-sm">
                <HelpCircle className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
              </div>
              
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Header with Badge - Ultra Compact */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-bold text-blue-900 dark:text-blue-100 flex items-center gap-1">
                    Clarification Request Sent
                  </h3>
                  <Badge className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0 shadow-sm text-[10px] px-1.5 py-0 h-4">
                    Awaiting Response
                  </Badge>
                </div>
                
                {/* Clarification Details Box - Compact Inline */}
                {clarificationRequests.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-50/80 dark:from-blue-950/40 to-background/60 rounded-md p-2 border border-blue-500/30 shadow-sm space-y-1.5">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5 text-blue-700 dark:text-blue-400 flex-shrink-0" />
                      <p className="text-[10px] font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-tight">
                        Your Request
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-foreground mb-0.5">Fields:</p>
                      <ul className="text-[11px] text-foreground space-y-0.5 list-disc list-inside leading-tight">
                        {clarificationRequests.map((req, idx) => (
                          <li key={req.id || idx} className="leading-tight">{req.field}</li>
                        ))}
                      </ul>
                    </div>
                    {clarificationRequests[0]?.question && (
                      <div className="pt-1 border-t border-blue-500/20">
                        <p className="text-[10px] font-semibold text-foreground mb-0.5">Question:</p>
                        <p className="text-[11px] text-foreground leading-snug whitespace-pre-wrap">
                          {clarificationRequests[0].question}
                        </p>
                      </div>
                    )}
                    {clarificationRequests[0]?.requestedAt && (
                      <div className="pt-1 border-t border-blue-500/20">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(clarificationRequests[0].requestedAt).toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee Response Notification Banner - Modern Glossy Compact */}
      {isClarificationResponded && (
        <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 backdrop-blur-md border border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20">
          {/* Glossy overlay effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-emerald-500/5 pointer-events-none"></div>
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.4),transparent_60%)]"></div>
          </div>
          
          <CardContent className="p-3 relative z-10">
            <div className="flex items-start gap-2.5">
              {/* Compact Glossy Icon */}
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/30 to-emerald-500/20 shadow-sm border border-emerald-500/30 flex-shrink-0 backdrop-blur-sm">
                <Bell className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
              </div>
              
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* Header with Badge - Ultra Compact */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Employee Has Responded
                  </h3>
                  <Badge className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border-0 shadow-sm text-[10px] px-1.5 py-0 h-4 animate-pulse">
                    Response Received
                  </Badge>
                </div>
                
                {/* Instruction Text - Compact */}
                <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200 leading-snug">
                  ✅ Employee updated their self-review. Review changes below.
                </p>
                
                {/* Show original request details - Compact */}
                {clarificationRequests.length > 0 && (
                  <div className="bg-gradient-to-br from-emerald-50/80 dark:from-emerald-950/40 to-background/60 rounded-md p-2 border border-emerald-500/30 shadow-sm space-y-1.5">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-400 flex-shrink-0" />
                      <p className="text-[10px] font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-tight">
                        Your Original Request
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-foreground mb-0.5">Fields:</p>
                      <ul className="text-[11px] text-foreground space-y-0.5 list-disc list-inside leading-tight">
                        {clarificationRequests.map((req, idx) => (
                          <li key={req.id || idx} className="leading-tight">{req.field}</li>
                        ))}
                      </ul>
                    </div>
                    {clarificationRequests[0]?.question && (
                      <div className="pt-1 border-t border-emerald-500/20">
                        <p className="text-[10px] font-semibold text-foreground mb-0.5">Question:</p>
                        <p className="text-[11px] text-foreground leading-snug whitespace-pre-wrap">
                          {clarificationRequests[0].question}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3 space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                "rounded-2xl border p-4 flex items-start justify-between gap-3 transition-all cursor-pointer",
                getStepCardClasses(index)
              )}
              onClick={() => goToSection(index)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    getStepBadgeClasses(index)
                  )}
                >
                  {completedSections.has(index) && activeSection !== index ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <div>
                  <p className="font-semibold text-foreground/90">{section.label}</p>
                  {section.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 space-y-8">

          {/* Employee Details Section */}
          {activeSection === 0 && (
            <>
            <div className="transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    Goals Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-5">
                    <div className="rounded-2xl border border-border/40 bg-background/40 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Employee Name</Label>
                        <p className="font-medium">{employee.name}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Employee ID</Label>
                        <p className="font-medium">{employeeIdFromTable || employee.id}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Position</Label>
                        <p className="font-medium">{employee.position}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Department</Label>
                        <p className="font-medium">{employee.department}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Reporting Manager</Label>
                        <p className="font-medium">You</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Review Period</Label>
                        <p className="font-medium">
                          {reviewCycleYear 
                            ? `${reviewCycleYear} Annual Performance Review` 
                            : initialCycleYear 
                            ? `${initialCycleYear} Annual Performance Review` 
                            : employee.cycleName || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={goToPrevious} className="h-10" disabled={activeSection === 0}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
                Next: Self Review
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            </>
          )}

          {/* Self Review Section */}
          {activeSection === 1 && (
            <>
            <div className="transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              {employeeSelfReview ? (
                <div className="space-y-4">
                  <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        Self-Review
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          1. Most Significant Accomplishments
                        </Label>
                        <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                          {employeeSelfReview.keyAccomplishments || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          2. Contributions Beyond Role
                        </Label>
                        <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                          {employeeSelfReview.beyondResponsibilities || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          3. Challenges + Solutions (with examples)
                        </Label>
                        <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                          {employeeSelfReview.challenges || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          4. Areas Needing Improvement
                        </Label>
                        <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                          {employeeSelfReview.areasToImprove || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          5. Certifications/Trainings Completed Last Year
                        </Label>
                        <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                          {employeeSelfReview.trainingsCompleted || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                          Tools & Technologies
                        </Label>
                        <div className="border border-border/50 rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead>Test Type</TableHead>
                                <TableHead>Tool</TableHead>
                                <TableHead>Rating (1-3)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {employeeSelfReview.toolsAndTechnologies.map((tool, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{tool.testType}</TableCell>
                                  <TableCell>{tool.tool}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {[1, 2, 3].map((rating) => (
                                        <Star
                                          key={rating}
                                          className={cn(
                                            "h-4 w-4",
                                            rating <= tool.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                                          )}
                                        />
                                      ))}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="p-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Self-review not yet submitted</p>
                  </CardContent>
                </Card>
              )}
              </div>
              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={goToPrevious} className="h-10">
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
                  Next: Goals Review
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {/* Goals Review Section */}
          {activeSection === 2 && (
            <>
            <div className="transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    Goals Review
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Rate each goal from the Appraisal Form (5 = Outstanding, 1 = Needs Improvement)
                  </CardDescription>
                </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-xl border border-border/40 bg-background/40 overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 border-b border-border/50">
                          <TableHead className="font-semibold text-foreground/90">Goal Description</TableHead>
                          <TableHead className="font-semibold text-foreground/90">
                            <div className="flex flex-col gap-1">
                              <span>Weightage</span>
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-foreground/90">Manager Rating</TableHead>
                          <TableHead className="font-semibold text-foreground/90 min-w-[300px]">Comments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {goalReviews.map((goal) => (
                          <TableRow key={goal.goalId} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <TableCell className="max-w-md py-4">
                              <p className="text-sm font-medium text-foreground leading-relaxed">{goal.goalDescription}</p>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col gap-2">
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-semibold w-fit">
                                  {goal.weightage}%
                                </Badge>
                                {goal.completion !== undefined && (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 font-semibold w-fit">
                                    Completed: {Math.round(goal.completion)}%
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              {renderRatingStars(goal.managerRating, (rating) => handleRatingChange(goal.goalId, rating))}
                            </TableCell>
                            <TableCell className="py-4">
                              <Textarea
                                id={`goal-comment-${goal.goalId}`}
                                name={`goal-comment-${goal.goalId}`}
                                value={goal.managerComments || ''}
                                onChange={(e) => {
                                  setGoalReviews(prev => prev.map(g => 
                                    g.goalId === goal.goalId ? { ...g, managerComments: e.target.value } : g
                                  ));
                                }}
                                placeholder="Add your comments and feedback here..."
                                className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all text-sm resize-y"
                                rows={4}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={goToPrevious} className="h-10">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
                Next: Final Rating
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            </>
          )}

          {/* Final Rating Section */}
          {activeSection === 3 && (
            <>
            <div className="transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                      <Star className="h-4 w-4 text-primary" />
                    </div>
                    Final Rating
                  </CardTitle>
                </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold mb-3 block">
                    Overall Manager Rating
                  </Label>
                  {renderRatingStars(finalRating.overallRating, (rating) => 
                    setFinalRating(prev => ({ ...prev, overallRating: rating }))
                  )}
                </div>

                <div>
                  <Label htmlFor="summary" className="text-sm font-semibold mb-2 block">
                    Summary Feedback
                  </Label>
                  <Textarea
                    id="summary"
                    value={finalRating.summaryFeedback}
                    onChange={(e) => setFinalRating(prev => ({ ...prev, summaryFeedback: e.target.value }))}
                    placeholder="Provide overall summary feedback..."
                    className="min-h-[120px] bg-background/50"
                  />
                </div>

                <div>
                  <Label htmlFor="recommendations" className="text-sm font-semibold mb-2 block">
                    Development Recommendations
                  </Label>
                  <Textarea
                    id="recommendations"
                    value={finalRating.developmentRecommendations}
                    onChange={(e) => setFinalRating(prev => ({ ...prev, developmentRecommendations: e.target.value }))}
                    placeholder="Provide development recommendations..."
                    className="min-h-[120px] bg-background/50"
                  />
                </div>

                <div>
                  <Label htmlFor="dev-need" className="text-sm font-semibold mb-2 block">
                    Development Need
                  </Label>
                  <Textarea
                    id="dev-need"
                    value={finalRating.developmentNeed}
                    onChange={(e) => setFinalRating(prev => ({ ...prev, developmentNeed: e.target.value }))}
                    placeholder="Describe development needs..."
                    className="min-h-[100px] bg-background/50"
                  />
                </div>

                <div>
                  <Label htmlFor="action-plan" className="text-sm font-semibold mb-2 block">
                    Action Plan
                  </Label>
                  <Textarea
                    id="action-plan"
                    value={finalRating.actionPlan}
                    onChange={(e) => setFinalRating(prev => ({ ...prev, actionPlan: e.target.value }))}
                    placeholder="Describe the action plan..."
                    className="min-h-[100px] bg-background/50"
                  />
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Evidence Attachments
                  </Label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddEvidenceLink}
                        className="hover:bg-primary/10"
                      >
                        <LinkIcon className="h-4 w-4 mr-2" />
                        Add G-Drive Link
                      </Button>
                      <label>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="hover:bg-primary/10"
                        >
                          <span>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Files
                          </span>
                        </Button>
                      </label>
                    </div>

                    {finalRating.evidenceLinks.length > 0 && (
                      <div className="space-y-2">
                        {finalRating.evidenceLinks.map((link, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border/50">
                            <LinkIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1 truncate">{link}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFinalRating(prev => ({
                                  ...prev,
                                  evidenceLinks: prev.evidenceLinks.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {finalRating.evidenceFiles.length > 0 && (
                      <div className="space-y-2">
                        {finalRating.evidenceFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border/50">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1 truncate">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFinalRating(prev => ({
                                  ...prev,
                                  evidenceFiles: prev.evidenceFiles.filter((_, i) => i !== idx)
                                }));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            <div className="flex justify-between mt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onRequestClarification}
                  className="h-10 hover:bg-amber-500/10 hover:text-amber-600"
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Request Clarification
                </Button>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Send to HR button clicked');
                    console.log('onSubmit function:', onSubmit);
                    if (onSubmit) {
                      onSubmit();
                    } else {
                      console.error('onSubmit is not defined!');
                    }
                  }}
                  disabled={loading}
                  className="bg-gradient-to-r from-primary to-primary/80 h-10"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send to HR
                </Button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Clarification Request Modal Component
interface ClarificationRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: DirectReport | null;
  requests: ClarificationRequest[];
  setRequests: (requests: ClarificationRequest[]) => void;
  employeeSelfReview: EmployeeSelfReview | null;
  employeeId: string | null;
  cycleYear: string | null;
  employeeSelfReviewId: string | null; // The reviewId of the self-review to update
  onClarificationSent?: () => void; // Callback after clarification is sent
}

function ClarificationRequestModal({
  open,
  onOpenChange,
  employee,
  requests,
  setRequests,
  employeeSelfReview,
  employeeId,
  cycleYear,
  employeeSelfReviewId,
  onClarificationSent
}: ClarificationRequestModalProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [isFieldDropdownOpen, setIsFieldDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Show all Self-Review fields that match the actual UI labels
  const availableFields = useMemo(() => {
    // Match the exact field labels from the Self-Review UI section
    return [
      { value: 'Most Significant Accomplishments', label: '1. Most Significant Accomplishments' },
      { value: 'Contributions Beyond Role', label: '2. Contributions Beyond Role' },
      { value: 'Challenges + Solutions (with examples)', label: '3. Challenges + Solutions (with examples)' },
      { value: 'Areas Needing Improvement', label: '4. Areas Needing Improvement' },
      { value: 'Certifications/Trainings Completed Last Year', label: '5. Certifications/Trainings Completed Last Year' },
      { value: 'Tools & Technologies', label: '6. Tools & Technologies' }
    ];
  }, []);

  const handleFieldToggle = (fieldValue: string) => {
    setSelectedFields(prev => {
      if (prev.includes(fieldValue)) {
        return prev.filter(f => f !== fieldValue);
      } else {
        return [...prev, fieldValue];
      }
    });
  };

  const handleSubmit = async () => {
    if (selectedFields.length === 0 || !question.trim()) {
      toast({
        title: "Required Fields",
        description: "Please select at least one field and enter your question",
        variant: "destructive"
      });
      return;
    }

    if (!employeeId || !cycleYear) {
      toast({
        title: "Error",
        description: "Missing employee or cycle information. Please try again.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);

      let review;
      let reviewId = employeeSelfReviewId;

      // If we don't have a review ID, try to fetch the self-review
      if (!reviewId) {
        console.log('No review ID found, fetching self-review...', { employeeId, cycleYear });
        const fetchResponse = await authenticatedFetch(
          `${API_BASE_URL}/reviews?employeeId=${employeeId}&cycleYear=${cycleYear}&reviewType=self`,
          { method: 'GET' }
        );

        if (fetchResponse.ok) {
          const reviews = await fetchResponse.json();
          console.log('Fetched reviews for clarification request:', reviews);
          if (Array.isArray(reviews) && reviews.length > 0) {
            // Prefer submitted review over draft
            const submittedReview = reviews.find((r: any) => !r.isDraft && r.submittedAt);
            const draftReview = reviews.find((r: any) => r.isDraft);
            const foundReview = submittedReview || draftReview || reviews[0];
            reviewId = foundReview.reviewId;
            review = foundReview;
            console.log('Found self-review:', reviewId, foundReview);
          } else {
            console.log('No self-reviews found in response');
          }
        } else {
          console.error('Failed to fetch self-reviews:', await fetchResponse.text());
        }
      }

      // If still no review, we need to create one or show a better error
      if (!reviewId) {
        toast({
          title: "No Self-Review Found",
          description: "The employee has not yet started their self-review. Please ask them to begin their assessment first.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Fetch the review if we don't have it yet
      if (!review) {
        const reviewResponse = await authenticatedFetch(
          `${API_BASE_URL}/reviews/${reviewId}`,
          { method: 'GET' }
        );

        if (!reviewResponse.ok) {
          throw new Error('Failed to fetch self-review');
        }

        review = await reviewResponse.json();
      }

      // Create clarification requests for each selected field
      const newClarificationRequests = selectedFields.map(field => ({
        id: `${Date.now()}-${field}`,
        field: field,
      question: question.trim(),
        status: 'pending' as const,
        requestedAt: new Date().toISOString(),
        requestedBy: user?.email || 'unknown'
      }));

      // Update review with clarification requests
      const existingClarificationRequests = review.metadata?.clarificationRequests || [];
      const updatedClarificationRequests = [...existingClarificationRequests, ...newClarificationRequests];

      const updatedReview = {
        ...review,
        metadata: {
          ...review.metadata,
          status: 'clarification_requested',
          clarificationRequests: updatedClarificationRequests,
          managerClarificationRequestedAt: new Date().toISOString(),
          managerClarificationFields: selectedFields,
          managerClarificationQuestion: question.trim()
        }
      };

      // Update the self-review via API
      const updateResponse = await authenticatedFetch(
        `${API_BASE_URL}/reviews/${reviewId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedReview)
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(errorText || 'Failed to send clarification request');
      }

      // Update local state
      setRequests([...requests, ...newClarificationRequests]);
      
    toast({
      title: "Clarification Requested",
        description: `Clarification requested for ${selectedFields.length} field(s). The employee will be notified.`
    });

      setSelectedFields([]);
    setQuestion('');
    onOpenChange(false);

      // Call callback to refresh data
      if (onClarificationSent) {
        await onClarificationSent();
      }
    } catch (error) {
      console.error('Error sending clarification request:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send clarification request",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>Request Clarification from {employee?.name}</DialogTitle>
          <DialogDescription>
            Select one or more fields you need clarification on and ask your question
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="field">Select Field(s) *</Label>
            <Popover open={isFieldDropdownOpen} onOpenChange={setIsFieldDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between mt-1 bg-background/50 h-10"
                >
                  <span className="truncate text-left font-normal">
                    {selectedFields.length === 0
                      ? "Select field(s)"
                      : selectedFields.length === 1
                      ? availableFields.find(f => f.value === selectedFields[0])?.label || "1 field selected"
                      : `${selectedFields.length} fields selected`}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="max-h-60 overflow-auto p-2">
                  {availableFields.map((field) => {
                    const isSelected = selectedFields.includes(field.value);
                    return (
                      <div
                        key={field.value}
                        className="flex items-center space-x-2 p-2 rounded-sm hover:bg-accent cursor-pointer"
                        onClick={() => handleFieldToggle(field.value)}
                      >
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border border-primary ring-offset-background",
                          isSelected && "bg-primary text-primary-foreground"
                        )}>
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <label className="text-sm font-medium leading-none cursor-pointer flex-1">
                          {field.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {selectedFields.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedFields.map((fieldValue) => {
                  const field = availableFields.find(f => f.value === fieldValue);
                  return (
                    <Badge key={fieldValue} variant="secondary" className="text-xs">
                      {field?.label}
                      <button
                        type="button"
                        onClick={() => handleFieldToggle(fieldValue)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="question">Your Question *</Label>
            <Textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter your clarification question..."
              className="mt-1 min-h-[100px] bg-background/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-gradient-to-r from-primary to-primary/80">
            <Send className="h-4 w-4 mr-2" />
            Send Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



