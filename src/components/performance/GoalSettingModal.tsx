import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Save,
  Send,
  Brain,
  X,
  Calendar,
  Target,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useGoals } from "@/hooks/use-goals";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { API_BASE_URL } from '@/config/api';
import { authenticatedFetch } from '@/utils/auth-utils';



export interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  yearsOfExperience: number;
  skills: string[];
  photoUrl?: string;
}

interface GoalSettingModalProps {
  employee: Employee;
  open: boolean;
  onClose: () => void;
  onAISuggestions?: (employeeId: string) => Promise<void> | void;
}

export function GoalSettingModal({ employee, open, onClose, onAISuggestions }: GoalSettingModalProps) {
  const { createGoal, getEmployeeGoals, loading: creatingGoal } = useGoals();
  const { toast } = useToast();
  const { user } = useAuth();


  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "Business/Project Goals",
    targetDate: "",
    weightage: 10, // Default weightage
    notes: ""
  });
  const [isDraft, setIsDraft] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [existingGoals, setExistingGoals] = useState<any[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  // Fetch existing goals when modal opens
  useEffect(() => {
    if (open && employee.id) {
      const fetchExistingGoals = async () => {
        setLoadingGoals(true);
        try {
          const goals = await getEmployeeGoals(employee.id, true);
          setExistingGoals(goals || []);
        } catch (error) {
          console.error("Error fetching existing goals:", error);
        } finally {
          setLoadingGoals(false);
        }
      };
      fetchExistingGoals();
    } else if (!open) {
      // Reset form when modal closes
      setFormData({
        title: "",
        description: "",
        category: "Business/Project Goals",
        targetDate: "",
        weightage: 10,
        notes: ""
      });
      setExistingGoals([]);
    }
  }, [open, employee.id, getEmployeeGoals]);

  // Calculate total weightage from existing goals
  const totalWeightage = useMemo(() => {
    return existingGoals.reduce((sum, goal) => sum + (goal.weightage || 0), 0);
  }, [existingGoals]);

  // Calculate remaining weightage
  const remainingWeightage = useMemo(() => {
    return Math.max(0, 100 - totalWeightage);
  }, [totalWeightage]);

  // Available weightage options (only up to remaining weightage)
  const availableWeightageOptions = useMemo(() => {
    const options = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return options.filter(opt => opt <= remainingWeightage);
  }, [remainingWeightage]);

  // Update weightage if it exceeds remaining
  useEffect(() => {
    if (formData.weightage > remainingWeightage && remainingWeightage > 0) {
      setFormData(prev => ({
        ...prev,
        weightage: Math.max(10, Math.floor(remainingWeightage / 10) * 10) // Round down to nearest 10
      }));
    } else if (remainingWeightage === 0) {
      setFormData(prev => ({
        ...prev,
        weightage: 0
      }));
    }
  }, [remainingWeightage]);

  const handleAISuggestions = async () => {
    setLoading(true);
    setShowSuggestions(true);

    try {
      // Fetch self-assessment skills and context to augment profile
      let combinedSkills = [...(employee.skills || [])];
      let performanceAreas: any = {};

      try {
        const cyclesResponse = await authenticatedFetch(`${API_BASE_URL}/reviews/cycles`);
        if (cyclesResponse.ok) {
          const cycles = await cyclesResponse.json();
          const filteredCycles = cycles.filter((c: any) => c.status !== 'draft');
          let selectedCycle = filteredCycles.find((c: any) => c.status === 'open' || c.status === 'active');
          if (!selectedCycle && filteredCycles.length > 0) {
            selectedCycle = filteredCycles.sort((a: any, b: any) => b.year.localeCompare(a.year))[0];
          }

          if (selectedCycle) {
            const [reviewResponse, managerReviewResponse] = await Promise.all([
              authenticatedFetch(
                `${API_BASE_URL}/reviews?employeeId=${employee.id}&cycleYear=${selectedCycle.year}&reviewType=self`
              ),
              authenticatedFetch(
                `${API_BASE_URL}/reviews?employeeId=${employee.id}&cycleYear=${selectedCycle.year}&reviewType=manager`
              )
            ]);

            if (reviewResponse.ok) {
              const reviews = await reviewResponse.json();
              if (Array.isArray(reviews) && reviews.length > 0) {
                const review = reviews.find((r: any) => !r.isDraft && r.submittedAt) || reviews.find((r: any) => r.isDraft) || reviews[0];

                // 1. Extract skills from tools/technologies section
                if (review?.metadata?.toolsAndTechnologies) {
                  const tools = review.metadata.toolsAndTechnologies;
                  const assessmentTools = tools
                    .filter((t: any) => t.tool) // Filter valid tools
                    .map((t: any) => {
                      const ratingMap: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
                      const level = ratingMap[t.rating] || 'Unrated';
                      return `${t.tool} (Proficiency: ${t.rating}/3 - ${level})`;
                    });

                  if (assessmentTools.length > 0) {
                    combinedSkills = [...new Set([...combinedSkills, ...assessmentTools])];
                  }
                }

                // 2. Extract qualitative data for performance areas (challenges, improvements)
                if (review?.content) {
                  const content = typeof review.content === 'string' ? JSON.parse(review.content) : review.content;

                  if (content.challengesAndSolutions) {
                    performanceAreas.challenges = content.challengesAndSolutions;
                  }
                  if (content.areasNeedingImprovement) {
                    performanceAreas.improvements = content.areasNeedingImprovement;
                  }
                  if (content.significantAccomplishments) {
                    performanceAreas.strengths = content.significantAccomplishments;
                  }
                  if (content.beyondRoleContributions) {
                    performanceAreas.contributions = content.beyondRoleContributions;
                  }
                }
              }

              // 3. Process Manager Review for additional improvement context
              if (managerReviewResponse.ok) {
                const managerReviews = await managerReviewResponse.json();
                if (Array.isArray(managerReviews) && managerReviews.length > 0) {
                  // Get latest manager review (submitted or draft)
                  const managerReview = managerReviews.find((r: any) => !r.isDraft && r.submittedAt) || managerReviews[0];

                  if (managerReview?.content) {
                    const mgrContent = typeof managerReview.content === 'string' ? JSON.parse(managerReview.content) : managerReview.content;

                    if (mgrContent.areasNeedingImprovement) {
                      // Append manager improvements to the list
                      performanceAreas.manager_improvements = mgrContent.areasNeedingImprovement;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch assessment context for AI, proceeding with basic profile", err);
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/ai/suggest-goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee_data: {
            name: employee.name,
            position: employee.position,
            department: employee.department,
            skills: combinedSkills, // Use combined skills
            yearsOfExperience: employee.yearsOfExperience,
            performance_areas: performanceAreas // Use populated performance areas
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI suggestions');
      }

      const data = await response.json();

      if (data.suggestions && Array.isArray(data.suggestions)) {
        // Map reasoning if missing since it's used in the UI
        const mappedSuggestions = data.suggestions.map((s: any) => ({
          ...s,
          reasoning: s.reasoning || "Aligns with your profile and career path"
        }));
        setAiSuggestions(mappedSuggestions);
      } else {
        // Fallback or empty state
        setAiSuggestions([]);
        toast({
          title: "Notice",
          description: "Could not generate suggestions at this time. Please try again later.",
        });
      }
    } catch (error) {
      console.error("Error fetching AI suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to generate AI suggestions. Please try again.",
        variant: "destructive"
      });
      // Clear suggestions on error
      setAiSuggestions([]);
    } finally {
      setLoading(false);
    }
  };


  const applySuggestion = (suggestion: any) => {
    setFormData({
      ...formData,
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category
    });
    setShowSuggestions(false);
  };

  const handleCreateGoal = async () => {
    if (!formData.title.trim() || !formData.targetDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Title and Target Date).",
        variant: "destructive"
      });
      return;
    }

    // Validate weightage
    if (formData.weightage <= 0) {
      toast({
        title: "Validation Error",
        description: "Weightage must be greater than 0.",
        variant: "destructive"
      });
      return;
    }

    if (formData.weightage > remainingWeightage) {
      toast({
        title: "Validation Error",
        description: `Weightage cannot exceed remaining weightage (${remainingWeightage}%).`,
        variant: "destructive"
      });
      return;
    }

    const newTotalWeightage = totalWeightage + formData.weightage;
    if (newTotalWeightage > 100) {
      toast({
        title: "Validation Error",
        description: `Total weightage cannot exceed 100%. Current: ${totalWeightage}%, Adding: ${formData.weightage}% = ${newTotalWeightage}%`,
        variant: "destructive"
      });
      return;
    }

    try {
      const goalData = {
        employeeId: employee.id,
        title: formData.title.trim(),
        description: formData.description || formData.notes || undefined,
        category: formData.category,
        targetDate: formData.targetDate,
        weightage: formData.weightage,
        milestones: [] // Can be added later
      };

      const createdGoal = await createGoal(goalData);

      if (createdGoal) {
        // Reset form
        setFormData({
          title: "",
          description: "",
          category: "Business/Project Goals",
          targetDate: "",
          weightage: 10,
          notes: ""
        });
        setIsDraft(false);

        try {
          if (onAISuggestions) {
            await onAISuggestions(employee.id);
          }
        } finally {
          onClose();
        }
      }
    } catch (error) {
      console.error("Error creating goal:", error);
      // Error toast is handled by useGoals hook
    }
  };

  const isSelfService = useMemo(() => {
    return employee.email === user?.email;
  }, [employee.email, user?.email]);


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                {isSelfService ? "Propose Your New Goal" : `Set Goals for ${employee.name}`}
              </CardTitle>
              <CardDescription>
                {isSelfService
                  ? "Define your goal and submit it to your manager for review and approval."
                  : `${employee.position} • ${employee.department}`
                }
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* AI Suggestions Button */}
          <div className="flex items-center gap-2 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
            <Brain className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium">AI-Powered Goal Suggestions</p>
              <p className="text-sm text-muted-foreground">
                Get intelligent goal recommendations based on {employee.name}'s profile and experience
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleAISuggestions}
              disabled={loading}
              className="border-primary/30 bg-primary/5 hover:bg-primary/10"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Suggestions
                </>
              )}
            </Button>
          </div>

          {/* AI Suggestions Display */}
          {showSuggestions && aiSuggestions.length > 0 && (
            <div className="space-y-3 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/20">
              <h4 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI Suggestions
              </h4>
              {aiSuggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-background/50 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium">{suggestion.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                      <p className="text-xs text-primary mt-2 italic">💡 {suggestion.reasoning}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applySuggestion(suggestion)}
                    className="mt-2"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Use This Suggestion
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Goal Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Master React Performance Optimization"
                className="bg-background/50"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the goal in detail..."
                className="w-full min-h-[100px] px-3 py-2 rounded-md border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Business/Project Goals">Business/Project Goals</SelectItem>
                    <SelectItem value="Functional/Behavioral Competencies">Functional/Behavioral Competencies</SelectItem>
                    <SelectItem value="Innovation/Initiatives/Collaboration">Innovation/Initiatives/Collaboration</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Target Date</label>
                <Input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                  className="bg-background/50"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Weightage (%)</label>
                {loadingGoals ? (
                  <span className="text-xs text-muted-foreground">Loading...</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Used: <span className="font-semibold">{totalWeightage}%</span>
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className={cn(
                      "text-xs font-semibold",
                      remainingWeightage > 0 ? "text-primary" : "text-destructive"
                    )}>
                      Remaining: {remainingWeightage}%
                    </span>
                  </div>
                )}
              </div>

              {remainingWeightage === 0 ? (
                <Alert className="bg-amber-500/10 border-amber-500/20">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm text-amber-600">
                    All weightage (100%) has been allocated. Please edit or delete existing goals to free up weightage.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Select
                    value={formData.weightage.toString()}
                    onValueChange={(value) => setFormData({ ...formData, weightage: parseInt(value) })}
                    disabled={remainingWeightage === 0}
                  >
                    <SelectTrigger className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWeightageOptions.length > 0 ? (
                        availableWeightageOptions.map((value) => (
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
                    Select the percentage weightage for this goal. Maximum available: {remainingWeightage}%
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Additional Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional context or milestones..."
                className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border/50">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="draft"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="draft" className="text-sm font-medium cursor-pointer">
                Save as Draft
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {isDraft ? (
                <Button
                  onClick={async () => {
                    // For now, treat draft same as published (can be enhanced later)
                    await handleCreateGoal();
                  }}
                  disabled={creatingGoal || !formData.title || !formData.targetDate || remainingWeightage === 0 || formData.weightage <= 0}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {creatingGoal ? "Saving..." : "Save Draft"}
                </Button>
              ) : (
                <Button
                  onClick={handleCreateGoal}
                  disabled={creatingGoal || !formData.title || !formData.targetDate || remainingWeightage === 0 || formData.weightage <= 0}
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {creatingGoal
                    ? (isSelfService ? "Proposing..." : "Publishing...")
                    : (isSelfService ? "Propose Goal" : "Publish Goal")
                  }
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

