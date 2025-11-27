import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Target,
  Award,
  TrendingUp,
  Upload,
  X,
  Star,
  Calendar,
  Briefcase,
  UserCheck,
  HelpCircle,
  RefreshCw,
  Download,
  Edit,
  Eye,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Link as LinkIcon,
  CircleCheckBig,
  MessageSquare
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useEmployees } from "@/hooks/use-employees";
import { useGoals } from "@/hooks/use-goals";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";

// Types
interface ReviewCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'not_started' | 'draft' | 'submitted' | 'under_manager_review' | 'finalized';
  submittedAt?: string;
  managerReviewStartedAt?: string;
  finalizedAt?: string;
}

interface EmployeeInfo {
  name: string;
  id: string;
  employeeId?: string;
  position: string;
  department: string;
  managerName: string;
  managerId: string;
}

interface GoalAssessment {
  goalId: string;
  goalDescription: string;
  weightage: number;
  status: string;
  completion: number;
  category: string;
  targetDate: string;
  milestones?: any[];
  employeeRating?: number; // 5-1
  comments: string;
  evidenceFiles: File[];
  evidenceLinks: string[];
}


interface SelfReviewFields {
  significantAccomplishments: string;
  beyondRoleContributions: string;
  challengesAndSolutions: string;
  areasNeedingImprovement: string;
  newSkillsAcquired: string;
  certificationsCompleted: string;
  certificationsPlanned: string;
}

interface ToolsAndTechnology {
  testType: string;
  tool: string;
  rating: number; // 1-3
}

interface DevelopmentPlan {
  developmentNeed: string;
  actionPlan: string;
  timeline: string;
}

interface ClarificationRequest {
  id: string;
  field: string;
  question: string;
  employeeResponse?: string;
  status: 'pending' | 'responded';
}


interface EmployeeSelfAssessmentProps {
  initialSection?: 'home' | 'form';
  onSectionChange?: (section: 'home' | 'form') => void;
  onRegisterSaveDraft?: (handler: (() => void) | null) => void;
  onSavingStateChange?: (isSaving: boolean) => void;
  onReadOnlyChange?: (readOnly: boolean) => void;
}

export function EmployeeSelfAssessment(props: EmployeeSelfAssessmentProps = {}) {
  const { initialSection = 'home', onSectionChange, onRegisterSaveDraft, onSavingStateChange, onReadOnlyChange } = props;
  const { user } = useAuth();
  const { employees, isLoading: employeesLoading } = useEmployees();
  const { getEmployeeGoals } = useGoals();
  const { toast } = useToast();
  const { preserveScroll } = usePreserveScroll();
  
  const [reviewCycle, setReviewCycle] = useState<ReviewCycle | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'home' | 'form'>(initialSection);
  
  // Update activeSection when initialSection prop changes
  useEffect(() => {
    if (initialSection && initialSection !== activeSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection, activeSection]);
  
  // Notify parent of section changes
  useEffect(() => {
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);
  
  // Form data
  const [goalAssessments, setGoalAssessments] = useState<GoalAssessment[]>([]);
  const [selfReviewFields, setSelfReviewFields] = useState<SelfReviewFields>({
    significantAccomplishments: '',
    beyondRoleContributions: '',
    challengesAndSolutions: '',
    areasNeedingImprovement: '',
    newSkillsAcquired: '',
    certificationsCompleted: '',
    certificationsPlanned: ''
  });
  const [toolsAndTechnologies, setToolsAndTechnologies] = useState<ToolsAndTechnology[]>([]);
  const [developmentPlan, setDevelopmentPlan] = useState<DevelopmentPlan>({
    developmentNeed: '',
    actionPlan: '',
    timeline: ''
  });
  const [signature, setSignature] = useState('');
  const [selfRating, setSelfRating] = useState<number | undefined>(undefined);
  const [clarificationRequests, setClarificationRequests] = useState<ClarificationRequest[]>([]);
  const [evidenceLinks, setEvidenceLinks] = useState<string[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  
  // Notify parent about read-only status
  useEffect(() => {
    if (onReadOnlyChange && reviewCycle) {
      // Check if there are pending clarification requests (user can edit to respond)
      const hasPendingClarification = clarificationRequests.some(req => req.status === 'pending');
      // Review is read-only if submitted/finalized AND no pending clarification requests
      const isReadOnly = 
        (reviewCycle.status === 'submitted' || reviewCycle.status === 'under_manager_review' || reviewCycle.status === 'finalized') &&
        !hasPendingClarification;
      console.log('Read-only status check', {
        reviewCycleStatus: reviewCycle.status,
        hasPendingClarification,
        clarificationRequestsCount: clarificationRequests.length,
        isReadOnly
      });
      onReadOnlyChange(isReadOnly);
    }
  }, [reviewCycle?.status, clarificationRequests, onReadOnlyChange]);
  
  const lastSavedRef = useRef<Date | null>(null);
  const saveDraftFnRef = useRef<(showToast?: boolean) => Promise<void>>(async () => {});
  const saveDraftInFlightRef = useRef(false);
  const pendingCycleYearRef = useRef<string | null>(null);
  const goalsInitializedRef = useRef(false);
  const draftLoadedRef = useRef(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);

  // Fetch review cycle and employee info
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.email) return;
      
      try {
        setLoading(true);
        // Find current user's employee record
        const currentUser = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
        if (!currentUser) return;

        // Find manager
        const manager = employees.find(emp => emp.id === currentUser.reporting_to);
        
        setEmployeeInfo({
          name: currentUser.name || 'Unknown',
          id: currentUser.id,
          employeeId: currentUser.employeeId || '',
          position: currentUser.position || '',
          department: currentUser.department || '',
          managerName: manager?.name || 'Unknown',
          managerId: manager?.id || ''
        });

        // Fetch active review cycle from API
        try {
          const cyclesResponse = await authenticatedFetch(`${API_BASE_URL}/reviews/cycles`, {
            method: 'GET'
          });
          
          if (cyclesResponse.ok) {
            const cycles = await cyclesResponse.json();
            // Filter out draft cycles - draft cycles should not be visible to anyone in performance module
            const filteredCycles = cycles.filter((c: any) => c.status !== 'draft');
            
            // Find the active cycle (status === 'open' in backend)
            let selectedCycle = filteredCycles.find((c: any) => c.status === 'open' || c.status === 'active');
            
            if (!selectedCycle && filteredCycles.length > 0) {
              // If no active cycle, use the most recent one (only from filtered cycles)
              selectedCycle = filteredCycles.sort((a: any, b: any) => 
                b.year.localeCompare(a.year)
              )[0];
            }
            
            if (selectedCycle) {
              // Check if user has an existing review for this cycle
              let reviewStatus: 'not_started' | 'draft' | 'submitted' | 'under_manager_review' | 'finalized' = 'not_started';
              const targetCycleYear = selectedCycle.year;
              
              try {
                const reviewsResponse = await authenticatedFetch(
                  `${API_BASE_URL}/reviews?employeeId=${currentUser.id}&cycleYear=${selectedCycle.year}&reviewType=self`,
                  { method: 'GET' }
                );
                
                if (reviewsResponse.ok) {
                  const reviews = await reviewsResponse.json();
                  if (Array.isArray(reviews) && reviews.length > 0) {
                    // Prefer submitted review over draft
                    const submittedReview = reviews.find((r: any) => !r.isDraft && r.submittedAt);
                    const draftReview = reviews.find((r: any) => r.isDraft);
                    const userReview = submittedReview || draftReview || reviews[0];
                    
                    if (userReview.isDraft || !userReview.submittedAt) {
                      reviewStatus = 'draft';
                    } else if (userReview.submittedAt && !userReview.isDraft) {
                      // Review is submitted, check status for more specific state
                      const metadataStatus = userReview.status || userReview.metadata?.status;
                      if (metadataStatus === 'changes_requested' || metadataStatus === 'hr_rejected' || metadataStatus === 'clarification_requested') {
                        reviewStatus = 'under_manager_review'; // Needs clarification/resubmission
                      } else if (metadataStatus === 'self_submitted' || metadataStatus === 'manager_reviewing' || metadataStatus === 'clarification_responded') {
                        reviewStatus = 'under_manager_review';
                      } else if (metadataStatus === 'manager_submitted' || metadataStatus === 'finalized' || metadataStatus === 'hr_approved') {
                        reviewStatus = 'finalized';
                      } else {
                      reviewStatus = 'submitted';
                      }
                    }
                  }
                }
              } catch (reviewError) {
                console.error('Error checking for existing review:', reviewError);
              }
              
              setReviewCycle({
                id: selectedCycle.cycleId || selectedCycle.year,
                name: selectedCycle.name || `${selectedCycle.year} Annual Performance Review`,
                startDate: selectedCycle.startDate || '',
                endDate: selectedCycle.endDate || '',
                status: reviewStatus
              });
              
              // Defer loadDraft until goal assessments are initialized (below)
              pendingCycleYearRef.current = targetCycleYear;
            }
          }
        } catch (error) {
          console.error('Error fetching review cycles:', error);
          // Don't set review cycle if fetch fails
        }

        // Initialize goal assessments from goals API
        const employeeGoals = await getEmployeeGoals(currentUser.id);
        const initialGoalAssessments: GoalAssessment[] = employeeGoals.map(goal => ({
          goalId: goal.id,
          goalDescription: goal.title + (goal.description ? `: ${goal.description}` : ''),
          weightage: goal.weightage || 0,
          status: goal.status,
          completion: goal.completion,
          category: goal.category,
          targetDate: goal.targetDate,
          milestones: goal.milestones || [],
          comments: '',
          evidenceFiles: [],
          evidenceLinks: []
        }));
        setGoalAssessments(initialGoalAssessments);
        goalsInitializedRef.current = true;

        // Load draft once goals are seeded
        if (pendingCycleYearRef.current) {
          await loadDraft(pendingCycleYearRef.current, initialGoalAssessments);
          pendingCycleYearRef.current = null;
        } else {
          await loadDraft(undefined, initialGoalAssessments);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load review data",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, employees, toast]);


  useEffect(() => {
    onSavingStateChange?.(saving);
  }, [saving, onSavingStateChange]);

  const saveDraft = useCallback(async (showToast: boolean = false) => {
    if (saveDraftInFlightRef.current) {
      console.log('saveDraft skipped - request already in flight');
      return;
    }
    console.log('saveDraft called', { showToast, reviewCycle: !!reviewCycle, employeeInfo: !!employeeInfo, userEmail: !!user?.email });
    if (!reviewCycle || !employeeInfo || !user?.email) {
      console.warn('saveDraft: Missing required data', { reviewCycle: !!reviewCycle, employeeInfo: !!employeeInfo, userEmail: !!user?.email });
      return;
    }
    
    try {
      saveDraftInFlightRef.current = true;
      setSaving(true);
      console.log('Starting saveDraft API call...');
      
      // Extract cycle year from review cycle name or use current year
      const cycleYearMatch = reviewCycle.name?.match(/\d{4}/);
      const cycleYear = cycleYearMatch ? cycleYearMatch[0] : new Date().getFullYear().toString();
      
      // Build goal ratings from goal assessments
      const goalRatings: Record<string, number | null> = {};
      goalAssessments.forEach(goal => {
        goalRatings[goal.goalId] = goal.employeeRating || null;
      });
      
      // Build ratings object
      const ratings: Record<string, any> = {
        overall: selfRating || null,
        goals: goalRatings,
        competencies: {} // Can be populated if needed
      };
      
      // Build comments from self-review fields
      const comments = [
        selfReviewFields.significantAccomplishments && `Most Significant Accomplishments: ${selfReviewFields.significantAccomplishments}`,
        selfReviewFields.beyondRoleContributions && `Beyond Role Contributions: ${selfReviewFields.beyondRoleContributions}`,
        selfReviewFields.challengesAndSolutions && `Challenges and Solutions: ${selfReviewFields.challengesAndSolutions}`,
        selfReviewFields.areasNeedingImprovement && `Areas Needing Improvement: ${selfReviewFields.areasNeedingImprovement}`,
        selfReviewFields.newSkillsAcquired && `New Skills Acquired: ${selfReviewFields.newSkillsAcquired}`,
        selfReviewFields.certificationsCompleted && `Certifications Completed: ${selfReviewFields.certificationsCompleted}`,
        selfReviewFields.certificationsPlanned && `Certifications Planned: ${selfReviewFields.certificationsPlanned}`
      ].filter(Boolean).join('\n\n');
      
      // Extract strengths and improvements
      const strengths: string[] = [];
      const improvements: string[] = [];
      
      if (selfReviewFields.significantAccomplishments) {
        strengths.push(selfReviewFields.significantAccomplishments);
      }
      if (selfReviewFields.beyondRoleContributions) {
        strengths.push(selfReviewFields.beyondRoleContributions);
      }
      if (selfReviewFields.areasNeedingImprovement) {
        improvements.push(selfReviewFields.areasNeedingImprovement);
      }
      
      // Build metadata with all detailed self-review data
      const metadata: Record<string, any> = {
        selfReviewFields,
        toolsAndTechnologies,
        developmentPlan,
        goalAssessments: goalAssessments.map(goal => ({
          goalId: goal.goalId,
          goalDescription: goal.goalDescription,
          weightage: goal.weightage,
          completion: goal.completion,
          employeeRating: goal.employeeRating,
          comments: goal.comments,
          evidenceLinks: goal.evidenceLinks,
          evidenceFiles: goal.evidenceFiles.map(f => ({ name: f.name, size: f.size, type: f.type }))
        })),
        selfRating,
        signature,
        evidenceLinks,
        evidenceFiles: evidenceFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        status: 'self_draft',
        // Preserve clarification requests if they exist
        clarificationRequests: clarificationRequests.length > 0 ? clarificationRequests : undefined
      };
      
      // Build the review payload
      // Note: isDraft is not sent - determined by submittedAt being undefined
      const payload = {
        cycleYear,
        employeeId: employeeInfo.id,
        reviewerId: user.email, // Self-review, so reviewer is the employee
        reviewType: 'self' as const,
        status: 'self_draft',
        goalIds: goalAssessments.map(g => g.goalId),
        ratings,
        comments: comments || undefined,
        strengths,
        improvements,
        attachments: [],
        metadata,
        submittedAt: undefined  // undefined = draft, set timestamp when submitting
      };
      
      // Determine endpoint and method
      const endpoint = activeReviewId
        ? `${API_BASE_URL}/reviews/${activeReviewId}`
        : `${API_BASE_URL}/reviews`;
      const method = activeReviewId ? 'PUT' : 'POST';
      
      console.log('Saving self-review draft:', { endpoint, method, payload });
      
      const response = await authenticatedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to save draft' }));
        const errorMessage = errorData?.detail || errorData?.message || 'Failed to save draft';
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      if (data?.reviewId) {
        setActiveReviewId(data.reviewId);
      }

      lastSavedRef.current = new Date();
      
      console.log('Draft saved successfully:', data);
      
      // Show success toast if manually triggered
      if (showToast) {
        toast({
          title: "Draft Saved",
          description: "Your self-review has been saved as a draft"
        });
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save draft",
        variant: "destructive"
      });
    } finally {
      saveDraftInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    reviewCycle,
    employeeInfo,
    user,
    goalAssessments,
    selfReviewFields,
    toolsAndTechnologies,
    developmentPlan,
    selfRating,
    signature,
    toast,
    activeReviewId
  ]);

  useEffect(() => {
    saveDraftFnRef.current = saveDraft;
  }, [saveDraft]);

  const manualSaveDraft = useCallback(() => saveDraftFnRef.current(true), []);

  useEffect(() => {
    if (!onRegisterSaveDraft) return;

    if (reviewCycle) {
      onRegisterSaveDraft(manualSaveDraft);
      return () => onRegisterSaveDraft(null);
    }

    onRegisterSaveDraft(null);
    return () => {
      onRegisterSaveDraft(null);
    };
  }, [onRegisterSaveDraft, manualSaveDraft, reviewCycle]);

  const loadDraft = async (cycleYearOverride?: string, baseGoalAssessments?: GoalAssessment[]) => {
    if ((!reviewCycle && !cycleYearOverride) || !employeeInfo || !user?.email) return;
    
    try {
      const applyStatusFromManagerReview = async (targetCycleYear: string, existingManagerReview?: any) => {
        try {
          let managerReview = existingManagerReview;
          
          if (!managerReview) {
            const managerResponse = await authenticatedFetch(
              `${API_BASE_URL}/reviews?employeeId=${employeeInfo.id}&cycleYear=${targetCycleYear}&reviewType=manager`,
        { method: 'GET' }
      );
      
            if (!managerResponse.ok) {
              return false;
            }
            
            const managerReviews = await managerResponse.json();
            if (!Array.isArray(managerReviews) || managerReviews.length === 0) {
              return false;
            }
            
            managerReview = managerReviews[0];
          }
          
          const metadataStatus = managerReview.status || managerReview.metadata?.status;
          let inferredStatus: ReviewCycle['status'] = 'under_manager_review';
          
          if (metadataStatus === 'hr_approved' || metadataStatus === 'finalized' || metadataStatus === 'manager_submitted') {
            inferredStatus = 'finalized';
          } else if (metadataStatus === 'self_submitted' || metadataStatus === 'manager_reviewing' || metadataStatus === 'clarification_responded') {
            inferredStatus = 'under_manager_review';
          } else if (metadataStatus === 'changes_requested' || metadataStatus === 'clarification_requested' || metadataStatus === 'hr_rejected') {
            inferredStatus = 'under_manager_review';
          }
          
          setReviewCycle(prev => {
            if (prev) {
              return {
                ...prev,
                status: inferredStatus,
                submittedAt: prev.submittedAt || managerReview.submittedAt || managerReview.updatedAt || prev.submittedAt
              };
            }
            return {
              id: targetCycleYear,
              name: `${targetCycleYear} Annual Performance Review`,
              startDate: '',
              endDate: '',
              status: inferredStatus,
              submittedAt: managerReview.submittedAt || managerReview.updatedAt
            };
          });
          
          console.log('loadDraft: Applied status from manager review', {
            cycleYear: targetCycleYear,
            inferredStatus,
            metadataStatus
          });
          
          return true;
        } catch (statusError) {
          console.error('Error inferring status from manager review:', statusError);
          return false;
        }
      };
      
      const hydrateFromReview = (review: any, cycleForReview: string) => {
        if (!review) return;
        
        draftLoadedRef.current = true;
        
        if (review.reviewId) {
          setActiveReviewId(review.reviewId);
        }
        
        let determinedStatus: 'not_started' | 'draft' | 'submitted' | 'under_manager_review' | 'finalized' = 'not_started';
        if (review.isDraft || !review.submittedAt) {
          determinedStatus = 'draft';
        } else if (review.submittedAt && !review.isDraft) {
          const metadataStatus = review.status || review.metadata?.status;
          if (metadataStatus === 'changes_requested' || metadataStatus === 'hr_rejected' || metadataStatus === 'clarification_requested') {
            determinedStatus = 'under_manager_review';
          } else if (metadataStatus === 'self_submitted' || metadataStatus === 'manager_reviewing' || metadataStatus === 'clarification_responded') {
            determinedStatus = 'under_manager_review';
          } else if (metadataStatus === 'manager_submitted' || metadataStatus === 'finalized' || metadataStatus === 'hr_approved') {
            determinedStatus = 'finalized';
          } else {
            determinedStatus = 'submitted';
          }
        }
        
        let loadedClarificationRequests: ClarificationRequest[] = [];
        if (review.metadata) {
          const meta = review.metadata;
          
          if (meta.clarificationRequests && Array.isArray(meta.clarificationRequests)) {
            loadedClarificationRequests = meta.clarificationRequests;
            setClarificationRequests(meta.clarificationRequests);
          }
          
            if (meta.selfReviewFields) {
              setSelfReviewFields(meta.selfReviewFields);
            }
            
            if (meta.toolsAndTechnologies) {
              setToolsAndTechnologies(meta.toolsAndTechnologies);
            }
            
            if (meta.developmentPlan) {
              setDevelopmentPlan(meta.developmentPlan);
            }
            
            if (meta.selfRating !== undefined) {
              setSelfRating(meta.selfRating);
            }
            
            if (meta.signature) {
              setSignature(meta.signature);
            }
            
            if (meta.evidenceLinks && Array.isArray(meta.evidenceLinks)) {
              setEvidenceLinks(meta.evidenceLinks);
            }
            
            if (meta.evidenceFiles && Array.isArray(meta.evidenceFiles)) {
              // Note: We can't restore File objects from metadata, only display info
              // Files would need to be re-uploaded if editing
              setEvidenceFiles([]);
            }
            
            if (meta.goalAssessments && Array.isArray(meta.goalAssessments)) {
            const mergeGoals = (source: GoalAssessment[]) => {
              return source.map(goal => {
                  const savedGoal = meta.goalAssessments.find((g: any) => g.goalId === goal.goalId);
                  if (savedGoal) {
                    return {
                      ...goal,
                      employeeRating: savedGoal.employeeRating,
                    comments: savedGoal.comments || goal.comments || '',
                    evidenceLinks: savedGoal.evidenceLinks || goal.evidenceLinks || [],
                    completion: savedGoal.completion !== undefined ? savedGoal.completion : goal.completion,
                    weightage: savedGoal.weightage !== undefined ? savedGoal.weightage : goal.weightage,
                    };
                  }
                  return goal;
                });
            };

            if (baseGoalAssessments && baseGoalAssessments.length > 0) {
              setGoalAssessments(mergeGoals(baseGoalAssessments));
            } else {
              setGoalAssessments(prev => mergeGoals(prev));
            }
          }
        }
        
        const hasPendingClarification = loadedClarificationRequests.some(req => req.status === 'pending');
        console.log('loadDraft: Review status determination', {
          reviewId: review.reviewId,
          isDraft: review.isDraft,
          submittedAt: review.submittedAt,
        metadataStatus: review.status || review.metadata?.status,
          determinedStatus,
          hasPendingClarification,
          clarificationRequestsCount: loadedClarificationRequests.length
        });
        
        if (hasPendingClarification && determinedStatus !== 'draft') {
          determinedStatus = 'under_manager_review';
          console.log('loadDraft: Has pending clarification, allowing edit');
        }
        
        setReviewCycle(prev => {
          if (prev) {
            return {
              ...prev,
              status: determinedStatus,
              submittedAt: review.submittedAt || prev.submittedAt
            };
          }
          
          return {
            id: cycleForReview,
            name: `${cycleForReview} Annual Performance Review`,
            startDate: '',
            endDate: '',
            status: determinedStatus,
            submittedAt: review.submittedAt
          };
        });
        
        if (review.ratings) {
          if (review.ratings.overall !== null && review.ratings.overall !== undefined) {
            setSelfRating(review.ratings.overall);
          }
          
          if (review.ratings.goals) {
            setGoalAssessments(prev => prev.map(goal => ({
                  ...goal,
              employeeRating: review.ratings.goals[goal.goalId] || goal.employeeRating
            })));
          }
        }
        
        if (review.comments && !review.metadata?.selfReviewFields) {
          const lines = review.comments.split('\n\n');
            lines.forEach(line => {
              if (line.startsWith('Most Significant Accomplishments:')) {
                setSelfReviewFields(prev => ({
                  ...prev,
                  significantAccomplishments: line.replace('Most Significant Accomplishments: ', '')
                }));
              }
          });
        }
        
        console.log('Review loaded successfully:', {
          reviewId: review.reviewId,
          reviewType: review.reviewType,
          metadataKeys: review.metadata ? Object.keys(review.metadata) : [],
          hasSelfReviewFields: !!review.metadata?.selfReviewFields
        });
      };
      
      // Extract cycle year from review cycle name or use current year
      const cycleYear = cycleYearOverride
        || reviewCycle?.name?.match(/\d{4}/)?.[0]
        || reviewCycle?.id
        || new Date().getFullYear().toString();
      
      // Fetch existing self-review (both draft and submitted)
      // First try to get submitted review, then fallback to draft
      let response = await authenticatedFetch(
        `${API_BASE_URL}/reviews?employeeId=${employeeInfo.id}&cycleYear=${cycleYear}&reviewType=self`,
        { method: 'GET' }
      );
      
      if (response.ok) {
        const reviews = await response.json();
        if (Array.isArray(reviews) && reviews.length > 0) {
          // Prefer submitted review over draft
          const submittedReview = reviews.find((r: any) => !r.isDraft && r.submittedAt);
          const draftReview = reviews.find((r: any) => r.isDraft);
          const review = submittedReview || draftReview || reviews[0];
          
          // Use the hydrateFromReview function to load all data
          hydrateFromReview(review, cycleYear);
          return;
        }
        draftLoadedRef.current = true;
      }
      
      // If we didn't return earlier, try to infer status from manager review
      const statusUpdated = await applyStatusFromManagerReview(cycleYear);
      if (statusUpdated) {
        draftLoadedRef.current = true;
      }
      
      // Fallback: Load from localStorage if API doesn't have a draft
      const savedDraftKey = reviewCycle?.id ? `self-assessment-draft-${reviewCycle.id}` : undefined;
      if (!savedDraftKey) return;
      const savedDraft = localStorage.getItem(savedDraftKey);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.goalAssessments) setGoalAssessments(draft.goalAssessments);
        if (draft.selfReviewFields) setSelfReviewFields(draft.selfReviewFields);
        if (draft.toolsAndTechnologies) setToolsAndTechnologies(draft.toolsAndTechnologies);
        if (draft.developmentPlan) setDevelopmentPlan(draft.developmentPlan);
        if (draft.selfRating !== undefined) setSelfRating(draft.selfRating);
        if (draft.signature) setSignature(draft.signature);
      }
      draftLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading draft:', error);
      // Silently fail - user can start fresh
    }
  };

  // Track the last loaded cycle to reset flag when cycle changes
  const lastLoadedCycleRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!goalsInitializedRef.current) return;
    if (!reviewCycle) return;

    const cycleYear = reviewCycle.id || reviewCycle.name?.match(/\d{4}/)?.[0] || undefined;
    const cycleKey = `${cycleYear}-${reviewCycle.status}`;
    
    // Reset loaded flag if cycle changed
    if (lastLoadedCycleRef.current !== cycleKey) {
      draftLoadedRef.current = false;
      lastLoadedCycleRef.current = cycleKey;
    }
    
    if (draftLoadedRef.current) return;

    loadDraft(cycleYear, goalAssessments).catch((err) => {
      console.error('Error auto-loading draft:', err);
    });
  }, [reviewCycle, goalAssessments]);

  const handleSubmit = async () => {
    console.log('handleSubmit called', { reviewCycle: !!reviewCycle, employeeInfo: !!employeeInfo, userEmail: !!user?.email });
    
    if (!reviewCycle || !employeeInfo || !user?.email) {
      console.warn('handleSubmit: Missing required data', { reviewCycle: !!reviewCycle, employeeInfo: !!employeeInfo, userEmail: !!user?.email });
      toast({
        title: "Error",
        description: "Missing required information. Please refresh the page and try again.",
        variant: "destructive"
      });
      return;
    }

    // Validate required fields - only 5 fields are required based on API response
    const requiredFields = {
      significantAccomplishments: selfReviewFields.significantAccomplishments.trim().length > 0,
      beyondRoleContributions: selfReviewFields.beyondRoleContributions.trim().length > 0,
      challengesAndSolutions: selfReviewFields.challengesAndSolutions.trim().length > 0,
      areasNeedingImprovement: selfReviewFields.areasNeedingImprovement.trim().length > 0,
      certificationsCompleted: selfReviewFields.certificationsCompleted.trim().length > 0,
    };
    
    // Optional fields (not required for submission)
    // - newSkillsAcquired
    // - certificationsPlanned
    
    const hasAllRequiredFields = Object.values(requiredFields).every(filled => filled);
    const hasSignature = signature.trim().length > 0;

    console.log('Validation check:', { requiredFields, hasAllRequiredFields, hasSignature, selfReviewFields, signature: signature.length });

    if (!hasAllRequiredFields || !hasSignature) {
      const missingFields = Object.entries(requiredFields)
        .filter(([_, filled]) => !filled)
        .map(([key]) => {
          const labels: Record<string, string> = {
            significantAccomplishments: 'Most Significant Accomplishments',
            beyondRoleContributions: 'Beyond Role Contributions',
            challengesAndSolutions: 'Challenges and Solutions',
            areasNeedingImprovement: 'Areas Needing Improvement',
            certificationsCompleted: 'Certifications Completed',
          };
          return labels[key] || key;
        });
      
      const missingList = missingFields.length > 0 ? missingFields.join(', ') : '';
      const missingSignature = !hasSignature ? 'Signature' : '';
      const allMissing = [missingList, missingSignature].filter(Boolean).join(', ');
      
      toast({
        title: "Incomplete Form",
        description: `Please complete all required fields. Missing: ${allMissing}`,
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      console.log('Submitting self-review to manager...');
      
      // Extract cycle year from review cycle name or use current year
      const cycleYearMatch = reviewCycle.name?.match(/\d{4}/);
      const cycleYear = cycleYearMatch ? cycleYearMatch[0] : new Date().getFullYear().toString();
      
      // Build goal ratings from goal assessments
      const goalRatings: Record<string, number | null> = {};
      goalAssessments.forEach(goal => {
        goalRatings[goal.goalId] = goal.employeeRating || null;
      });
      
      // Build ratings object
      const ratings: Record<string, any> = {
        overall: selfRating || null,
        goals: goalRatings,
        competencies: {} // Can be populated if needed
      };
      
      // Build comments from self-review fields
      const comments = [
        selfReviewFields.significantAccomplishments && `Most Significant Accomplishments: ${selfReviewFields.significantAccomplishments}`,
        selfReviewFields.beyondRoleContributions && `Beyond Role Contributions: ${selfReviewFields.beyondRoleContributions}`,
        selfReviewFields.challengesAndSolutions && `Challenges and Solutions: ${selfReviewFields.challengesAndSolutions}`,
        selfReviewFields.areasNeedingImprovement && `Areas Needing Improvement: ${selfReviewFields.areasNeedingImprovement}`,
        selfReviewFields.newSkillsAcquired && `New Skills Acquired: ${selfReviewFields.newSkillsAcquired}`,
        selfReviewFields.certificationsCompleted && `Certifications Completed: ${selfReviewFields.certificationsCompleted}`,
        selfReviewFields.certificationsPlanned && `Certifications Planned: ${selfReviewFields.certificationsPlanned}`
      ].filter(Boolean).join('\n\n');
      
      // Extract strengths and improvements
      const strengths: string[] = [];
      const improvements: string[] = [];
      
      if (selfReviewFields.significantAccomplishments) {
        strengths.push(selfReviewFields.significantAccomplishments);
      }
      if (selfReviewFields.beyondRoleContributions) {
        strengths.push(selfReviewFields.beyondRoleContributions);
      }
      if (selfReviewFields.areasNeedingImprovement) {
        improvements.push(selfReviewFields.areasNeedingImprovement);
      }
      
      // Check if this is a resubmission after clarification
      const isResubmissionAfterClarification = clarificationRequests.length > 0;
      
      // Build metadata with all detailed self-review data
      const metadata: Record<string, any> = {
        selfReviewFields,
        toolsAndTechnologies,
        developmentPlan,
        goalAssessments: goalAssessments.map(goal => ({
          goalId: goal.goalId,
          goalDescription: goal.goalDescription,
          weightage: goal.weightage,
          completion: goal.completion,
          employeeRating: goal.employeeRating,
          comments: goal.comments,
          evidenceLinks: goal.evidenceLinks,
          evidenceFiles: goal.evidenceFiles.map(f => ({ name: f.name, size: f.size, type: f.type }))
        })),
        selfRating,
        signature,
        evidenceLinks,
        evidenceFiles: evidenceFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        status: isResubmissionAfterClarification ? 'clarification_responded' : 'self_submitted',
        // Mark clarification requests as responded
        clarificationRequests: clarificationRequests.map(req => ({
          ...req,
          status: 'responded' as const,
          respondedAt: new Date().toISOString()
        })),
        employeeClarificationRespondedAt: isResubmissionAfterClarification ? new Date().toISOString() : undefined
      };
      
      // Build the review payload for submission (not draft)
      const payload = {
        cycleYear,
        employeeId: employeeInfo.id,
        reviewerId: user.email, // Self-review, so reviewer is the employee
        reviewType: 'self' as const,
    status: isResubmissionAfterClarification ? 'clarification_responded' : 'self_submitted',
        goalIds: goalAssessments.map(g => g.goalId),
        ratings,
        comments: comments || undefined,
        strengths,
        improvements,
        attachments: [],
        metadata,
        submittedAt: new Date().toISOString()  // Setting submittedAt moves review to submitted table
      };
      
      // Determine endpoint and method
      const endpoint = activeReviewId
        ? `${API_BASE_URL}/reviews/${activeReviewId}`
        : `${API_BASE_URL}/reviews`;
      const method = activeReviewId ? 'PUT' : 'POST';
      
      console.log('Submitting self-review:', { endpoint, method, payload });
      
      const response = await authenticatedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to submit review' }));
        const errorMessage = errorData?.detail || errorData?.message || 'Failed to submit review';
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      if (data?.reviewId) {
        setActiveReviewId(data.reviewId);
      }

      // Update local state to reflect submission
      setReviewCycle(prev => prev ? { 
        ...prev, 
        status: 'submitted', 
        submittedAt: new Date().toISOString() 
      } : null);
      
      console.log('Review submitted successfully:', data);
      
      toast({
        title: "Success",
        description: "Self-assessment submitted successfully to manager"
      });
    } catch (error) {
      console.error('Error submitting assessment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit assessment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResubmit = async () => {
    // Clear clarification status when resubmitting
    setClarificationRequests([]);
    await handleSubmit();
  };

  const handleAddFinalEvidenceLink = () => {
    const link = prompt("Enter Google Drive link:");
    if (link) {
      setEvidenceLinks([...evidenceLinks, link]);
    }
  };

  const handleFinalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setEvidenceFiles([...evidenceFiles, ...Array.from(files)]);
    }
  };

  const addToolsRow = () => {
    setToolsAndTechnologies([...toolsAndTechnologies, { testType: '', tool: '', rating: 1 }]);
  };

  const removeToolsRow = (index: number) => {
    setToolsAndTechnologies(toolsAndTechnologies.filter((_, i) => i !== index));
  };

  const updateToolsRow = (index: number, field: keyof ToolsAndTechnology, value: string | number) => {
    const updated = [...toolsAndTechnologies];
    updated[index] = { ...updated[index], [field]: value };
    setToolsAndTechnologies(updated);
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

  const getStatusBadge = (status: ReviewCycle['status']) => {
    const variants: Record<string, { label: string; className: string; icon: any }> = {
      not_started: { label: 'Not Started', className: 'bg-muted/50 text-muted-foreground', icon: Clock },
      draft: { label: 'Draft', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Edit },
      submitted: { label: 'Submitted', className: 'bg-green-500/10 text-green-600 border-green-500/20', icon: Send },
      under_manager_review: { label: 'Under Manager Review', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Eye },
      finalized: { label: 'Finalized', className: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle2 }
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

  if (loading && !reviewCycle) {
    return (
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
        <CardContent className="p-12 text-center">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 text-muted-foreground animate-spin" />
          <p className="text-muted-foreground">Loading review cycle...</p>
        </CardContent>
      </Card>
    );
  }

  if (!reviewCycle) {
    return (
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
        <CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">No active review cycle found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Employee Home */}
      {activeSection === 'home' && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">{reviewCycle.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {new Date(reviewCycle.startDate).toLocaleDateString()} - {new Date(reviewCycle.endDate).toLocaleDateString()}
                  </CardDescription>
                </div>
                {getStatusBadge(reviewCycle.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviewCycle.status === 'draft' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : lastSavedRef.current ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Last saved: {lastSavedRef.current.toLocaleTimeString()}</span>
                    </>
                  ) : null}
                </div>
              )}

              {clarificationRequests.length > 0 && (
                <Card className="bg-amber-500/10 border-amber-500/20">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-amber-600" />
                      Clarification Requests
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {clarificationRequests.map((req) => (
                      <div key={req.id} className="p-3 bg-background/50 rounded border border-amber-500/20">
                        <p className="text-sm font-medium mb-1">{req.field}</p>
                        <p className="text-sm text-muted-foreground mb-2">{req.question}</p>
                        {req.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => setActiveSection('form')}
                            className="bg-gradient-to-r from-primary to-primary/80"
                          >
                            <Edit className="h-3 w-3 mr-2" />
                            Respond
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 pt-4">
                {reviewCycle.status === 'not_started' || reviewCycle.status === 'draft' ? (
                  <Button
                    onClick={() => setActiveSection('form')}
                    className="bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                  >
                    {reviewCycle.status === 'draft' ? (
                      <>
                        <Edit className="h-4 w-4 mr-2" />
                        Continue
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Start Assessment
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setActiveSection('form')}
                    className="hover:bg-primary/10"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Assessment
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Self-Assessment Form */}
      {activeSection === 'form' && (
        <SelfAssessmentForm
          reviewCycle={reviewCycle}
          employeeInfo={employeeInfo}
          goalAssessments={goalAssessments}
          setGoalAssessments={setGoalAssessments}
          selfReviewFields={selfReviewFields}
          setSelfReviewFields={setSelfReviewFields}
          toolsAndTechnologies={toolsAndTechnologies}
          setToolsAndTechnologies={setToolsAndTechnologies}
          developmentPlan={developmentPlan}
          setDevelopmentPlan={setDevelopmentPlan}
          signature={signature}
          setSignature={setSignature}
          selfRating={selfRating}
          setSelfRating={setSelfRating}
          clarificationRequests={clarificationRequests}
          evidenceLinks={evidenceLinks}
          setEvidenceLinks={setEvidenceLinks}
          evidenceFiles={evidenceFiles}
          setEvidenceFiles={setEvidenceFiles}
          handleAddFinalEvidenceLink={handleAddFinalEvidenceLink}
          handleFinalFileUpload={handleFinalFileUpload}
          onBack={() => setActiveSection('home')}
          onSubmit={() => {
            console.log('Submit button clicked', { status: reviewCycle.status });
            if (reviewCycle.status === 'under_manager_review') {
              handleResubmit();
            } else {
              handleSubmit();
            }
          }}
          loading={loading}
          saving={saving}
          renderRatingStars={renderRatingStars}
          addToolsRow={addToolsRow}
          removeToolsRow={removeToolsRow}
          updateToolsRow={updateToolsRow}
          readOnly={
            reviewCycle ? (
              (reviewCycle.status === 'submitted' || reviewCycle.status === 'under_manager_review' || reviewCycle.status === 'finalized') &&
              !clarificationRequests.some(req => req.status === 'pending') // Allow editing if clarification is requested
            ) : false
          }
        />
      )}
    </div>
  );
}

// Self-Assessment Form Component
interface SelfAssessmentFormProps {
  reviewCycle: ReviewCycle;
  employeeInfo: EmployeeInfo | null;
  goalAssessments: GoalAssessment[];
  setGoalAssessments: (assessments: GoalAssessment[]) => void;
  selfReviewFields: SelfReviewFields;
  setSelfReviewFields: (fields: SelfReviewFields) => void;
  toolsAndTechnologies: ToolsAndTechnology[];
  setToolsAndTechnologies: (tools: ToolsAndTechnology[]) => void;
  developmentPlan: DevelopmentPlan;
  setDevelopmentPlan: (plan: DevelopmentPlan) => void;
  signature: string;
  setSignature: (signature: string) => void;
  selfRating: number | undefined;
  setSelfRating: (rating: number | undefined) => void;
  clarificationRequests: ClarificationRequest[];
  evidenceLinks: string[];
  setEvidenceLinks: (links: string[]) => void;
  evidenceFiles: File[];
  setEvidenceFiles: (files: File[]) => void;
  handleAddFinalEvidenceLink: () => void;
  handleFinalFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  saving: boolean;
  renderRatingStars: (value: number | undefined, onChange: (value: number) => void, disabled?: boolean) => JSX.Element;
  addToolsRow: () => void;
  removeToolsRow: (index: number) => void;
  updateToolsRow: (index: number, field: keyof ToolsAndTechnology, value: string | number) => void;
  readOnly?: boolean;
}

function SelfAssessmentForm({
  reviewCycle,
  employeeInfo,
  goalAssessments,
  setGoalAssessments,
  selfReviewFields,
  setSelfReviewFields,
  toolsAndTechnologies,
  setToolsAndTechnologies,
  developmentPlan,
  setDevelopmentPlan,
  signature,
  setSignature,
  selfRating,
  setSelfRating,
  clarificationRequests,
  evidenceLinks = [],
  setEvidenceLinks,
  evidenceFiles = [],
  setEvidenceFiles,
  handleAddFinalEvidenceLink,
  handleFinalFileUpload,
  onBack,
  onSubmit,
  loading,
  saving,
  renderRatingStars,
  addToolsRow,
  removeToolsRow,
  updateToolsRow,
  readOnly = false
}: SelfAssessmentFormProps) {
  const [activeSection, setActiveSection] = useState(0);
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const sections = [
    { id: 'goals', label: 'Employee & Goals Overview', icon: Target },
    { id: 'self-review', label: 'Self Review', icon: FileText },
    { id: 'tools', label: 'Tools & Technologies', icon: TrendingUp },
    { id: 'submission', label: 'Final Submission', icon: Send }
  ];

  // Debug: Log state when final submission section is active
  useEffect(() => {
    if (activeSection === 3) {
      // Only check the 5 required fields
      const requiredFieldChecks = {
        significantAccomplishments: selfReviewFields.significantAccomplishments.trim().length > 0,
        beyondRoleContributions: selfReviewFields.beyondRoleContributions.trim().length > 0,
        challengesAndSolutions: selfReviewFields.challengesAndSolutions.trim().length > 0,
        areasNeedingImprovement: selfReviewFields.areasNeedingImprovement.trim().length > 0,
        certificationsCompleted: selfReviewFields.certificationsCompleted.trim().length > 0,
      };
      console.log('Final Submission Section - Validation State:', {
        requiredFieldChecks,
        selfReviewFields,
        signature: signature.length,
        selfRating,
        allRequiredFieldsValid: Object.values(requiredFieldChecks).every(v => v),
        signatureValid: signature.trim().length > 0,
        ratingValid: selfRating !== undefined,
        formReady: Object.values(requiredFieldChecks).every(v => v) && signature.trim().length > 0 && selfRating !== undefined
      });
    }
  }, [activeSection, selfReviewFields, signature, selfRating]);

  // Check if section is completed
  const checkSectionCompletion = (sectionIndex: number): boolean => {
    switch (sectionIndex) {
      case 0: // Goals
        return goalAssessments.length > 0;
      case 1: // Self Review
        // Only check the 5 fields that are actually displayed in the UI:
        // 1. Most Significant Accomplishments (significantAccomplishments)
        // 2. Contributions Beyond Role (beyondRoleContributions)
        // 3. Challenges + Solutions (challengesAndSolutions)
        // 4. Areas Needing Improvement (areasNeedingImprovement)
        // 5. Certifications/Trainings Completed Last Year (certificationsCompleted)
        const displayedFields = [
          selfReviewFields.significantAccomplishments?.trim().length > 0,
          selfReviewFields.beyondRoleContributions?.trim().length > 0,
          selfReviewFields.challengesAndSolutions?.trim().length > 0,
          selfReviewFields.areasNeedingImprovement?.trim().length > 0,
          selfReviewFields.certificationsCompleted?.trim().length > 0
        ];
        // Section is completed if at least one field is filled
        return displayedFields.some(Boolean);
      case 2: // Tools
        // Completed if at least one tool exists (simplified - just check if tools array has items)
        return toolsAndTechnologies.length > 0;
      case 3: // Submission
        return signature.trim().length > 0 && selfRating !== undefined;
      default:
        return false;
    }
  };

  // Update completed sections
  useEffect(() => {
    const newCompleted = new Set<number>();
    sections.forEach((_, index) => {
      if (checkSectionCompletion(index)) {
        newCompleted.add(index);
      }
    });
    setCompletedSections(newCompleted);
  }, [goalAssessments, selfReviewFields, toolsAndTechnologies, signature, selfRating]);

  const goToSection = (index: number) => {
    setActiveSection(index);
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

  const handleAddEvidenceLink = (goalId: string) => {
    const link = prompt("Enter Google Drive link:");
    if (link) {
      setGoalAssessments(goalAssessments.map(goal => 
        goal.goalId === goalId 
          ? { ...goal, evidenceLinks: [...goal.evidenceLinks, link] }
          : goal
      ));
    }
  };

  const handleFileUpload = (goalId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setGoalAssessments(goalAssessments.map(goal => 
        goal.goalId === goalId 
          ? { ...goal, evidenceFiles: [...goal.evidenceFiles, ...Array.from(files)] }
          : goal
      ));
    }
  };

  const getClarificationFields = () => {
    return clarificationRequests.filter(req => req.status === 'pending').map(req => req.field);
  };

  const clarificationFields = getClarificationFields();

  // Count only the 5 fields that are actually displayed in the UI
  const answeredSelfReviewCount = [
    selfReviewFields.significantAccomplishments?.trim().length > 0,
    selfReviewFields.beyondRoleContributions?.trim().length > 0,
    selfReviewFields.challengesAndSolutions?.trim().length > 0,
    selfReviewFields.areasNeedingImprovement?.trim().length > 0,
    selfReviewFields.certificationsCompleted?.trim().length > 0
  ].filter(Boolean).length;
  const completedGoalsCount = goalAssessments.filter(goal => goal.status === 'completed').length;
  const toolsCount = toolsAndTechnologies.length;

  const goalsDescription = (() => {
    const profilePart = employeeInfo
      ? `${employeeInfo.position || 'Role'} • ${employeeInfo.department || 'Department'}`
      : 'Review your profile';
    const goalsPart = goalAssessments.length > 0
      ? ` • ${completedGoalsCount}/${goalAssessments.length} goals ready`
      : ' • Draft your goals and milestones';
    return `${profilePart}${goalsPart}`;
  })();

  const sectionDescriptions: Record<string, string> = {
    'goals': goalsDescription,
    'self-review': answeredSelfReviewCount > 0
      ? `${answeredSelfReviewCount}/5 responses completed`
      : 'Share your accomplishments and growth',
    'tools': toolsCount > 0
      ? `${toolsCount} tools rated`
      : 'Add the tools & technologies you used',
    'submission': signature || selfRating
      ? `${selfRating ? `Rated ${selfRating}/5` : 'Pending rating'} • ${signature ? 'Signed' : 'Awaiting signature'}`
      : 'Rate yourself and sign the form'
  };

  const stepsMeta = sections.map((section, index) => {
    const status = activeSection === index
      ? 'current'
      : completedSections.has(index)
        ? 'completed'
        : 'upcoming';

    return {
      ...section,
      description: sectionDescriptions[section.id] || 'Complete this step',
      status,
      index
    };
  });

  const getStepCardClasses = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
      case 'current':
        return 'border-primary/60 bg-primary/5 shadow-lg text-primary';
      default:
        return 'border-border/60 bg-muted/20 text-muted-foreground';
    }
  };

  const getStepBadgeClasses = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500 text-white';
      case 'current':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-background border border-border/50 text-muted-foreground';
    }
  };

  // Get manager clarification question if available
  const managerClarificationQuestion = clarificationRequests.length > 0 
    ? clarificationRequests[0]?.question 
    : null;
  const managerClarificationFields = clarificationRequests
    .filter(req => req.status === 'pending')
    .map(req => req.field);

  return (
    <div className="space-y-6">
      {/* Manager Clarification Request Banner */}
      {clarificationRequests.length > 0 && (
        <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background border-2 border-amber-500/40 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/40 flex-shrink-0">
                <MessageSquare className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                    Manager Requested Clarification
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 border-l-[3px] border-amber-600">
                  <p className="text-sm font-medium text-foreground mb-2">
                    Your manager has requested clarification on the following field(s):
                  </p>
                  <ul className="list-disc list-inside text-sm text-foreground mb-2 space-y-1">
                    {managerClarificationFields.map((field, idx) => (
                      <li key={idx}>{field}</li>
                    ))}
                  </ul>
                  {managerClarificationQuestion && (
                    <div className="mt-2 pt-2 border-t border-amber-600/30">
                      <p className="text-sm font-semibold text-foreground mb-1">Question:</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {managerClarificationQuestion}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-md p-1.5 border border-amber-500/20">
                  <Edit className="h-3 w-3 flex-shrink-0" />
                  <span className="font-medium">Please update the requested fields above, then click "Submit to Manager" to resubmit.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
          {saving && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3 space-y-3">
          {stepsMeta.map(({ id, label, status, description, index }) => (
            <div
              key={id}
              className={cn(
                "rounded-2xl border p-4 flex items-start justify-between gap-3 transition-all",
                getStepCardClasses(status)
              )}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all flex-shrink-0",
                    getStepBadgeClasses(status)
                  )}
                >
                  {status === 'completed' ? (
                    <CircleCheckBig className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <span className="flex-shrink-0">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground/90">{label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                </div>
              </div>
              {status !== 'current' && (
                <Button variant="link" size="sm" className="text-primary px-0" onClick={() => goToSection(index)}>
                  {readOnly ? 'View' : 'Edit'}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Active Section Only - Wizard Style */}
        <div className="flex-1 space-y-8">
        {/* Section 1: Employee & Goals Overview */}
        {activeSection === 0 && (
        <div
          ref={(el) => (sectionRefs.current[0] = el)}
          className="transition-all duration-300 animate-in fade-in slide-in-from-right-4"
        >
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
              {employeeInfo && (
                <div className="mb-5">
                  <div className="rounded-2xl border border-border/40 bg-background/40 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Employee Name</Label>
                      <p className="font-medium">{employeeInfo.name}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Employee ID</Label>
                      <p className="font-medium">{employeeInfo.employeeId || employeeInfo.id}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Position</Label>
                      <p className="font-medium">{employeeInfo.position}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Department</Label>
                      <p className="font-medium">{employeeInfo.department}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Reporting Manager</Label>
                      <p className="font-medium">{employeeInfo.managerName}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Review Period</Label>
                      <p className="font-medium">{reviewCycle.name}</p>
                    </div>
                  </div>
                </div>
              )}
              {goalAssessments.length === 0 ? (
                <Card className="bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40 backdrop-blur-sm border-border/30 shadow-inner">
                  <CardContent className="p-12 text-center">
                    <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto mb-4">
                      <Target className="h-8 w-8 text-primary/50" />
                    </div>
                    <p className="text-muted-foreground text-sm">No goals found. Goals will appear here once they are set for you.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {goalAssessments.map((goal) => {
                    const getStatusBadge = (status: string) => {
                      const variants: Record<string, { label: string; className: string; icon: any }> = {
                        in_progress: { label: 'In Progress', className: 'bg-gradient-to-r from-blue-500/20 to-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm shadow-blue-500/10', icon: Clock },
                        completed: { label: 'Completed', className: 'bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-600 border-green-500/30 shadow-sm shadow-green-500/10', icon: CheckCircle2 },
                        pending: { label: 'Pending', className: 'bg-gradient-to-r from-amber-500/20 to-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm shadow-amber-500/10', icon: Clock },
                        pending_manager_approval: { label: 'Pending Approval', className: 'bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-600 border-purple-500/30 shadow-sm shadow-purple-500/10', icon: Send },
                        manager_reopened: { label: 'Reopened', className: 'bg-gradient-to-r from-orange-500/20 to-orange-500/10 text-orange-600 border-orange-500/30 shadow-sm shadow-orange-500/10', icon: RefreshCw }
                      };
                      const config = variants[status] || variants.pending;
                      const Icon = config.icon;
                      return (
                        <Badge variant="outline" className={cn("flex items-center gap-1", config.className)}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      );
                    };

                    return (
                      <Card 
                        key={goal.goalId} 
                        className="group relative overflow-hidden bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
                      >
                        {/* Enhanced Hover Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-primary/3 to-primary/8 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        {/* Subtle Shine Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                        
                        <CardContent className="relative p-5 space-y-4">
                          {/* Header Section */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-3">
                              <h4 className="font-bold text-base text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors duration-300">
                                {goal.goalDescription}
                              </h4>
                              <div className="flex items-center gap-2.5 flex-wrap">
                                {getStatusBadge(goal.status)}
                                <Badge 
                                  variant="outline" 
                                  className="bg-gradient-to-r from-primary/20 via-primary/12 to-primary/20 text-primary border-primary/35 text-[10px] font-semibold px-2.5 py-1 shadow-md hover:shadow-lg transition-all duration-200"
                                >
                                  {goal.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          {/* Info Pills - Enhanced */}
                          <div className="flex items-center gap-3 flex-wrap pt-1">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-background/60 to-background/40 border border-border/40 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200">
                              <Calendar className="h-3.5 w-3.5 text-primary/80" />
                              <span className="font-semibold text-xs text-foreground/90">{new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-background/60 to-background/40 border border-border/40 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200">
                              <Target className="h-3.5 w-3.5 text-primary/80" />
                              <span className="font-semibold text-xs text-foreground/90">{goal.weightage}%</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-background/60 to-background/40 border border-border/40 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200">
                              <TrendingUp className="h-3.5 w-3.5 text-primary/80" />
                              <span className="font-semibold text-xs text-foreground/90">{Math.round(goal.completion)}%</span>
                            </div>
                          </div>
                          
                          {/* Enhanced Progress Bar */}
                          {goal.completion > 0 && (
                            <div className="relative pt-2">
                              <div className="h-2 rounded-full bg-muted/50 overflow-hidden border border-border/30 shadow-inner">
                                <div 
                                  className="h-full bg-gradient-to-r from-primary via-primary/95 to-primary rounded-full transition-all duration-700 ease-out shadow-lg shadow-primary/30 relative overflow-hidden"
                                  style={{ width: `${Math.min(goal.completion, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Enhanced Milestones Section */}
                          {goal.milestones && goal.milestones.length > 0 && (
                            <div className="flex items-center justify-between pt-2 border-t border-border/30">
                              <div className="text-xs text-muted-foreground/90 font-semibold">
                                <span className="text-foreground font-bold">{goal.milestones.filter((m: any) => m.completed).length}</span>
                                <span className="mx-1.5 text-muted-foreground/60">/</span>
                                <span className="text-foreground/80">{goal.milestones.length}</span>
                                <span className="ml-2 text-muted-foreground/70">milestones</span>
                              </div>
                              <div className="h-2 w-20 rounded-full bg-muted/40 overflow-hidden border border-border/30 shadow-inner">
                                <div 
                                  className="h-full bg-gradient-to-r from-green-500 via-green-400 to-green-500 rounded-full transition-all duration-500 shadow-md shadow-green-500/30"
                                  style={{ width: `${(goal.milestones.filter((m: any) => m.completed).length / goal.milestones.length) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={goToPrevious} className="h-10">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
              Next: Self Review
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
        )}

        {/* Section 2: 7-Point Self-Review Fields */}
        {activeSection === 1 && (
        <div
          ref={(el) => (sectionRefs.current[1] = el)}
          className="transition-all duration-300 animate-in fade-in slide-in-from-right-4"
        >
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
              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Most Significant Accomplishments') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
                <Label htmlFor="accomplishments" className="text-sm font-semibold">
                  1. Most Significant Accomplishments
                  {clarificationFields.includes('Most Significant Accomplishments') && (
                    <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Clarification Requested
                    </Badge>
                  )}
                </Label>
                <Textarea
                  id="accomplishments"
                  value={selfReviewFields.significantAccomplishments}
                  onChange={(e) => setSelfReviewFields({ ...selfReviewFields, significantAccomplishments: e.target.value })}
                  placeholder="Describe your most significant accomplishments..."
                  className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                  disabled={readOnly}
                />
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Beyond Role Contributions') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
                <Label htmlFor="beyond-role" className="text-sm font-semibold">
                  2. Contributions Beyond Role
                  {clarificationFields.includes('Beyond Role Contributions') && (
                    <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Clarification Requested
                    </Badge>
                  )}
                </Label>
                <Textarea
                  id="beyond-role"
                  value={selfReviewFields.beyondRoleContributions}
                  onChange={(e) => setSelfReviewFields({ ...selfReviewFields, beyondRoleContributions: e.target.value })}
                  placeholder="Describe contributions beyond your role..."
                  className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                  disabled={readOnly}
                />
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Challenges and Solutions') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
                <Label htmlFor="challenges" className="text-sm font-semibold">
                  3. Challenges + Solutions (with examples)
                  {clarificationFields.includes('Challenges and Solutions') && (
                    <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Clarification Requested
                    </Badge>
                  )}
                </Label>
                <Textarea
                  id="challenges"
                  value={selfReviewFields.challengesAndSolutions}
                  onChange={(e) => setSelfReviewFields({ ...selfReviewFields, challengesAndSolutions: e.target.value })}
                  placeholder="Describe challenges faced and solutions implemented with examples..."
                  className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                  disabled={readOnly}
                />
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Areas Needing Improvement') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
                <Label htmlFor="improvement" className="text-sm font-semibold">
                  4. Areas Needing Improvement
                  {clarificationFields.includes('Areas Needing Improvement') && (
                    <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Clarification Requested
                    </Badge>
                  )}
                </Label>
                <Textarea
                  id="improvement"
                  value={selfReviewFields.areasNeedingImprovement}
                  onChange={(e) => setSelfReviewFields({ ...selfReviewFields, areasNeedingImprovement: e.target.value })}
                  placeholder="Describe areas that need improvement..."
                  className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                  disabled={readOnly}
                />
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('New Skills Acquired') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Certifications Completed') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
                <Label htmlFor="certifications-completed" className="text-sm font-semibold">
                  5. Certifications/Trainings Completed Last Year
                  {clarificationFields.includes('Certifications Completed') && (
                    <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Clarification Requested
                    </Badge>
                  )}
                </Label>
                <Textarea
                  id="certifications-completed"
                  value={selfReviewFields.certificationsCompleted}
                  onChange={(e) => setSelfReviewFields({ ...selfReviewFields, certificationsCompleted: e.target.value })}
                  disabled={readOnly}
                  placeholder="List certifications or trainings completed..."
                  className="min-h-[120px] bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                />
              </div>

              <div className={cn(
                "space-y-2",
                clarificationFields.includes('Certifications Planned') && "bg-amber-500/5 p-4 rounded-lg border border-amber-500/20"
              )}>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={goToPrevious} className="h-10">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
              Next: Tools & Technologies
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
        )}

        {/* Section 3: Tools & Technologies */}
        {activeSection === 2 && (
        <div
          ref={(el) => (sectionRefs.current[2] = el)}
          className="transition-all duration-300 animate-in fade-in slide-in-from-right-4"
        >
          <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                Tools & Technologies
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-2">
                Add tools and technologies with ratings (1-3)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border border-border/40 rounded-lg overflow-hidden bg-background/30 backdrop-blur-sm shadow-inner">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-muted/40 to-muted/20 border-b border-border/40">
                      <TableHead className="font-semibold">Tool</TableHead>
                      <TableHead className="font-semibold">Rating (1-3)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {toolsAndTechnologies.map((tool, index) => (
                      <TableRow key={index} className="hover:bg-muted/20 transition-colors">
                        <TableCell>
                          <Input
                            value={tool.tool}
                            onChange={(e) => updateToolsRow(index, 'tool', e.target.value)}
                            placeholder="e.g., Jest"
                            className="bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                            disabled={readOnly}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={tool.rating.toString()}
                              onValueChange={(value) => updateToolsRow(index, 'rating', parseInt(value))}
                              disabled={readOnly}
                            >
                              <SelectTrigger className="bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                              </SelectContent>
                            </Select>
                            {tool.rating && (
                              <span className="text-sm font-medium text-muted-foreground">
                                {tool.rating === 1 ? 'Beginner' : tool.rating === 2 ? 'Intermediate' : 'Advanced'}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {!readOnly && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeToolsRow(index)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!readOnly && (
              <Button
                variant="outline"
                onClick={addToolsRow}
                className="mt-4 hover:bg-primary/10 border-primary/20 hover:border-primary/40 transition-all shadow-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </Button>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={goToPrevious} className="h-10">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            <Button onClick={goToNext} className="bg-gradient-to-r from-primary to-primary/80 shadow-lg h-10">
              Next: Final Submission
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
        )}

        {/* Section 4: Final Submission */}
        {activeSection === 3 && (
        <div
          ref={(el) => (sectionRefs.current[3] = el)}
          className="transition-all duration-300 animate-in fade-in slide-in-from-right-4"
        >
          <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                  <Send className="h-4 w-4 text-primary" />
                </div>
                Final Submission
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-sm font-semibold mb-3 block">
                  Rate Yourself
                </Label>
                {renderRatingStars(selfRating, (rating) => setSelfRating(rating), readOnly)}
              </div>

              <div>
                <Label htmlFor="signature" className="text-sm font-semibold mb-2 block">
                  Signature
                </Label>
                <Input
                  id="signature"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your full name to sign"
                  className="bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                  disabled={readOnly}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  By signing, you confirm that all information provided is accurate
                </p>
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
                      onClick={handleAddFinalEvidenceLink}
                      className="hover:bg-primary/10"
                      disabled={readOnly}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Add G-Drive Link
                    </Button>
                    <label>
                      <input
                        type="file"
                        multiple
                        onChange={handleFinalFileUpload}
                        className="hidden"
                        disabled={readOnly}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="hover:bg-primary/10"
                        disabled={readOnly}
                      >
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Files
                        </span>
                      </Button>
                    </label>
                  </div>

                  {evidenceLinks && evidenceLinks.length > 0 && (
                    <div className="space-y-2">
                      {evidenceLinks.map((link, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border/50">
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1 truncate">{link}</span>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEvidenceLinks(evidenceLinks.filter((_, i) => i !== idx));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {evidenceFiles && evidenceFiles.length > 0 && (
                    <div className="space-y-2">
                      {evidenceFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-background/50 rounded border border-border/50">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1 truncate">{file.name}</span>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEvidenceFiles(evidenceFiles.filter((_, i) => i !== idx));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                {(() => {
                  // Only check the 5 required fields (based on API response)
                  const requiredFieldChecks = {
                    significantAccomplishments: selfReviewFields.significantAccomplishments.trim().length > 0,
                    beyondRoleContributions: selfReviewFields.beyondRoleContributions.trim().length > 0,
                    challengesAndSolutions: selfReviewFields.challengesAndSolutions.trim().length > 0,
                    areasNeedingImprovement: selfReviewFields.areasNeedingImprovement.trim().length > 0,
                    certificationsCompleted: selfReviewFields.certificationsCompleted.trim().length > 0,
                  };
                  
                  // Optional fields (not required for submission)
                  // - newSkillsAcquired
                  // - certificationsPlanned
                  
                  const missingFields = Object.entries(requiredFieldChecks)
                    .filter(([_, filled]) => !filled)
                    .map(([key]) => {
                      const labels: Record<string, string> = {
                        significantAccomplishments: 'Most Significant Accomplishments',
                        beyondRoleContributions: 'Beyond Role Contributions',
                        challengesAndSolutions: 'Challenges and Solutions',
                        areasNeedingImprovement: 'Areas Needing Improvement',
                        certificationsCompleted: 'Certifications Completed',
                      };
                      return labels[key] || key;
                    });
                  
                  const hasAllRequiredFields = Object.values(requiredFieldChecks).every(filled => filled);
                  const hasSignature = signature.trim().length > 0;
                  const hasRating = selfRating !== undefined;
                  const isDisabled = loading || !hasAllRequiredFields || !hasSignature || !hasRating;
                  
                  // Debug logging
                  if (!hasAllRequiredFields) {
                    console.log('Missing required self-review fields:', missingFields);
                    console.log('Field values:', selfReviewFields);
                  }
                  
                  return (
                    <>
                      {isDisabled && !loading && !readOnly && (
                        <div className="text-xs text-muted-foreground mb-2 space-y-1">
                          {!hasAllRequiredFields && (
                            <p>
                              Please complete all required self-review fields. Missing: {missingFields.join(', ')}
                            </p>
                          )}
                          {!hasSignature && <p>Please provide your signature.</p>}
                          {!hasRating && <p>Please rate yourself.</p>}
                        </div>
                      )}
                      {!readOnly && (
                <Button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Submit button onClick fired', { isDisabled, loading, hasAllRequiredFields, hasSignature, hasRating, missingFields });
                            if (!isDisabled) {
                              onSubmit();
                            }
                          }}
                          disabled={isDisabled}
                  className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                  size="lg"
                          type="button"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : reviewCycle.status === 'under_manager_review' ? (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Resubmit to Manager
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit to Manager
                    </>
                  )}
                </Button>
                      )}
                      {readOnly && (
                        <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg border border-border/50 text-center">
                          This review has been submitted and cannot be edited.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-start mt-4">
            <Button variant="outline" onClick={goToPrevious} className="h-10">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
}

