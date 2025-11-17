import { useState, useEffect, useCallback, Dispatch, SetStateAction } from "react";
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
  ChevronLeft
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
  reviewStatus: 'not_started' | 'self_submitted' | 'manager_reviewing' | 'clarification_requested' | 'manager_submitted';
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
}

const COMPETENCIES = [
  { id: 'business_project', name: 'Business / Project Goals', weightage: 60 },
  { id: 'functional_behavioral', name: 'Functional / Behavioural', weightage: 20 },
  { id: 'innovation_initiatives', name: 'Innovation / Initiatives / Collaboration', weightage: 20 }
];

export function ManagerReviewWorkspace() {
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
  const [showReviewModal, setShowReviewModal] = useState(false);

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
          reviewStatus: 'self_submitted' as const, // TODO: Get from API
          selfReviewSubmittedAt: new Date().toISOString(), // TODO: Get from API
          cycleId: '1', // TODO: Get active cycle
          cycleName: '2024 Annual Performance Review' // TODO: Get from API
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
  }, [user, employees, toast]);

  useEffect(() => {
    fetchDirectReports();
  }, [fetchDirectReports]);

  // Fetch employee review data
  const fetchEmployeeReview = useCallback(async (employeeId: string) => {
    try {
      setLoading(true);
      // TODO: Replace with actual API calls
      // const response = await authenticatedFetch(`${API_BASE_URL}/reviews/employee/${employeeId}`);
      // const data = await response.json();

      // Mock data
      const mockSelfReview: EmployeeSelfReview = {
        employeeId,
        keyAccomplishments: "Successfully delivered 3 major projects on time. Led a team of 5 developers.",
        beyondResponsibilities: "Mentored 2 junior developers. Organized team building activities.",
        challenges: "Faced technical challenges with legacy system integration. Example: Had to refactor 2000+ lines of code.",
        areasToImprove: "Need to improve time management. Should focus more on documentation.",
        skillsAcquired: "Learned React, TypeScript, and AWS services. Completed AWS Solutions Architect certification.",
        trainingsCompleted: "AWS Solutions Architect Associate, React Advanced Patterns, Leadership Training",
        trainingsToPursue: "AWS Solutions Architect Professional, Kubernetes Administration, Advanced System Design",
        toolsAndTechnologies: [
          { testType: "Unit Test", tool: "Jest", rating: 3 },
          { testType: "Integration Test", tool: "Cypress", rating: 2 },
          { testType: "E2E Test", tool: "Playwright", rating: 2 }
        ]
      };

      const mockGoalReviews: GoalReview[] = [
        {
          goalId: '1',
          goalDescription: "Complete project X with 100% test coverage",
          weightage: 40,
          employeeRating: 4
        },
        {
          goalId: '2',
          goalDescription: "Improve code quality and reduce technical debt",
          weightage: 30,
          employeeRating: 5
        },
        {
          goalId: '3',
          goalDescription: "Lead team of 5 developers",
          weightage: 30,
          employeeRating: 4
        }
      ];

      const mockCompetencyReviews: CompetencyReview[] = COMPETENCIES.map(comp => ({
        competencyId: comp.id,
        competencyName: comp.name,
        weightage: comp.weightage
      }));

      setEmployeeSelfReview(mockSelfReview);
      setGoalReviews(mockGoalReviews);
      setCompetencyReviews(mockCompetencyReviews);
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
    fetchEmployeeReview(employee.id);
    setShowReviewModal(true);
  };

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
    if (!selectedEmployee) return;

    // Validate required fields
    const hasAllGoalRatings = goalReviews.every(goal => goal.managerRating !== undefined);
    const hasAllCompetencyRatings = competencyReviews.every(comp => comp.managerRating !== undefined);
    const hasOverallRating = finalRating.overallRating !== undefined;
    const hasSummaryFeedback = finalRating.summaryFeedback.trim().length > 0;

    if (!hasAllGoalRatings || !hasAllCompetencyRatings || !hasOverallRating || !hasSummaryFeedback) {
      toast({
        title: "Incomplete Review",
        description: "Please complete all required fields before submitting",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      // TODO: API call
      // await authenticatedFetch(`${API_BASE_URL}/reviews/submit`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     employeeId: selectedEmployee.id,
      //     goalReviews,
      //     competencyReviews,
      //     finalRating
      //   })
      // });

      toast({
        title: "Success",
        description: "Review submitted successfully to HR"
      });

      // Update status
      setDirectReports(prev => prev.map(rep => 
        rep.id === selectedEmployee.id 
          ? { ...rep, reviewStatus: 'manager_submitted' }
          : rep
      ));

      setShowReviewModal(false);
      setSelectedEmployee(null);
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({
        title: "Error",
        description: "Failed to submit review",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Review Workspace Modal */}
      {selectedEmployee && (
        <ReviewWorkspaceModal
          open={showReviewModal}
          onOpenChange={setShowReviewModal}
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
          loading={loading}
          renderRatingStars={renderRatingStars}
          handleRatingChange={handleRatingChange}
          handleCompetencyRatingChange={handleCompetencyRatingChange}
        />
      )}

      {/* Clarification Request Modal */}
      <ClarificationRequestModal
        open={showClarificationModal}
        onOpenChange={setShowClarificationModal}
        employee={selectedEmployee}
        requests={clarificationRequests}
        setRequests={setClarificationRequests}
      />
    </div>
  );
}

// Review Workspace Modal Component
type ReviewSection = 'employee-details' | 'self-review' | 'goals' | 'competencies' | 'final-rating';

interface ReviewWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  loading: boolean;
  renderRatingStars: (value: number | undefined, onChange: (value: number) => void, disabled?: boolean) => JSX.Element;
  handleRatingChange: (goalId: string, rating: number) => void;
  handleCompetencyRatingChange: (competencyId: string, rating: number) => void;
}

function ReviewWorkspaceModal({
  open,
  onOpenChange,
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
  loading,
  renderRatingStars,
  handleRatingChange,
  handleCompetencyRatingChange
}: ReviewWorkspaceModalProps) {
  const [activeSection, setActiveSection] = useState<ReviewSection>('employee-details');
  const { preserveScroll } = usePreserveScroll();
  const tabOrder: ReviewSection[] = ['employee-details', 'self-review', 'goals', 'competencies', 'final-rating'];

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Manager Review - {employee.name}</DialogTitle>
          <DialogDescription>
            Complete the performance review for {employee.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeSection}
          onValueChange={(value) => {
            setActiveSection(value as ReviewSection);
            preserveScroll();
          }}
          className="w-full"
        >
          <TabsList className="h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid w-full grid-cols-5">
            <TabsTrigger value="employee-details" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Employee Details</TabsTrigger>
            <TabsTrigger value="self-review" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Self Review</TabsTrigger>
            <TabsTrigger value="goals" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Goals</TabsTrigger>
            <TabsTrigger value="competencies" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Competencies</TabsTrigger>
            <TabsTrigger value="final-rating" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Final Rating</TabsTrigger>
          </TabsList>

          {/* Employee Details Section */}
          <TabsContent value="employee-details" className="space-y-4 mt-4">
            <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  Employee Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary/30">
                    <AvatarImage src={employee.photoUrl} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {employee.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xl font-semibold">{employee.name}</h3>
                    <p className="text-muted-foreground">{employee.position}</p>
                    <p className="text-sm text-muted-foreground">{employee.department}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                  <div>
                    <Label className="text-sm text-muted-foreground">Employee ID</Label>
                    <p className="font-medium">{employee.id}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Review Period</Label>
                    <p className="font-medium">{employee.cycleName}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Email</Label>
                    <p className="font-medium">{employee.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Manager</Label>
                    <p className="font-medium">You</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Self Review Section */}
          <TabsContent value="self-review" className="space-y-4 mt-4">
            {employeeSelfReview ? (
              <div className="space-y-4">
                <Card className="bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-sm border-border/40 shadow-lg">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl flex items-center gap-2.5 bg-gradient-to-r from-blue-500 to-primary/70 bg-clip-text text-transparent">
                      <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20">
                        <FileText className="h-4 w-4 text-blue-500" />
                      </div>
                      Employee Self-Review
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        1. Key Accomplishments Since Last Review
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.keyAccomplishments}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        2. Contributions Beyond Job Responsibilities
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.beyondResponsibilities}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        3. Challenges Faced (with Examples)
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.challenges}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        4. Areas for Development / Improvement
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.areasToImprove}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        5. New Skills or Knowledge Acquired
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.skillsAcquired}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        6. Certifications or Trainings Completed Last Year
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.trainingsCompleted}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground mb-2 block">
                        7. Trainings / Certifications Employee Wants to Pursue Next
                      </Label>
                      <p className="text-sm leading-relaxed bg-background/50 p-4 rounded-lg border border-border/50">
                        {employeeSelfReview.trainingsToPursue}
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
          </TabsContent>

          {/* Goals Review Section */}
          <TabsContent value="goals" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Goals Review
                </CardTitle>
                <CardDescription>
                  Rate each goal from the Appraisal Form (5 = Outstanding, 1 = Needs Improvement)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Goal Description</TableHead>
                        <TableHead>Weightage</TableHead>
                        <TableHead>Employee Rating</TableHead>
                        <TableHead>Manager Rating *</TableHead>
                        <TableHead>Comments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {goalReviews.map((goal) => (
                        <TableRow key={goal.goalId}>
                          <TableCell className="max-w-md">
                            <p className="text-sm font-medium">{goal.goalDescription}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{goal.weightage}%</Badge>
                          </TableCell>
                          <TableCell>
                            {goal.employeeRating ? (
                              <div className="flex items-center gap-1">
                                {[5, 4, 3, 2, 1].map((rating) => (
                                  <Star
                                    key={rating}
                                    className={cn(
                                      "h-4 w-4",
                                      rating <= goal.employeeRating! ? "fill-blue-400 text-blue-400" : "text-muted-foreground"
                                    )}
                                  />
                                ))}
                                <span className="ml-2 text-xs text-muted-foreground">{goal.employeeRating}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {renderRatingStars(goal.managerRating, (rating) => handleRatingChange(goal.goalId, rating))}
                          </TableCell>
                          <TableCell>
                            <Textarea
                              value={goal.managerComments || ''}
                              onChange={(e) => {
                                setGoalReviews(prev => prev.map(g => 
                                  g.goalId === goal.goalId ? { ...g, managerComments: e.target.value } : g
                                ));
                              }}
                              placeholder="Add comments..."
                              className="min-h-[60px] bg-background/50 text-sm"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Competency Assessment Section */}
          <TabsContent value="competencies" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Competency Assessment
                </CardTitle>
                <CardDescription>
                  Rate each competency category (5 = Outstanding, 1 = Needs Improvement)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {competencyReviews.map((comp) => (
                  <Card key={comp.competencyId} className="bg-background/30 border-border/50">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{comp.competencyName}</h4>
                          <p className="text-sm text-muted-foreground">Weightage: {comp.weightage}%</p>
                        </div>
                        <div className="flex-1 max-w-xs">
                          {renderRatingStars(comp.managerRating, (rating) => handleCompetencyRatingChange(comp.competencyId, rating))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground mb-2 block">Comments</Label>
                        <Textarea
                          value={comp.managerComments || ''}
                          onChange={(e) => {
                            setCompetencyReviews(prev => prev.map(c => 
                              c.competencyId === comp.competencyId ? { ...c, managerComments: e.target.value } : c
                            ));
                          }}
                          placeholder="Add comments for this competency..."
                          className="min-h-[80px] bg-background/50"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Final Rating Section */}
          <TabsContent value="final-rating" className="space-y-4 mt-4">
            <Card className="bg-background/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Manager Final Rating
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold mb-3 block">
                    Overall Manager Rating *
                  </Label>
                  {renderRatingStars(finalRating.overallRating, (rating) => 
                    setFinalRating(prev => ({ ...prev, overallRating: rating }))
                  )}
                </div>

                <div>
                  <Label htmlFor="summary" className="text-sm font-semibold mb-2 block">
                    Summary Feedback *
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
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              const currentIndex = tabOrder.indexOf(activeSection);
              if (currentIndex > 0) {
                const prevValue = tabOrder[currentIndex - 1];
                setActiveSection(prevValue);
                preserveScroll();
              } else {
                onOpenChange(false);
              }
            }}
            className="h-10 w-full md:w-auto"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          <div className="flex gap-2 w-full md:w-auto">
            <Button
              variant="outline"
              onClick={onRequestClarification}
              className="h-10 w-full md:w-auto hover:bg-amber-500/10 hover:text-amber-600"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Request Clarification
            </Button>
            <Button
              onClick={onSubmit}
              disabled={loading}
              className="bg-gradient-to-r from-primary to-primary/80 h-10 w-full md:w-auto"
            >
              <Send className="h-4 w-4 mr-2" />
              Send to HR
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Clarification Request Modal Component
interface ClarificationRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: DirectReport | null;
  requests: ClarificationRequest[];
  setRequests: (requests: ClarificationRequest[]) => void;
}

function ClarificationRequestModal({
  open,
  onOpenChange,
  employee,
  requests,
  setRequests
}: ClarificationRequestModalProps) {
  const [selectedField, setSelectedField] = useState('');
  const [question, setQuestion] = useState('');
  const { toast } = useToast();

  const fields = [
    'Key Accomplishments',
    'Beyond Responsibilities',
    'Challenges',
    'Areas to Improve',
    'Skills Acquired',
    'Trainings Completed',
    'Trainings to Pursue',
    'Tools & Technologies'
  ];

  const handleSubmit = () => {
    if (!selectedField || !question.trim()) {
      toast({
        title: "Required Fields",
        description: "Please select a field and enter your question",
        variant: "destructive"
      });
      return;
    }

    const newRequest: ClarificationRequest = {
      id: Date.now().toString(),
      field: selectedField,
      question: question.trim(),
      status: 'pending'
    };

    setRequests([...requests, newRequest]);
    toast({
      title: "Clarification Requested",
      description: "The employee will be notified to provide clarification"
    });

    setSelectedField('');
    setQuestion('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle>Request Clarification from {employee?.name}</DialogTitle>
          <DialogDescription>
            Select the field you need clarification on and ask your question
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="field">Select Field *</Label>
            <Select value={selectedField} onValueChange={setSelectedField}>
              <SelectTrigger className="mt-1 bg-background/50">
                <SelectValue placeholder="Select a field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

