import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Save,
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
  CircleCheckBig
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


export function EmployeeSelfAssessment() {
  const { user } = useAuth();
  const { employees, isLoading: employeesLoading } = useEmployees();
  const { getEmployeeGoals } = useGoals();
  const { toast } = useToast();
  const { preserveScroll } = usePreserveScroll();
  
  const [reviewCycle, setReviewCycle] = useState<ReviewCycle | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  
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
  
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<Date | null>(null);

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
          position: currentUser.position || '',
          department: currentUser.department || '',
          managerName: manager?.name || 'Unknown',
          managerId: manager?.id || ''
        });

        // TODO: Fetch active review cycle from API
        // const response = await authenticatedFetch(`${API_BASE_URL}/review-cycles/active`);
        // const cycle = await response.json();
        
        // Mock data
        const mockCycle: ReviewCycle = {
          id: '1',
          name: '2024 Annual Performance Review',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          status: 'draft'
        };
        setReviewCycle(mockCycle);

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

        // Load draft if exists
        await loadDraft();
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


  // Autosave functionality
  useEffect(() => {
    if (reviewCycle?.status === 'draft') {
      autosaveTimerRef.current = setInterval(() => {
        saveDraft();
      }, 10000); // Autosave every 10 seconds

      return () => {
        if (autosaveTimerRef.current) {
          clearInterval(autosaveTimerRef.current);
        }
      };
    }
  }, [reviewCycle?.status, goalAssessments, selfReviewFields, toolsAndTechnologies, developmentPlan, selfRating, signature]);

  const saveDraft = async () => {
    if (!reviewCycle || !employeeInfo) return;
    
    try {
      setSaving(true);
      // TODO: API call to save draft
      // await authenticatedFetch(`${API_BASE_URL}/self-assessments/draft`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     cycleId: reviewCycle.id,
      //     employeeId: employeeInfo.id,
      //     goalAssessments,
      //     selfReviewFields,
      //     toolsAndTechnologies,
      //     developmentPlan,
      //     selfRating,
      //     signature
      //   })
      // });

      lastSavedRef.current = new Date();
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      setSaving(false);
    }
  };

  const loadDraft = async () => {
    if (!reviewCycle || !employeeInfo) return;
    
    try {
      // TODO: API call to load draft
      // const response = await authenticatedFetch(`${API_BASE_URL}/self-assessments/draft/${reviewCycle.id}`);
      // const draft = await response.json();
      
      // Mock: Load from localStorage as fallback
      const savedDraft = localStorage.getItem(`self-assessment-draft-${reviewCycle.id}`);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.goalAssessments) setGoalAssessments(draft.goalAssessments);
        if (draft.selfReviewFields) setSelfReviewFields(draft.selfReviewFields);
        if (draft.toolsAndTechnologies) setToolsAndTechnologies(draft.toolsAndTechnologies);
        if (draft.developmentPlan) setDevelopmentPlan(draft.developmentPlan);
        if (draft.selfRating !== undefined) setSelfRating(draft.selfRating);
        if (draft.signature) setSignature(draft.signature);
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  };

  const handleSubmit = async () => {
    if (!reviewCycle || !employeeInfo) return;

    // Validate required fields
    const hasAllSelfReviewFields = Object.values(selfReviewFields).every(field => field.trim().length > 0);
    const hasSignature = signature.trim().length > 0;

    if (!hasAllSelfReviewFields || !hasSignature) {
      toast({
        title: "Incomplete Form",
        description: "Please complete all required fields before submitting",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      // TODO: API call
      // await authenticatedFetch(`${API_BASE_URL}/self-assessments/submit`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     cycleId: reviewCycle.id,
      //     employeeId: employeeInfo.id,
      //     goalAssessments,
      //     competencyAssessments,
      //     selfReviewFields,
      //     toolsAndTechnologies,
      //     developmentPlan,
      //     signature
      //   })
      // });

      setReviewCycle(prev => prev ? { ...prev, status: 'submitted', submittedAt: new Date().toISOString() } : null);
      toast({
        title: "Success",
        description: "Self-assessment submitted successfully to manager"
      });
    } catch (error) {
      console.error('Error submitting assessment:', error);
      toast({
        title: "Error",
        description: "Failed to submit assessment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResubmit = async () => {
    await handleSubmit();
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
        {value !== undefined && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">
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
          onBack={() => setActiveSection('home')}
          onSubmit={reviewCycle.status === 'under_manager_review' ? handleResubmit : handleSubmit}
          onSaveDraft={saveDraft}
          loading={loading}
          saving={saving}
          renderRatingStars={renderRatingStars}
          addToolsRow={addToolsRow}
          removeToolsRow={removeToolsRow}
          updateToolsRow={updateToolsRow}
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
  onBack: () => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  loading: boolean;
  saving: boolean;
  renderRatingStars: (value: number | undefined, onChange: (value: number) => void, disabled?: boolean) => JSX.Element;
  addToolsRow: () => void;
  removeToolsRow: (index: number) => void;
  updateToolsRow: (index: number, field: keyof ToolsAndTechnology, value: string | number) => void;
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
  onBack,
  onSubmit,
  onSaveDraft,
  loading,
  saving,
  renderRatingStars,
  addToolsRow,
  removeToolsRow,
  updateToolsRow
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

  // Check if section is completed
  const checkSectionCompletion = (sectionIndex: number): boolean => {
    switch (sectionIndex) {
      case 0: // Goals
        return goalAssessments.length > 0;
      case 1: // Self Review
        return Object.values(selfReviewFields).every(field => field.trim().length > 0);
      case 2: // Tools
        return toolsAndTechnologies.length > 0 && toolsAndTechnologies.every(tool => tool.testType && tool.tool && tool.rating);
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
  }, [goalAssessments, selfReviewFields, toolsAndTechnologies, signature]);

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

  const answeredSelfReviewCount = Object.values(selfReviewFields).filter(value => value.trim().length > 0).length;
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
      ? `${answeredSelfReviewCount}/7 responses completed`
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
        return 'border-emerald-200 bg-emerald-50 text-emerald-900';
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

  return (
    <div className="space-y-6">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={onBack} className="h-10 w-10">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          )}
          {reviewCycle.status === 'draft' && (
            <Button variant="outline" onClick={onSaveDraft} className="h-10">
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          )}
        </div>
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
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    getStepBadgeClasses(status)
                  )}
                >
                  {status === 'completed' ? <CircleCheckBig className="h-4 w-4" /> : index + 1}
                </div>
                <div>
                  <p className="font-semibold text-foreground/90">{label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                </div>
              </div>
              {status !== 'current' && (
                <Button variant="link" size="sm" className="text-primary px-0" onClick={() => goToSection(index)}>
                  Edit
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
                      <p className="font-medium">{employeeInfo.id}</p>
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
                        className="group relative overflow-hidden bg-gradient-to-br from-background/60 via-background/40 to-background/60 backdrop-blur-md border-border/40 hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <CardContent className="relative p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm text-foreground mb-2.5 line-clamp-2 leading-snug">
                                {goal.goalDescription}
                              </h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                {getStatusBadge(goal.status)}
                                <Badge 
                                  variant="outline" 
                                  className="bg-gradient-to-r from-primary/15 to-primary/8 text-primary border-primary/25 text-[10px] font-medium px-2 py-0.5 shadow-sm"
                                >
                                  {goal.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-[11px] text-muted-foreground/90 pt-1">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-border/30">
                              <Calendar className="h-3 w-3 text-muted-foreground/70" />
                              <span className="font-medium">{new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-border/30">
                              <Target className="h-3 w-3 text-muted-foreground/70" />
                              <span className="font-medium">{goal.weightage}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-border/30">
                              <TrendingUp className="h-3 w-3 text-muted-foreground/70" />
                              <span className="font-medium">{Math.round(goal.completion)}%</span>
                            </div>
                          </div>
                          
                          {goal.completion > 0 && (
                            <div className="relative pt-1">
                              <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden border border-border/20">
                                <div 
                                  className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary rounded-full transition-all duration-500 ease-out shadow-sm shadow-primary/20"
                                  style={{ width: `${Math.min(goal.completion, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {goal.milestones && goal.milestones.length > 0 && (
                            <div className="flex items-center justify-between pt-1">
                              <div className="text-[11px] text-muted-foreground/80 font-medium">
                                <span className="text-foreground/70">{goal.milestones.filter((m: any) => m.completed).length}</span>
                                <span className="mx-1">/</span>
                                <span>{goal.milestones.length}</span>
                                <span className="ml-1.5">milestones</span>
                              </div>
                              <div className="h-1.5 w-16 rounded-full bg-muted/30 overflow-hidden border border-border/20">
                                <div 
                                  className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
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
                      <TableHead className="font-semibold">Test Type</TableHead>
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
                            value={tool.testType}
                            onChange={(e) => updateToolsRow(index, 'testType', e.target.value)}
                            placeholder="e.g., Unit Test"
                            className="bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={tool.tool}
                            onChange={(e) => updateToolsRow(index, 'tool', e.target.value)}
                            placeholder="e.g., Jest"
                            className="bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50 transition-all"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={tool.rating.toString()}
                              onValueChange={(value) => updateToolsRow(index, 'rating', parseInt(value))}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeToolsRow(index)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                variant="outline"
                onClick={addToolsRow}
                className="mt-4 hover:bg-primary/10 border-primary/20 hover:border-primary/40 transition-all shadow-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </Button>
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
                {renderRatingStars(selfRating, (rating) => setSelfRating(rating))}
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
                />
                <p className="text-xs text-muted-foreground mt-2">
                  By signing, you confirm that all information provided is accurate
                </p>
              </div>

              <div className="pt-4 border-t border-border/50">
                <Button
                  onClick={onSubmit}
                  disabled={loading || signature.trim().length === 0 || selfRating === undefined}
                  className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-lg"
                  size="lg"
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

