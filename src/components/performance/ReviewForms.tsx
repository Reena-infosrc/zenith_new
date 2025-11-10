import { useState, useEffect } from "react";
import {
  FileText,
  User,
  Users,
  CheckCircle2,
  Clock,
  Lock,
  Edit,
  Save,
  X,
  Plus,
  AlertCircle,
  Star,
  MessageSquare
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";

interface ReviewQuestion {
  id: string;
  question: string;
  type: 'rating' | 'text' | 'scale';
  required: boolean;
  category: string;
}

interface ReviewForm {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId: string;
  cycleName: string;
  formType: 'self' | 'manager' | 'peer';
  reviewerId?: string;
  reviewerName?: string;
  status: 'draft' | 'submitted' | 'locked' | 'approved';
  questions: ReviewQuestionResponse[];
  submittedAt?: string;
  lockedAt?: string;
  createdAt: string;
}

interface ReviewQuestionResponse {
  questionId: string;
  question: string;
  answer: string | number;
  rating?: number;
  comment?: string;
}

interface Rubric {
  id: string;
  name: string;
  scale: number;
  descriptions: Record<number, string>;
}

export function ReviewForms() {
  const [forms, setForms] = useState<ReviewForm[]>([]);
  const [selectedForm, setSelectedForm] = useState<ReviewForm | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const { preserveScroll } = usePreserveScroll();
  const [rubric, setRubric] = useState<Rubric>({
    id: 'default',
    name: 'Performance Rating Scale',
    scale: 5,
    descriptions: {
      1: 'Needs Improvement - Does not meet expectations',
      2: 'Below Expectations - Partially meets expectations',
      3: 'Meets Expectations - Fully meets expectations',
      4: 'Exceeds Expectations - Consistently exceeds expectations',
      5: 'Outstanding - Far exceeds expectations'
    }
  });

  // Mock data
  useEffect(() => {
    setForms([
      {
        id: '1',
        employeeId: 'emp1',
        employeeName: 'John Doe',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        formType: 'self',
        status: 'draft',
        questions: [
          {
            questionId: 'q1',
            question: 'Describe your key achievements this quarter',
            answer: '',
            comment: ''
          },
          {
            questionId: 'q2',
            question: 'Rate your technical skills',
            answer: 0,
            rating: 0,
            comment: ''
          }
        ],
        createdAt: '2024-01-15'
      },
      {
        id: '2',
        employeeId: 'emp1',
        employeeName: 'John Doe',
        cycleId: '1',
        cycleName: 'Q1 2024 Performance Review',
        formType: 'manager',
        reviewerId: 'mgr1',
        reviewerName: 'Jane Smith',
        status: 'submitted',
        questions: [
          {
            questionId: 'q1',
            question: 'Describe employee key achievements',
            answer: '',
            comment: 'John has shown excellent progress in React development.'
          },
          {
            questionId: 'q2',
            question: 'Rate employee technical skills',
            answer: 4,
            rating: 4,
            comment: 'Strong technical foundation with room for growth in architecture.'
          }
        ],
        submittedAt: '2024-03-20',
        createdAt: '2024-01-15'
      }
    ]);
  }, []);

  const getFormTypeBadge = (type: string) => {
    const configs: Record<string, { label: string; variant: any; icon: any }> = {
      self: { label: 'Self Review', variant: 'default', icon: User },
      manager: { label: 'Manager Review', variant: 'secondary', icon: Users },
      peer: { label: 'Peer Review', variant: 'outline', icon: Users }
    };
    const config = configs[type] || configs.self;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; variant: any; icon: any }> = {
      draft: { label: 'Draft', variant: 'secondary', icon: Edit },
      submitted: { label: 'Submitted', variant: 'default', icon: CheckCircle2 },
      locked: { label: 'Locked', variant: 'outline', icon: Lock },
      approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 }
    };
    const config = configs[status] || configs.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleSubmitForm = (formId: string) => {
    // TODO: API call
    setForms(forms.map(f => 
      f.id === formId 
        ? { ...f, status: 'submitted', submittedAt: new Date().toISOString() }
        : f
    ));
    setShowFormModal(false);
  };

  const handleLockForm = (formId: string) => {
    // TODO: API call - lock after cycle close
    setForms(forms.map(f => 
      f.id === formId 
        ? { ...f, status: 'locked', lockedAt: new Date().toISOString() }
        : f
    ));
  };

  const renderRatingStars = (value: number, onChange?: (value: number) => void, disabled = false) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => !disabled && onChange && onChange(star)}
            disabled={disabled}
            className={cn(
              "transition-colors",
              disabled ? "cursor-not-allowed" : "cursor-pointer hover:scale-110",
              star <= value ? "text-yellow-400" : "text-muted-foreground"
            )}
          >
            <Star className={cn("h-6 w-6", star <= value ? "fill-current" : "")} />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-sm text-muted-foreground">
            {rubric.descriptions[value as keyof typeof rubric.descriptions]}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Review Forms
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Complete self, manager, and peer reviews
          </p>
        </div>
      </div>

      <Tabs defaultValue="self" className="space-y-4" onValueChange={() => {
        preserveScroll();
      }}>
        <TabsList>
          <TabsTrigger value="self">
            <User className="h-4 w-4 mr-2" />
            Self Reviews
          </TabsTrigger>
          <TabsTrigger value="manager">
            <Users className="h-4 w-4 mr-2" />
            Manager Reviews
          </TabsTrigger>
        </TabsList>

        <TabsContent value="self" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.filter(f => f.formType === 'self').map((form) => (
              <Card
                key={form.id}
                className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold">{form.cycleName}</h3>
                      </div>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {getFormTypeBadge(form.formType)}
                        {getStatusBadge(form.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Employee: {form.employeeName}
                      </p>
                      {form.submittedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Submitted: {new Date(form.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {form.questions.filter(q => q.answer !== '' && q.answer !== 0).length} / {form.questions.length} questions
                        </span>
                      </div>
                      <Progress
                        value={(form.questions.filter(q => q.answer !== '' && q.answer !== 0).length / form.questions.length) * 100}
                        className="h-2"
                      />
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelectedForm(form);
                        setShowFormModal(true);
                      }}
                    >
                      {form.status === 'draft' ? <Edit className="h-4 w-4 mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                      {form.status === 'draft' ? 'Continue' : 'View'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="manager" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {forms.filter(f => f.formType === 'manager').map((form) => (
              <Card
                key={form.id}
                className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50 hover:border-primary/30 transition-all hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold">{form.cycleName}</h3>
                      </div>
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {getFormTypeBadge(form.formType)}
                        {getStatusBadge(form.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Employee: {form.employeeName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reviewer: {form.reviewerName}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelectedForm(form);
                        setShowFormModal(true);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      {form.status === 'draft' ? 'Complete' : 'View'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Modal */}
      {selectedForm && (
        <Dialog open={showFormModal} onOpenChange={setShowFormModal}>
          <DialogContent className="bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selectedForm.cycleName}
                {getFormTypeBadge(selectedForm.formType)}
                {getStatusBadge(selectedForm.status)}
              </DialogTitle>
              <DialogDescription>
                {selectedForm.formType === 'self' 
                  ? `Complete your self-review for ${selectedForm.employeeName}`
                  : `Review for ${selectedForm.employeeName}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {selectedForm.questions.map((q, idx) => (
                <Card key={q.questionId} className="bg-background/50 border-border/50">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <Label className="text-base font-semibold">
                        {idx + 1}. {q.question}
                      </Label>
                      {q.rating !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rating:</span>
                          {renderRatingStars(
                            q.rating || 0,
                            (value) => {
                              const updated = selectedForm.questions.map(qq => 
                                qq.questionId === q.questionId 
                                  ? { ...qq, rating: value, answer: value }
                                  : qq
                              );
                              setSelectedForm({ ...selectedForm, questions: updated });
                            },
                            selectedForm.status === 'locked'
                          )}
                        </div>
                      )}
                    </div>

                    {q.rating === undefined && (
                      <Textarea
                        value={q.comment || ''}
                        onChange={(e) => {
                          const updated = selectedForm.questions.map(qq => 
                            qq.questionId === q.questionId 
                              ? { ...qq, comment: e.target.value, answer: e.target.value }
                              : qq
                          );
                          setSelectedForm({ ...selectedForm, questions: updated });
                        }}
                        placeholder="Enter your response..."
                        disabled={selectedForm.status === 'locked'}
                        className="min-h-[100px] bg-background/50"
                      />
                    )}

                    {q.rating !== undefined && (
                      <div>
                        <Label className="text-sm text-muted-foreground mb-2 block">
                          Comments (Required for ratings below 3)
                        </Label>
                        <Textarea
                          value={q.comment || ''}
                          onChange={(e) => {
                            const updated = selectedForm.questions.map(qq => 
                              qq.questionId === q.questionId 
                                ? { ...qq, comment: e.target.value }
                                : qq
                              );
                            setSelectedForm({ ...selectedForm, questions: updated });
                          }}
                          placeholder="Add comments..."
                          disabled={selectedForm.status === 'locked'}
                          className="min-h-[80px] bg-background/50"
                        />
                        {(q.rating || 0) < 3 && !q.comment && (
                          <div className="flex items-center gap-2 text-sm text-destructive mt-2">
                            <AlertCircle className="h-4 w-4" />
                            Comments are required for ratings below 3
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFormModal(false)}>
                <X className="h-4 w-4 mr-2" />
                {selectedForm.status === 'draft' ? 'Save Draft' : 'Close'}
              </Button>
              {selectedForm.status === 'draft' && (
                <Button
                  onClick={() => handleSubmitForm(selectedForm.id)}
                  disabled={
                    selectedForm.questions.some(q => {
                      if (q.rating !== undefined) {
                        return !q.rating || ((q.rating < 3) && !q.comment);
                      }
                      return !q.answer || q.answer === '';
                    })
                  }
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Submit Review
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

