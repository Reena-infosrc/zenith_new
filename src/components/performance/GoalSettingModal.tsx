import { useState } from "react";
import {
  Sparkles,
  Save,
  Send,
  Brain,
  X,
  Calendar,
  Target
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGoals } from "@/hooks/use-goals";
import { useToast } from "@/hooks/use-toast";

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
  onAISuggestions: () => void;
}

export function GoalSettingModal({ employee, open, onClose, onAISuggestions }: GoalSettingModalProps) {
  const { createGoal, loading: creatingGoal } = useGoals();
  const { toast } = useToast();
  
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

  const handleAISuggestions = async () => {
    setLoading(true);
    setShowSuggestions(true);
    // TODO: Call AI API
    // Mock suggestions for now
    setTimeout(() => {
      setAiSuggestions([
        {
          title: `Master ${employee.skills[0] || 'Advanced'} Concepts`,
          description: `Based on ${employee.yearsOfExperience} years of experience, focus on advanced patterns and best practices.`,
          category: "Business/Project Goals",
          reasoning: "Aligns with current skill level and growth path"
        },
        {
          title: "Lead Technical Project",
          description: `With ${employee.yearsOfExperience} years of experience, leading a project will develop leadership skills.`,
          category: "Functional/Behavioral Competencies",
          reasoning: "Natural progression for senior role"
        }
      ]);
      setLoading(false);
    }, 1500);
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
        onClose();
        
        // Call callback if provided
        if (onAISuggestions) {
          onAISuggestions();
        }
      }
    } catch (error) {
      console.error("Error creating goal:", error);
      // Error toast is handled by useGoals hook
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Set Goals for {employee.name}</CardTitle>
              <CardDescription>{employee.position} • {employee.department}</CardDescription>
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
              <label className="text-sm font-medium mb-2 block">Weightage (%)</label>
              <Select 
                value={formData.weightage.toString()} 
                onValueChange={(value) => setFormData({ ...formData, weightage: parseInt(value) })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
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
                  disabled={creatingGoal || !formData.title || !formData.targetDate}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {creatingGoal ? "Saving..." : "Save Draft"}
                </Button>
              ) : (
                <Button
                  onClick={handleCreateGoal}
                  disabled={creatingGoal || !formData.title || !formData.targetDate}
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {creatingGoal ? "Publishing..." : "Publish Goal"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

