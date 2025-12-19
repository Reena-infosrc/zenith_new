import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
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
import { authenticatedFetch } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";
import { useToast } from "@/hooks/use-toast";
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

interface DashboardCycle {
  id: string;
  year: string;
  name: string;
  status: string;
}

export function PerformanceDashboard() {
  const { employees, fetchEmployees } = useEmployees();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    cycleCompletionRate: 0,
    averageRating: 0,
    pendingReviews: 0,
    completedReviews: 0
  });

  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution[]>([]);
  const [loadingRatingDistribution, setLoadingRatingDistribution] = useState(false);

  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [loadingTeamPerformance, setLoadingTeamPerformance] = useState(false);

  const [completionTrend, setCompletionTrend] = useState<Array<{week: string, completed: number, pending: number}>>([]);
  const [loadingCompletionTrend, setLoadingCompletionTrend] = useState(false);

  // Review cycles for dashboard filter
  const [dashboardCycles, setDashboardCycles] = useState<DashboardCycle[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState('current');
  const [exporting, setExporting] = useState(false);

  const COLORS = ['#4facfe', '#00f2fe', '#42b983', '#ffd93d', '#ff6b6b'];

  // Track if stats have been fetched to prevent multiple calls
  const statsFetchedRef = useRef(false);

  // Fetch dashboard stats - memoized to prevent recreation
  const fetchDashboardStats = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (statsFetchedRef.current) {
      return;
    }
    
    try {
      statsFetchedRef.current = true;
      setLoading(true);
      const response = await authenticatedFetch(
        `${API_BASE_URL}/reviews/dashboard/stats`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats');
      }
      
      const data = await response.json();
      setStats({
        totalEmployees: data.totalEmployees || 0,
        cycleCompletionRate: data.cycleCompletionRate || 0,
        averageRating: data.averageRating || 0,
        pendingReviews: data.pendingReviews || 0,
        completedReviews: data.completedReviews || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard statistics",
        variant: "destructive"
      });
      statsFetchedRef.current = false; // Reset on error to allow retry
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch completion trend data
  const fetchCompletionTrend = useCallback(async () => {
    try {
      setLoadingCompletionTrend(true);
      const cycleYear = selectedCycle && selectedCycle !== 'current' && selectedCycle !== 'none' && selectedCycle !== 'loading' 
        ? selectedCycle 
        : dashboardCycles[0]?.year;
      
      const url = cycleYear 
        ? `${API_BASE_URL}/reviews/dashboard/completion-trend?cycleYear=${encodeURIComponent(cycleYear)}`
        : `${API_BASE_URL}/reviews/dashboard/completion-trend`;
      
      const response = await authenticatedFetch(url, { method: 'GET' });
      
      if (!response.ok) {
        throw new Error('Failed to fetch completion trend');
      }
      
      const data = await response.json();
      setCompletionTrend(data || []);
    } catch (error) {
      console.error('Error fetching completion trend:', error);
      toast({
        title: "Error",
        description: "Failed to load completion trend data",
        variant: "destructive"
      });
      // Set empty array on error
      setCompletionTrend([]);
    } finally {
      setLoadingCompletionTrend(false);
    }
  }, [selectedCycle, dashboardCycles, toast]);

  // Fetch rating distribution data
  const fetchRatingDistribution = useCallback(async () => {
    try {
      setLoadingRatingDistribution(true);
      const cycleYear = selectedCycle && selectedCycle !== 'current' && selectedCycle !== 'none' && selectedCycle !== 'loading' 
        ? selectedCycle 
        : dashboardCycles[0]?.year;
      
      const url = cycleYear 
        ? `${API_BASE_URL}/reviews/dashboard/rating-distribution?cycleYear=${encodeURIComponent(cycleYear)}`
        : `${API_BASE_URL}/reviews/dashboard/rating-distribution`;
      
      const response = await authenticatedFetch(url, { method: 'GET' });
      
      if (!response.ok) {
        throw new Error('Failed to fetch rating distribution');
      }
      
      const data = await response.json();
      setRatingDistribution(data || []);
    } catch (error) {
      console.error('Error fetching rating distribution:', error);
      toast({
        title: "Error",
        description: "Failed to load rating distribution data",
        variant: "destructive"
      });
      // Set empty array on error
      setRatingDistribution([]);
    } finally {
      setLoadingRatingDistribution(false);
    }
  }, [selectedCycle, dashboardCycles, toast]);

  // Fetch employees and dashboard stats on mount - only once
  useEffect(() => {
    fetchEmployees();
    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Fetch chart data when cycles are loaded or cycle selection changes
  useEffect(() => {
    if (!loadingCycles && dashboardCycles.length > 0) {
      fetchCompletionTrend();
      fetchRatingDistribution();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCycles, dashboardCycles.length, selectedCycle, fetchCompletionTrend, fetchRatingDistribution]);

  // Fetch review cycles and keep only currently active ones for the dropdown
  useEffect(() => {
    const fetchCyclesForDashboard = async () => {
      try {
        setLoadingCycles(true);
        const response = await authenticatedFetch(
          `${API_BASE_URL}/reviews/cycles`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error('Failed to load review cycles');
        }

        const apiCycles = await response.json();

        // Map API response and normalize status so "open" becomes "active"
        const mapped: DashboardCycle[] = (apiCycles || []).map((cycle: any) => ({
          id: cycle.cycleId || cycle.year,
          year: cycle.year,
          name: cycle.name || `${cycle.year} Annual Performance Review`,
          status: cycle.status === 'open' ? 'active' : (cycle.status || 'draft')
        }));

        // Only keep currently active cycles for the dashboard dropdown, sorted by year (most recent first)
        const activeCycles = mapped
          .filter(cycle => cycle.status === 'active')
          .sort((a, b) => b.year.localeCompare(a.year));

        setDashboardCycles(activeCycles);

        // Ensure the selected value is valid
        if (activeCycles.length === 0) {
          setSelectedCycle('none');
        } else if (selectedCycle === 'none' || !selectedCycle) {
          setSelectedCycle('current');
        }
      } catch (error) {
        console.error('Error fetching review cycles for dashboard:', error);
        toast({
          title: "Error",
          description: "Failed to load review cycles for dashboard",
          variant: "destructive"
        });
      } finally {
        setLoadingCycles(false);
      }
    };

    fetchCyclesForDashboard();
    // We only depend on toast here; selectedCycle is managed inside
  }, [toast]);

  // Fetch team performance data
  const fetchTeamPerformance = useCallback(async () => {
    try {
      setLoadingTeamPerformance(true);
      const cycleYear = selectedCycle && selectedCycle !== 'current' && selectedCycle !== 'none' && selectedCycle !== 'loading' 
        ? selectedCycle 
        : dashboardCycles[0]?.year;
      
      const url = cycleYear 
        ? `${API_BASE_URL}/reviews/dashboard/team-performance?cycleYear=${encodeURIComponent(cycleYear)}`
        : `${API_BASE_URL}/reviews/dashboard/team-performance`;
      
      const response = await authenticatedFetch(url, { method: 'GET' });
      
      if (!response.ok) {
        throw new Error('Failed to fetch team performance');
      }
      
      const data = await response.json();
      setTeamPerformance(data || []);
    } catch (error) {
      console.error('Error fetching team performance:', error);
      toast({
        title: "Error",
        description: "Failed to load team performance data",
        variant: "destructive"
      });
      // Set empty array on error
      setTeamPerformance([]);
    } finally {
      setLoadingTeamPerformance(false);
    }
  }, [selectedCycle, dashboardCycles, toast]);

  // Fetch team performance when cycles are loaded or cycle selection changes
  useEffect(() => {
    if (!loadingCycles && dashboardCycles.length > 0) {
      fetchTeamPerformance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCycles, dashboardCycles.length, selectedCycle, fetchTeamPerformance]);

  const handleExport = async () => {
    try {
      if (loadingCycles && dashboardCycles.length === 0) {
        toast({
          title: "Please wait",
          description: "Review cycles are still loading",
          variant: "default"
        });
        return;
      }

      // Determine which cycle year to export
      let cycleYear: string | null = null;
      if (selectedCycle === 'current') {
        const currentCycle = dashboardCycles[0];
        if (currentCycle) {
          cycleYear = currentCycle.year;
        }
      } else if (selectedCycle && selectedCycle !== 'none' && selectedCycle !== 'loading') {
        cycleYear = selectedCycle;
      }

      if (!cycleYear) {
        toast({
          title: "Select cycle",
          description: "Please select an active review cycle to export",
          variant: "destructive"
        });
        return;
      }

      setExporting(true);

      const response = await authenticatedFetch(
        `${API_BASE_URL}/reviews/dashboard/export?cycleYear=${encodeURIComponent(cycleYear)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('Failed to export CSV:', response.status, response.statusText, errorText);
        toast({
          title: "Export failed",
          description: "Unable to export CSV for the selected cycle",
          variant: "destructive"
        });
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];

      link.href = url;
      link.download = `performance-dashboard-${cycleYear}-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export started",
        description: `Downloading CSV for cycle ${cycleYear}`,
      });
    } catch (error) {
      console.error('Error exporting dashboard CSV:', error);
      toast({
        title: "Export failed",
        description: "An unexpected error occurred while exporting CSV",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
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
              <SelectValue placeholder="Select cycle" />
            </SelectTrigger>
            <SelectContent>
              {loadingCycles ? (
                <SelectItem value="loading" disabled>
                  Loading cycles...
                </SelectItem>
              ) : dashboardCycles.length === 0 ? (
                <SelectItem value="none" disabled>
                  No active cycles
                </SelectItem>
              ) : (
                <>
                  <SelectItem value="current">Current Cycle</SelectItem>
                  {dashboardCycles.map((cycle) => (
                    <SelectItem key={cycle.id} value={cycle.year}>
                      {cycle.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || (loadingCycles && dashboardCycles.length === 0)}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cycle Completion</p>
                <p className="text-2xl font-bold">
                  {loading ? '...' : `${stats.cycleCompletionRate}%`}
                </p>
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
                <p className="text-2xl font-bold">
                  {loading ? '...' : stats.averageRating.toFixed(1)}
                </p>
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
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">
                  {loading ? '...' : stats.completedReviews}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  of {loading ? '...' : stats.totalEmployees} employees
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
            {loadingCompletionTrend ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">Loading completion trend...</p>
              </div>
            ) : completionTrend.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">No completion trend data available</p>
              </div>
            ) : (
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
            )}
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
            {loadingRatingDistribution ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">Loading rating distribution...</p>
              </div>
            ) : ratingDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">No rating distribution data available</p>
              </div>
            ) : (
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
            )}
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
          {loadingTeamPerformance ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading team performance...</p>
            </div>
          ) : teamPerformance.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">No team performance data available</p>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

