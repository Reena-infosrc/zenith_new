import { useState, useEffect } from "react";
import { 
  Users, 
  Target, 
  Filter,
  Search,
  Plus,
  Edit,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Briefcase,
  X,
  Save
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { GoalSettingModal, Employee as GoalEmployee } from "./GoalSettingModal";
import { Progress } from "@/components/ui/progress";

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
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
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

                      <div className="flex gap-2 mt-4">
                        <Button
                          className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployee(employee);
                            setShowEmployeeDetail(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          View & Edit
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployee(employee);
                            setShowGoalModal(true);
                          }}
                        >
                          <Target className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Employee Detail View */}
      {showEmployeeDetail && selectedEmployee && (
        <EmployeeDetailView
          employee={selectedEmployee}
          goals={getGoalsForEmployee(selectedEmployee.id)}
          onClose={() => {
            setShowEmployeeDetail(false);
            setSelectedEmployee(null);
          }}
          onEditGoal={(goal) => {
            // TODO: Open edit modal
          }}
          onSetNewGoal={() => {
            setShowEmployeeDetail(false);
            setShowGoalModal(true);
          }}
        />
      )}

      {/* Goal Setting Modal */}
      {showGoalModal && selectedEmployee && (
        <GoalSettingModal
          employee={selectedEmployee as GoalEmployee}
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

// Employee Detail View Component for Admin
interface EmployeeDetailViewProps {
  employee: Employee;
  goals: Goal[];
  onClose: () => void;
  onEditGoal: (goal: Goal) => void;
  onSetNewGoal: () => void;
}

function EmployeeDetailView({ employee, goals, onClose, onEditGoal, onSetNewGoal }: EmployeeDetailViewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background/98 to-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <CardHeader className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/30">
                <AvatarImage src={employee.photoUrl} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                  {employee.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{employee.name}</CardTitle>
                <CardDescription className="text-base">{employee.position} • {employee.department}</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {/* Employee Info */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-background/50 border-border/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Years of Experience</p>
                <p className="text-xl font-semibold">{employee.yearsOfExperience} years</p>
              </CardContent>
            </Card>
            <Card className="bg-background/50 border-border/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Skills</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {employee.skills.slice(0, 3).map((skill, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Goals Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Current Goals</h3>
              <Button onClick={onSetNewGoal} className="bg-gradient-to-r from-primary to-primary/80">
                <Plus className="h-4 w-4 mr-2" />
                Set New Goal
              </Button>
            </div>

            {goals.length > 0 ? (
              <div className="space-y-3">
                {goals.map((goal) => (
                  <Card key={goal.id} className="bg-background/50 border-border/50 hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">{goal.title}</h4>
                            <Badge variant="outline">{goal.category}</Badge>
                            {goal.status === 'published' && (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Published</Badge>
                            )}
                            {goal.status === 'draft' && (
                              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Draft</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span><Calendar className="h-3 w-3 inline mr-1" />Due: {new Date(goal.targetDate).toLocaleDateString()}</span>
                            {goal.status === 'published' && (
                              <span>Completion: {goal.completion}%</span>
                            )}
                          </div>
                          {goal.status === 'published' && (
                            <div className="mt-3">
                              <Progress value={goal.completion} className="h-2" />
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditGoal(goal)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-background/50 border-border/50">
                <CardContent className="p-8 text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground mb-4">No goals set for this employee yet</p>
                  <Button onClick={onSetNewGoal} className="bg-gradient-to-r from-primary to-primary/80">
                    <Plus className="h-4 w-4 mr-2" />
                    Set First Goal
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

