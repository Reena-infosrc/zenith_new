import { useState, useEffect } from "react";
import {
  Users, 
  Target, 
  Search,
  Plus,
  TrendingUp,
  CheckCircle2,
  Clock,
  Calendar,
  Briefcase,
  Eye,
  Edit,
  FileText,
  MessageSquare,
  CheckCircle,
  Bell
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GoalSettingModal, Employee as GoalEmployee } from "./GoalSettingModal";
import { ReviewForms } from "./ReviewForms";
import { ContinuousFeedback } from "./ContinuousFeedback";
import { ManagerSignOff } from "./ManagerSignOff";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";
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

interface Employee {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  yearsOfExperience: number;
  skills: string[];
  photoUrl?: string;
  reporting_to?: string;
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

interface MyGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  status: 'in_progress' | 'completed' | 'pending';
  completion: number;
  setBy: string;
}

export function ManagerPerformanceView() {
  const { user } = useAuth();
  const [directReports, setDirectReports] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [myGoals, setMyGoals] = useState<MyGoal[]>([]);
  const [employeeGoals, setEmployeeGoals] = useState<Map<string, Goal[]>>(new Map());
  const [searchTerm, setSearchTerm] = useState("");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [viewMode, setViewMode] = useState<'my-team' | 'my-goals' | 'reviews' | 'feedback' | 'signoff'>('my-team');
  const { preserveScroll } = usePreserveScroll();

  // Mock growth data for manager's own goals
  const growthData = [
    { month: "Jan", performance: 65, goalsCompleted: 1 },
    { month: "Feb", performance: 72, goalsCompleted: 2 },
    { month: "Mar", performance: 78, goalsCompleted: 2 },
    { month: "Apr", performance: 82, goalsCompleted: 3 },
    { month: "May", performance: 88, goalsCompleted: 4 },
    { month: "Jun", performance: 85, goalsCompleted: 3 }
  ];

  const categoryData = [
    { name: "Leadership", value: 40, color: "#4facfe" },
    { name: "Technical", value: 35, color: "#00f2fe" },
    { name: "Certification", value: 25, color: "#42b983" }
  ];

  // Mock data - replace with API calls
  useEffect(() => {
    // Get direct reports (employees who report to current user)
    setDirectReports([
      {
        id: "2",
        name: "Alice Johnson",
        email: "alice.johnson@company.com",
        position: "Junior Developer",
        department: "Engineering",
        yearsOfExperience: 1,
        skills: ["JavaScript", "React"],
        reporting_to: user?.id || "1"
      },
      {
        id: "3",
        name: "Bob Smith",
        email: "bob.smith@company.com",
        position: "QA Engineer",
        department: "Engineering",
        yearsOfExperience: 2,
        skills: ["Testing", "Selenium"],
        reporting_to: user?.id || "1"
      }
    ]);

    // Get goals set for the manager (by their manager/admin)
    setMyGoals([
      {
        id: "1",
        title: "Improve Team Leadership Skills",
        description: "Focus on developing leadership capabilities and team management",
        category: "Leadership",
        targetDate: "2024-08-31",
        status: "in_progress",
        completion: 60,
        setBy: "Director"
      },
      {
        id: "2",
        title: "Complete Project Management Certification",
        description: "Get PMP certification to enhance project management skills",
        category: "Certification",
        targetDate: "2024-07-15",
        status: "in_progress",
        completion: 40,
        setBy: "Director"
      }
    ]);
  }, [user]);

  const filteredReports = directReports.filter(emp => {
    return emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.position.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getGoalsForEmployee = (employeeId: string) => {
    return employeeGoals.get(employeeId) || [];
  };

  const getGoalsSummary = (employeeId: string) => {
    const goals = getGoalsForEmployee(employeeId);
    const published = goals.filter(g => g.status === 'published').length;
    const drafts = goals.filter(g => g.status === 'draft').length;
    return { total: goals.length, published, drafts };
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Direct Reports</p>
                <p className="text-3xl font-bold mt-2">{directReports.length}</p>
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
                  {Array.from(employeeGoals.values()).flat().filter(g => g.status === 'published').length}
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
                <p className="text-sm font-medium text-muted-foreground">My Goals</p>
                <p className="text-3xl font-bold mt-2">{myGoals.length}</p>
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
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-3xl font-bold mt-2">
                  {myGoals.filter(g => g.status === 'in_progress').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => {
        preserveScroll();
        setViewMode(v as any);
      }} className="space-y-4">
        <TabsList className="bg-muted/50 backdrop-blur-sm flex-wrap">
          <TabsTrigger value="my-team">
            <Users className="h-4 w-4 mr-2" />
            My Team
          </TabsTrigger>
          <TabsTrigger value="my-goals">
            <Target className="h-4 w-4 mr-2" />
            My Goals
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <FileText className="h-4 w-4 mr-2" />
            Reviews
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <MessageSquare className="h-4 w-4 mr-2" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="signoff">
            <CheckCircle className="h-4 w-4 mr-2" />
            Sign-Off
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-team" className="space-y-4">
          {/* Search */}
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-background/50"
                />
              </div>
            </CardContent>
          </Card>

          {/* Team Members Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((employee) => {
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
                            setShowGoalModal(true);
                          }}
                        >
                          <Target className="h-4 w-4 mr-2" />
                          Set Goals
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmployee(employee);
                            // TODO: Open view mode
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredReports.length === 0 && (
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardContent className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No direct reports found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="my-goals" className="space-y-4">
          <Tabs defaultValue="overview" className="space-y-4" onValueChange={() => {
            preserveScroll();
          }}>
            <TabsList className="bg-muted/50 backdrop-blur-sm">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="goals-timeline">Goals & Timeline</TabsTrigger>
              <TabsTrigger value="growth">Growth Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Summary Cards for Manager's Own Goals */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                        <p className="text-3xl font-bold mt-2">
                          {myGoals.length > 0
                            ? Math.round(myGoals.reduce((sum, goal) => sum + goal.completion, 0) / myGoals.length)
                            : 0}%
                        </p>
                        <div className="mt-2">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${myGoals.length > 0
                                  ? Math.round(myGoals.reduce((sum, goal) => sum + goal.completion, 0) / myGoals.length)
                                  : 0}%`
                              }}
                            />
                          </div>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.filter(g => g.status === 'in_progress').length}</p>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.filter(g => g.status === 'completed').length}</p>
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
                        <p className="text-3xl font-bold mt-2">{myGoals.length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Assigned to you</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-purple-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Performance Trend
                    </CardTitle>
                    <CardDescription>6-month performance progression</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={growthData}>
                        <defs>
                          <linearGradient id="colorPerformance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4facfe" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4facfe" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                        <YAxis stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="performance"
                          stroke="#4facfe"
                          strokeWidth={2}
                          fill="url(#colorPerformance)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Goals by Category
                    </CardTitle>
                    <CardDescription>Distribution of your goals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="goals-timeline" className="space-y-4">
              {/* Goals List with Timeline */}
              <div className="space-y-4">
                {myGoals.map((goal) => (
                  <Card
                    key={goal.id}
                    className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl mb-2">{goal.title}</CardTitle>
                          <CardDescription>{goal.description}</CardDescription>
                          <div className="flex items-center gap-3 mt-3">
                            <Badge variant="outline">{goal.category}</Badge>
                            {goal.status === 'in_progress' && (
                              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                                <Clock className="h-3 w-3 mr-1" />In Progress
                              </Badge>
                            )}
                            {goal.status === 'completed' && (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Completed
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3 inline mr-1" />
                              Due: {new Date(goal.targetDate).toLocaleDateString()}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              Set by: {goal.setBy}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Progress</span>
                          <span className="text-sm font-semibold text-primary">{goal.completion}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-primary to-primary/80 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${goal.completion}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {myGoals.length === 0 && (
                <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                  <CardContent className="p-12 text-center">
                    <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No goals set for you yet</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="growth" className="space-y-4">
              <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Growth Timeline
                  </CardTitle>
                  <CardDescription>Track your performance journey</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <RechartsLineChart data={growthData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="performance"
                        stroke="#4facfe"
                        strokeWidth={3}
                        name="Performance Score"
                        dot={{ fill: '#4facfe', r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="goalsCompleted"
                        stroke="#42b983"
                        strokeWidth={3}
                        name="Goals Completed"
                        dot={{ fill: '#42b983', r: 5 }}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <ReviewForms />
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <ContinuousFeedback />
        </TabsContent>

        <TabsContent value="signoff" className="space-y-4">
          <ManagerSignOff />
        </TabsContent>
      </Tabs>

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

