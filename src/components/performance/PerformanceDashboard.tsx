import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Download,
  Calendar,
  Target,
  Star
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useEmployees } from "@/hooks/use-employees";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

interface DashboardStats {
  totalEmployees: number;
  cycleCompletionRate: number;
  averageRating: number;
  pendingReviews: number;
  completedReviews: number;
}

interface RatingDistribution {
  rating: number;
  count: number;
  percentage: number;
}

interface TeamPerformance {
  team: string;
  completionRate: number;
  averageRating: number;
  employees: number;
}

export function PerformanceDashboard() {
  const { employees, fetchEmployees } = useEmployees();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 150,
    cycleCompletionRate: 72,
    averageRating: 3.8,
    pendingReviews: 45,
    completedReviews: 105
  });

  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution[]>([
    { rating: 5, count: 25, percentage: 25 },
    { rating: 4, count: 45, percentage: 45 },
    { rating: 3, count: 30, percentage: 30 },
    { rating: 2, count: 5, percentage: 5 },
    { rating: 1, count: 0, percentage: 0 }
  ]);

  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);

  const [completionTrend, setCompletionTrend] = useState([
    { week: 'Week 1', completed: 20, pending: 130 },
    { week: 'Week 2', completed: 45, pending: 105 },
    { week: 'Week 3', completed: 75, pending: 75 },
    { week: 'Week 4', completed: 105, pending: 45 }
  ]);

  const [selectedCycle, setSelectedCycle] = useState('current');

  const COLORS = ['#4facfe', '#00f2fe', '#42b983', '#ffd93d', '#ff6b6b'];

  // Fetch employees on mount
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Calculate team performance by Director
  useEffect(() => {
    if (!employees || employees.length === 0) return;

    // Find all directors (employees with "Director" in their position)
    const directors = employees.filter(emp => {
      const position = emp.position?.toLowerCase() || '';
      return position.includes('director');
    });

    // Create a map for quick employee lookup
    const employeeMap = new Map(employees.map(emp => [emp.id, emp]));

    // Function to find the director an employee reports to (directly or indirectly)
    const findDirector = (employeeId: string, visited: Set<string> = new Set()): string | null => {
      if (visited.has(employeeId)) return null; // Prevent circular references
      visited.add(employeeId);

      const employee = employeeMap.get(employeeId);
      if (!employee || !employee.reporting_to) return null;

      const manager = employeeMap.get(employee.reporting_to);
      if (!manager) return null;

      // Check if manager is a director
      const managerPosition = manager.position?.toLowerCase() || '';
      if (managerPosition.includes('director')) {
        return manager.id;
      }

      // Recursively check up the chain
      return findDirector(manager.id, visited);
    };

    // Group employees by their director
    const teamsByDirector = new Map<string, { director: typeof directors[0]; employees: typeof employees }>();

    directors.forEach(director => {
      teamsByDirector.set(director.id, {
        director,
        employees: []
      });
    });

    // Assign employees to their directors
    employees.forEach(emp => {
      // Check if employee is a director themselves
      const position = emp.position?.toLowerCase() || '';
      if (position.includes('director')) {
        // Don't add directors to other directors' teams
        return;
      }

      // Find which director this employee reports to
      const directorId = findDirector(emp.id);
      if (directorId && teamsByDirector.has(directorId)) {
        teamsByDirector.get(directorId)!.employees.push(emp);
      }
    });

    // Calculate performance metrics for each director's team
    const teamPerformanceData: TeamPerformance[] = Array.from(teamsByDirector.entries())
      .map(([directorId, teamData]) => {
        const teamMembers = teamData.employees;
        const teamSize = teamMembers.length;

        // Mock performance calculations - replace with actual data from performance reviews
        // For now, using random values based on team size
        const baseCompletionRate = Math.max(60, 100 - (teamSize * 0.5));
        const baseRating = 3.5 + (Math.random() * 0.7); // Random rating between 3.5-4.2

        return {
          team: teamData.director.name,
          completionRate: Math.round(baseCompletionRate),
          averageRating: parseFloat(baseRating.toFixed(1)),
          employees: teamSize
        };
      })
      .filter(team => team.employees > 0) // Only show teams with members
      .sort((a, b) => b.completionRate - a.completionRate); // Sort by completion rate

    setTeamPerformance(teamPerformanceData.length > 0 ? teamPerformanceData : [
      // Fallback if no directors found
      { team: 'General Team', completionRate: 72, averageRating: 3.8, employees: employees.length }
    ]);
  }, [employees]);

  const handleExport = () => {
    // TODO: Export to CSV
    console.log('Exporting dashboard data...');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Performance Dashboard
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="w-[200px] bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Cycle</SelectItem>
              <SelectItem value="q1-2024">Q1 2024</SelectItem>
              <SelectItem value="q2-2024">Q2 2024</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cycle Completion</p>
                <p className="text-2xl font-bold">{stats.cycleCompletionRate}%</p>
                <Progress value={stats.cycleCompletionRate} className="mt-2 h-2" />
              </div>
              <CheckCircle2 className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Rating</p>
                <p className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs text-muted-foreground">out of 5.0</span>
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
                <p className="text-2xl font-bold">{stats.pendingReviews}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completedReviews}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  of {stats.totalEmployees} employees
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Trend */}
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Completion Trend
            </CardTitle>
            <CardDescription>Review completion progress over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={completionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="completed" fill="hsl(var(--primary))" name="Completed" />
                <Bar dataKey="pending" fill="hsl(var(--muted))" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rating Distribution */}
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Rating Distribution
            </CardTitle>
            <CardDescription>Distribution of performance ratings</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ratingDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ rating, percentage }) => `${rating}★ (${percentage}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {ratingDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Team Performance */}
      <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Performance
          </CardTitle>
          <CardDescription>Completion rates and average ratings by team</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamPerformance.map((team) => (
              <div key={team.team} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{team.team}</span>
                    <Badge variant="outline">{team.employees} employees</Badge>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-medium">{team.averageRating.toFixed(1)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{team.completionRate}%</span>
                </div>
                <Progress value={team.completionRate} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

