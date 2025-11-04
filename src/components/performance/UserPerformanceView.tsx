import { useState } from "react";
import {
  TrendingUp,
  Target,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  BarChart3,
  LineChart,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import { usePreserveScroll } from "@/hooks/use-preserve-scroll";

interface PerformanceGoal {
  id: string;
  title: string;
  category: string;
  completion: number;
  targetDate: string;
  status: 'in_progress' | 'completed' | 'pending';
  milestones: Milestone[];
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
}

interface GrowthData {
  month: string;
  performance: number;
  goalsCompleted: number;
}

export function UserPerformanceView() {
  const { preserveScroll } = usePreserveScroll();
  // Mock data - replace with API calls
  const goals: PerformanceGoal[] = [
    {
      id: "1",
      title: "Master React Performance Optimization",
      category: "Technical Skills",
      completion: 75,
      targetDate: "2024-06-30",
      status: "in_progress",
      milestones: [
        { id: "1", title: "Complete React optimization course", completed: true, dueDate: "2024-04-30" },
        { id: "2", title: "Implement performance best practices", completed: true, dueDate: "2024-05-15" },
        { id: "3", title: "Code review and optimization", completed: false, dueDate: "2024-06-15" },
        { id: "4", title: "Final assessment", completed: false, dueDate: "2024-06-30" }
      ]
    },
    {
      id: "2",
      title: "Lead Cross-functional Project",
      category: "Leadership",
      completion: 45,
      targetDate: "2024-07-31",
      status: "in_progress",
      milestones: [
        { id: "1", title: "Project kickoff meeting", completed: true, dueDate: "2024-04-01" },
        { id: "2", title: "Team alignment session", completed: true, dueDate: "2024-04-15" },
        { id: "3", title: "Mid-project review", completed: false, dueDate: "2024-06-15" },
        { id: "4", title: "Project delivery", completed: false, dueDate: "2024-07-31" }
      ]
    },
    {
      id: "3",
      title: "AWS Solutions Architect Certification",
      category: "Certification",
      completion: 100,
      targetDate: "2024-05-01",
      status: "completed",
      milestones: [
        { id: "1", title: "Study materials review", completed: true, dueDate: "2024-03-01" },
        { id: "2", title: "Practice exams", completed: true, dueDate: "2024-04-01" },
        { id: "3", title: "Certification exam", completed: true, dueDate: "2024-05-01" }
      ]
    }
  ];

  const growthData: GrowthData[] = [
    { month: "Jan", performance: 65, goalsCompleted: 1 },
    { month: "Feb", performance: 72, goalsCompleted: 2 },
    { month: "Mar", performance: 78, goalsCompleted: 2 },
    { month: "Apr", performance: 82, goalsCompleted: 3 },
    { month: "May", performance: 88, goalsCompleted: 4 },
    { month: "Jun", performance: 85, goalsCompleted: 3 }
  ];

  const categoryData = [
    { name: "Technical", value: 45, color: "#4facfe" },
    { name: "Leadership", value: 25, color: "#00f2fe" },
    { name: "Certification", value: 30, color: "#42b983" }
  ];

  const overallCompletion = goals.length > 0
    ? Math.round(goals.reduce((sum, goal) => sum + goal.completion, 0) / goals.length)
    : 0;

  const completedGoals = goals.filter(g => g.status === 'completed').length;
  const inProgressGoals = goals.filter(g => g.status === 'in_progress').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'technical skills':
        return <Target className="h-4 w-4" />;
      case 'leadership':
        return <Award className="h-4 w-4" />;
      case 'certification':
        return <Award className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overall Progress</p>
                <p className="text-3xl font-bold mt-2">{overallCompletion}%</p>
                <div className="mt-2">
                  <Progress value={overallCompletion} className="h-2" />
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
                <p className="text-3xl font-bold mt-2">{inProgressGoals}</p>
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
                <p className="text-3xl font-bold mt-2">{completedGoals}</p>
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
                <p className="text-sm font-medium text-muted-foreground">Growth Rate</p>
                <p className="text-3xl font-bold mt-2">+12%</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                  <ArrowUpRight className="h-3 w-3" />
                  <span>vs last month</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4" onValueChange={() => {
        preserveScroll();
      }}>
        <TabsList className="bg-muted/50 backdrop-blur-sm">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="goals">Goals & Timeline</TabsTrigger>
          <TabsTrigger value="growth">Growth Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Performance Growth Chart */}
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
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

            {/* Goals by Category */}
            <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
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

        <TabsContent value="goals" className="space-y-4">
          <div className="space-y-4">
            {goals.map((goal) => (
              <Card
                key={goal.id}
                className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getCategoryIcon(goal.category)}
                        <CardTitle className="text-xl">{goal.title}</CardTitle>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="outline">{goal.category}</Badge>
                        {getStatusBadge(goal.status)}
                        <span className="text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3 inline mr-1" />
                          Due: {new Date(goal.targetDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm font-semibold text-primary">{goal.completion}%</span>
                    </div>
                    <Progress value={goal.completion} className="h-3" />
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-3">Milestones</h4>
                    <div className="space-y-2">
                      {goal.milestones.map((milestone, idx) => (
                        <div
                          key={milestone.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border",
                            milestone.completed
                              ? "bg-green-500/10 border-green-500/20"
                              : "bg-muted/30 border-border"
                          )}
                        >
                          <div className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0",
                            milestone.completed
                              ? "bg-green-500 text-white"
                              : "bg-muted border-2 border-border"
                          )}>
                            {milestone.completed ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <span className="text-xs font-semibold">{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={cn(
                              "text-sm font-medium",
                              milestone.completed && "line-through text-muted-foreground"
                            )}>
                              {milestone.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(milestone.dueDate).toLocaleDateString()}
                            </p>
                          </div>
                          {milestone.completed && (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              Completed
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="growth" className="space-y-4">
          <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-sm border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
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
    </div>
  );
}

