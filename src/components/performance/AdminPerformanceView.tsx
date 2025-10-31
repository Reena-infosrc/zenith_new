import { useState, useEffect } from "react";
import { 
  Users, 
  Target, 
  Sparkles, 
  Save, 
  Send,
  Filter,
  Search,
  Plus,
  Edit,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Calendar,
  BookOpen,
  Briefcase,
  Award,
  Brain
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  yearsOfExperience: number;
  skills: string[];
  photoUrl?: string;
}

interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: 'draft' | 'published' | 'completed';
  completion: number;
  createdAt: string;
  aiSuggested?: boolean;
}

interface GoalDraft {
  employeeId: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  notes: string;
}

export function AdminPerformanceView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [isDraftMode, setIsDraftMode] = useState(false);

  // Mock data - replace with API calls
  useEffect(() => {
    setEmployees([
      {
        id: "1",
        name: "John Doe",
        email: "john.doe@company.com",
        position: "Senior Developer",
        department: "Engineering",
        yearsOfExperience: 5,
        skills: ["React", "TypeScript", "Node.js", "AWS"],
        photoUrl: undefined
      },
      {
        id: "2",
        name: "Jane Smith",
        email: "jane.smith@company.com",
        position: "Product Manager",
        department: "Product",
        yearsOfExperience: 3,
        skills: ["Product Strategy", "Agile", "Data Analysis"],
        photoUrl: undefined
      },
      {
        id: "3",
        name: "Mike Johnson",
        email: "mike.johnson@company.com",
        position: "Junior Developer",
        department: "Engineering",
        yearsOfExperience: 1,
        skills: ["JavaScript", "React", "CSS"],
        photoUrl: undefined
      }
    ]);
  }, []);

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.position.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = filterDept === "all" || emp.department === filterDept;
    return matchesSearch && matchesDept;
  });

  const getGoalsForEmployee = (employeeId: string) => {
    return goals.filter(g => g.employeeId === employeeId);
  };

  const getGoalsSummary = (employeeId: string) => {
    const employeeGoals = getGoalsForEmployee(employeeId);
    const published = employeeGoals.filter(g => g.status === 'published').length;
    const drafts = employeeGoals.filter(g => g.status === 'draft').length;
    const completed = employeeGoals.filter(g => g.status === 'completed').length;
    return { total: employeeGoals.length, published, drafts, completed };
  };

  const departments = Array.from(new Set(employees.map(e => e.department)));

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Employees</p>
                <p className="text-3xl font-bold mt-2">{employees.length}</p>
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
                <p className="text-sm font-medium text-muted-foreground">Goals Set</p>
                <p className="text-3xl font-bold mt-2">
                  {goals.filter(g => g.status === 'published').length}
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
                <p className="text-sm font-medium text-muted-foreground">Pending Goals</p>
                <p className="text-3xl font-bold mt-2">
                  {employees.length - goals.filter(g => g.status === 'published').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Drafts</p>
                <p className="text-3xl font-bold mt-2">
                  {goals.filter(g => g.status === 'draft').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Save className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList className="bg-muted/50 backdrop-blur-sm">
          <TabsTrigger value="employees">Employee List</TabsTrigger>
          <TabsTrigger value="highlights">Goal Highlights</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          {/* Search and Filter */}
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-background/50"
                  />
                </div>
                <Select value={filterDept} onValueChange={setFilterDept}>
                  <SelectTrigger className="w-48 bg-background/50">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Employee Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((employee) => {
              const summary = getGoalsSummary(employee.id);
              return (
                <Card
                  key={employee.id}
                  className={cn(
                    "bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer",
                    selectedEmployee?.id === employee.id && "ring-2 ring-primary"
                  )}
                  onClick={() => setSelectedEmployee(employee)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border-2 border-primary/20">
                          <AvatarImage src={employee.photoUrl} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {employee.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-lg">{employee.name}</h3>
                          <p className="text-sm text-muted-foreground">{employee.position}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{employee.department}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{employee.yearsOfExperience} years exp.</span>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {employee.skills.slice(0, 3).map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {employee.skills.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{employee.skills.length - 3}
                          </Badge>
                        )}
                      </div>

                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Goals Status</span>
                          <div className="flex gap-2">
                            {summary.published > 0 && (
                              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                                {summary.published} Set
                              </Badge>
                            )}
                            {summary.drafts > 0 && (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                                {summary.drafts} Drafts
                              </Badge>
                            )}
                            {summary.published === 0 && summary.drafts === 0 && (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                                No Goals
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployee(employee);
                          setShowGoalModal(true);
                        }}
                      >
                        <Target className="h-4 w-4 mr-2" />
                        Set Goals
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="highlights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employees with Goals Set */}
            <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 backdrop-blur-sm border-green-500/20 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Goals Set
                </CardTitle>
                <CardDescription>Employees with published goals</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {employees.filter(e => getGoalsSummary(e.id).published > 0).map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                      <span className="font-medium">{emp.name}</span>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        {getGoalsSummary(emp.id).published} goals
                      </Badge>
                    </div>
                  ))}
                  {employees.filter(e => getGoalsSummary(e.id).published > 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No goals set yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Employees without Goals */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 backdrop-blur-sm border-amber-500/20 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Goals Needed
                </CardTitle>
                <CardDescription>Employees requiring goal setup</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {employees.filter(e => getGoalsSummary(e.id).published === 0).map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                      <span className="font-medium">{emp.name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setShowGoalModal(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Set Goals
                      </Button>
                    </div>
                  ))}
                  {employees.filter(e => getGoalsSummary(e.id).published === 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">All employees have goals set</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Goal Setting Modal - will be created in separate component */}
      {showGoalModal && selectedEmployee && (
        <GoalSettingModal
          employee={selectedEmployee}
          open={showGoalModal}
          onClose={() => {
            setShowGoalModal(false);
            setSelectedEmployee(null);
          }}
          onAISuggestions={() => {}}
        />
      )}
    </div>
  );
}

// Goal Setting Modal Component
interface GoalSettingModalProps {
  employee: Employee;
  open: boolean;
  onClose: () => void;
  onAISuggestions: () => void;
}

function GoalSettingModal({ employee, open, onClose, onAISuggestions }: GoalSettingModalProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "technical",
    targetDate: "",
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
          title: `Master ${employee.skills[0]} Advanced Concepts`,
          description: `Based on ${employee.yearsOfExperience} years of experience, focus on advanced patterns and best practices.`,
          category: "technical",
          reasoning: "Aligns with current skill level and growth path"
        },
        {
          title: "Lead Technical Project",
          description: `With ${employee.yearsOfExperience} years of experience, leading a project will develop leadership skills.`,
          category: "leadership",
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Set Goals for {employee.name}</CardTitle>
              <CardDescription>{employee.position} • {employee.department}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
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
                    <SelectItem value="technical">Technical Skills</SelectItem>
                    <SelectItem value="leadership">Leadership</SelectItem>
                    <SelectItem value="communication">Communication</SelectItem>
                    <SelectItem value="business">Business Acumen</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
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
                  onClick={() => {
                    // TODO: Save draft
                    onClose();
                  }}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    // TODO: Publish goal
                    onClose();
                  }}
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Publish Goal
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

