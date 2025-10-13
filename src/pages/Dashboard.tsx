import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart2, 
  Users, 
  MapPin, 
  Building, 
  UserCheck, 
  TrendingUp,
  Filter,
  Eye,
  Download,
  ArrowLeft
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, ComposedChart } from 'recharts';
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  employeeId?: string;
  name: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  mobile: string;
  employment_category: string;
  gender: string;
  employee_status: string;
  account: string;
  is_leader: string;
  location: string;
  date_of_birth: string;
  date_of_joining: string;
  photo_url: string;
  expertise?: string;
  created_at: string;
  status?: string;
}

interface DashboardData {
  total_employees: number;
  monthly_headcount: Array<{ month: string; count: number; month_number: number }>;
  by_account: { [key: string]: number };
  by_location: { [key: string]: number };
  by_employee_status: { [key: string]: number };
  by_employment_category: { [key: string]: number };
  by_is_leader: { [key: string]: number };
  by_expertise: { [key: string]: number };
  by_department: { [key: string]: number };
  by_gender: { [key: string]: number };
  by_status: { [key: string]: number };
  employees: Employee[];
}

interface ChartDataPoint {
  month: string;
  count: number;
  month_number: number;
  employees?: Employee[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Dashboard");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const [selectedDataPoint, setSelectedDataPoint] = useState<ChartDataPoint | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const { toast } = useToast();

  // CSV Export function for modal data
  const exportModalDataToCSV = () => {
    try {
      if (filteredEmployees.length === 0) {
        toast({
          title: "No Data to Export",
          description: "There are no employees to export.",
          variant: "destructive",
        });
        return;
      }
      
      // Define CSV headers
      const headers = [
        "Name",
        "Position", 
        "Department",
        "Account",
        "Location",
        "Work Type",
        "Status",
        "Is Leader",
        "Employee ID",
        "Email",
        "Phone",
        "Date of Joining"
      ];
      
      // Convert employee data to CSV rows
      const csvRows = [
        headers.join(","), // Header row
        ...filteredEmployees.map(employee => [
          `"${employee.name || "N/A"}"`, // Wrap in quotes to handle commas
          `"${employee.position || "N/A"}"`,
          `"${employee.department || "N/A"}"`,
          `"${employee.account || "N/A"}"`,
          `"${employee.location || "N/A"}"`,
          `"${employee.employee_status || "N/A"}"`,
          `"${employee.status || "active"}"`,
          `"${employee.is_leader || "N/A"}"`,
          employee.employeeId || "N/A",
          employee.email || "N/A",
          employee.phone || "N/A",
          employee.date_of_joining || "N/A"
        ].join(","))
      ];
      
      // Create CSV content
      const csvContent = csvRows.join("\n");
      
      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      
      // Generate filename with timestamp and context
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      const context = selectedDataPoint?.month || "employees";
      const filename = `employees_${context.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.csv`;
      link.setAttribute("download", filename);
      
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export Successful",
        description: `${filteredEmployees.length} employees exported to CSV successfully.`,
      });
    } catch (error) {
      console.error("CSV Export Error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export employees data. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Check cache first
      const cachedData = apiCache.get(CACHE_KEYS.DASHBOARD);
      if (cachedData) {
        setDashboardData(cachedData);
        setLoading(false);
        return;
      }
      
      const response = await fetch('https://zenith-hr-api.apps.infoservices.com/api/employees-dashboard/');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Transform employee data to match frontend interface
      if (data.employees) {
        data.employees = data.employees.map((emp: any) => ({
          ...emp,
          employeeId: emp.employee_id || emp.employeeId || "",
          id: emp.id || "temp-" + Math.random().toString(36).substr(2, 9)
        }));
      }
      
      setDashboardData(data);
      
      // Cache the data
      apiCache.set(CACHE_KEYS.DASHBOARD, data, 5 * 60 * 1000); // Cache for 5 minutes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to data
  useEffect(() => {
    if (dashboardData) {
      applyFilters();
    }
  }, [dashboardData, selectedFilter, filterValue]);

  const applyFilters = () => {
    if (!dashboardData) return;

    // Calculate monthly headcount data for multi-line chart
    const monthly_headcount = [];
    const current_year = new Date().getFullYear();
    
    // Get all unique categories for the selected filter
    const categories = new Set<string>();
    dashboardData.employees.forEach(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        categories.add(fieldValue);
      }
    });
    
    // If no filter selected or no categories, show total count
    if (selectedFilter === "all" || categories.size === 0) {
      for (let month = 1; month <= 12; month++) {
        const month_date = new Date(current_year, month - 1, 1);
        const end_date = new Date(current_year, month, 1);
        
        let count = 0;
        for (const emp of dashboardData.employees) {
          const join_date_str = emp.date_of_joining || emp.created_at;
          if (join_date_str) {
            try {
              const join_date = new Date(join_date_str);
              if (join_date <= end_date) {
                count += 1;
              }
            } catch {
              count += 1;
            }
          }
        }
        
        monthly_headcount.push({
          month: month_date.toLocaleDateString('en-US', { month: 'short' }),
          count,
          month_number: month,
          employees: dashboardData.employees
        });
      }
    } else {
      // Generate data for each category
      for (let month = 1; month <= 12; month++) {
        const month_date = new Date(current_year, month - 1, 1);
        const end_date = new Date(current_year, month, 1);
        
        const monthData: any = {
          month: month_date.toLocaleDateString('en-US', { month: 'short' }),
          month_number: month,
          employees: []
        };
        
        // Calculate count for each category
        categories.forEach(category => {
          let count = 0;
          const categoryEmployees: Employee[] = [];
          
          for (const emp of dashboardData.employees) {
            const fieldValue = emp[selectedFilter as keyof Employee];
            if (fieldValue === category) {
              const join_date_str = emp.date_of_joining || emp.created_at;
              if (join_date_str) {
                try {
                  const join_date = new Date(join_date_str);
                  if (join_date <= end_date) {
                    count += 1;
                    categoryEmployees.push(emp);
                  }
                } catch {
                  count += 1;
                  categoryEmployees.push(emp);
                }
              }
            }
          }
          
          monthData[category] = count;
          monthData[`${category}_employees`] = categoryEmployees;
        });
        
        monthly_headcount.push(monthData);
      }
    }

    setChartData(monthly_headcount);
  };

  // Calculate monthly new joiners for the last 12 months
  const getMonthlyNewJoinersData = () => {
    if (!dashboardData) return [];

    const now = new Date();
    const monthlyData = [];
    
    // Generate data for the last 12 months
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const newJoiners = dashboardData.employees.filter(emp => {
        const joinDateStr = emp.date_of_joining || emp.created_at;
        if (!joinDateStr) return false;
        
        try {
          const joinDate = new Date(joinDateStr);
          return joinDate >= monthStart && joinDate <= monthEnd;
        } catch {
          return false;
        }
      });

      monthlyData.push({
        month: targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        monthShort: targetDate.toLocaleDateString('en-US', { month: 'short' }),
        newJoiners: newJoiners.length,
        employees: newJoiners
      });
    }

    return monthlyData;
  };

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // Get categories for the selected filter
  const getChartCategories = () => {
    if (!dashboardData || selectedFilter === "all") {
      return [];
    }

    const categories = new Set<string>();
    dashboardData.employees.forEach(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        categories.add(fieldValue);
      }
    });

    return Array.from(categories).sort();
  };

  // Get colors for different lines
  const getLineColors = () => {
    const colors = [
      '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', 
      '#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#0000ff'
    ];
    return colors;
  };

  // Generate stacked column data for monthly hires by category
  const getStackedColumnData = () => {
    if (!dashboardData || selectedFilter === "all") {
      return [];
    }

    const current_year = new Date().getFullYear();
    const categories = new Set<string>();
    
    // Get all unique categories for the selected filter
    dashboardData.employees.forEach(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        categories.add(fieldValue);
      }
    });

    const monthlyData = [];
    
    for (let month = 1; month <= 12; month++) {
      const month_date = new Date(current_year, month - 1, 1);
      const monthKey = month_date.toISOString().slice(0, 7); // YYYY-MM format
      const monthName = month_date.toLocaleDateString('en-US', { month: 'short' });
      
      const monthData: any = {
        month: monthKey,
        monthName: monthName,
        month_number: month,
        total: 0
      };
      
      // Calculate hires for each category in this month
      categories.forEach(category => {
        let hires = 0;
        const categoryEmployees: Employee[] = [];
        
        for (const emp of dashboardData.employees) {
          const fieldValue = emp[selectedFilter as keyof Employee];
          if (fieldValue === category) {
            const join_date_str = emp.date_of_joining || emp.created_at;
            if (join_date_str) {
              try {
                const join_date = new Date(join_date_str);
                const join_month = join_date.toISOString().slice(0, 7);
                if (join_month === monthKey) {
                  hires += 1;
                  categoryEmployees.push(emp);
                }
              } catch {
                // If date parsing fails, count as current month
                hires += 1;
                categoryEmployees.push(emp);
              }
            }
          }
        }
        
        monthData[category] = hires;
        monthData[`${category}_employees`] = categoryEmployees;
        monthData.total += hires;
      });
      
      monthlyData.push(monthData);
    }

    return monthlyData;
  };

  // Get dynamic chart title based on selected filter
  const getChartTitle = () => {
    if (selectedFilter === "all") {
      return "Monthly Headcount Trend - All Employee filter";
    }
    return `Monthly Headcount Trend - ${getFilterLabel(selectedFilter)}`;
  };

  // Get filtered employees based on selected filter
  const getFilteredEmployees = () => {
    if (!dashboardData || selectedFilter === "all") {
      return dashboardData?.employees || [];
    }

    return dashboardData.employees.filter(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      return fieldValue && fieldValue !== "Unknown";
    });
  };

  // Get category distribution for filtered data
  const getCategoryDistribution = () => {
    if (!dashboardData || selectedFilter === "all") {
      return null;
    }

    const filteredEmployees = getFilteredEmployees();
    const distribution: { [key: string]: number } = {};

    filteredEmployees.forEach(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        distribution[fieldValue] = (distribution[fieldValue] || 0) + 1;
      }
    });

    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  };

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const clickedData = data.activePayload[0].payload;
      
      // Check if it's from the new joiners chart
      if (clickedData.monthShort && clickedData.newJoiners !== undefined) {
        // New joiners chart - show employees who joined in that month
        setSelectedDataPoint({
          month: clickedData.month,
          count: clickedData.newJoiners,
          month_number: 0, // Not used for new joiners
          employees: clickedData.employees || []
        });
        setFilteredEmployees(clickedData.employees || []);
        setShowModal(true);
      } else if (clickedData.month && selectedFilter === "all") {
        // Monthly trend chart - show all employees
        setSelectedDataPoint(clickedData as ChartDataPoint);
        setFilteredEmployees(clickedData.employees || []);
        setShowModal(true);
      } else if (clickedData.month && selectedFilter !== "all" && !clickedData.monthName) {
        // Monthly trend chart (not stacked column) - show employees for the clicked category
        const categoryName = data.activePayload[0].dataKey;
        const categoryEmployees = clickedData[`${categoryName}_employees`] || [];
        
        setSelectedDataPoint({
          month: `${clickedData.month} - ${categoryName}`,
          count: clickedData[categoryName] || 0,
          month_number: clickedData.month_number,
          employees: categoryEmployees
        });
        setFilteredEmployees(categoryEmployees);
        setShowModal(true);
      } else if (!clickedData.month) {
        // Other charts - show employees for the clicked category
        const categoryName = clickedData.name;
        const categoryEmployees = getFilteredEmployees().filter(emp => {
          const fieldValue = emp[selectedFilter as keyof Employee];
          return fieldValue === categoryName;
        });
        
        setSelectedDataPoint({
          month: `${getFilterLabel(selectedFilter)}: ${categoryName}`,
          count: clickedData.value,
          month_number: 0,
          employees: categoryEmployees
        });
        setFilteredEmployees(categoryEmployees);
        setShowModal(true);
      }
      // Note: Stacked column chart clicks are handled by individual Bar onClick handlers
    }
  };


  const getFilterLabel = (filter: string) => {
    const labels: { [key: string]: string } = {
      account: "Account",
      location: "Location", 
      employee_status: "Work Type",
      employment_category: "Employment Category",
      is_leader: "Is Leader",
      position: "Position",
      department: "Department",
      gender: "Gender",
      status: "Status"
    };
    return labels[filter] || filter;
  };

  const prepareChartData = (data: { [key: string]: number }) => {
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error || 'Failed to load dashboard data'}</p>
          <Button onClick={fetchDashboardData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header onMenuToggle={toggleSidebar} />
      
      {/* Main Layout */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Left Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-20 w-64 bg-background border-r border-border transform transition-transform duration-300 ease-in-out pt-16 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:z-0`}>
          <SidebarContent 
            activeModule={activeModule} 
            onModuleChange={setActiveModule} 
          />
        </aside>
        
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/directory')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Directory
              </Button>
            </div>
            <h1 className="text-3xl font-bold mb-2">Employee Analytics Dashboard</h1>
            <p className="text-muted-foreground">Comprehensive insights into your workforce data</p>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filter by:</span>
            </div>
            <Select value={selectedFilter} onValueChange={(value) => {
              setSelectedFilter(value);
              setFilterValue("all");
            }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="location">Location</SelectItem>
                <SelectItem value="employee_status">Work Type</SelectItem>
                <SelectItem value="employment_category">Employment Category</SelectItem>
                <SelectItem value="is_leader">Is Leader</SelectItem>
                <SelectItem value="expertise">Expertise</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="gender">Gender</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData.total_employees}</div>
                <p className="text-xs text-muted-foreground">
                  Active workforce
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leaders</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData.by_is_leader.Yes || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData.total_employees > 0 ? ((dashboardData.by_is_leader.Yes || 0) / dashboardData.total_employees * 100).toFixed(1) : 0}% of workforce
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Locations</CardTitle>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.keys(dashboardData.by_location).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Different locations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Departments</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Object.keys(dashboardData.by_department).length}</div>
                <p className="text-xs text-muted-foreground">
                  Active departments
                </p>
              </CardContent>
            </Card>
          </div>

          {/* New Joiners Chart - Last 12 Months (Only for All Employees) */}
          {selectedFilter === "all" && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  New Joiners - Last 12 Months
                </CardTitle>
                <CardDescription>
                  Monthly breakdown of new employee joiners over the past year
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getMonthlyNewJoinersData()} onClick={handleChartClick}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="monthShort" 
                        tick={{ fontSize: 12 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload[0]) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                                <p className="font-medium">{`Month: ${data.month}`}</p>
                                <p className="text-primary">{`New Joiners: ${payload[0].value}`}</p>
                                {data.employees && data.employees.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Click to view employee details
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="newJoiners" 
                        fill="#0ea5e9"
                        radius={[4, 4, 0, 0]}
                        style={{ cursor: 'pointer' }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Chart - Monthly Headcount (Only for All Employees) */}
          {selectedFilter === "all" && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Headcount Trend - All Employee filter
                </CardTitle>
                <CardDescription>
                  Click on any data point to view detailed employee information
                </CardDescription>
              </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} onClick={handleChartClick}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload[0]) {
                          return (
                            <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                              <p className="font-medium">{`Month: ${label}`}</p>
                              <p className="text-primary">{`Employees: ${payload[0].value}`}</p>
                              <p className="text-xs text-muted-foreground">Click to view details</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#8884d8" 
                      strokeWidth={3}
                      dot={{ fill: '#8884d8', strokeWidth: 2, r: 6 }}
                      activeDot={{ r: 8, stroke: '#8884d8', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Second Chart for Filtered Data */}
          {selectedFilter !== "all" && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" />
                  Count by {getFilterLabel(selectedFilter)}
                </CardTitle>
                <CardDescription>
                  Distribution of employees by {getFilterLabel(selectedFilter).toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getCategoryDistribution()} onClick={handleChartClick}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stacked Column Chart for Filtered Data */}
          {selectedFilter !== "all" && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" />
                  Monthly Hires by {getFilterLabel(selectedFilter)}
                </CardTitle>
                <CardDescription>
                  Monthly hiring breakdown by {getFilterLabel(selectedFilter).toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getStackedColumnData()} onClick={handleChartClick}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length > 0) {
                            const data = payload[0]?.payload;
                            const monthTotal = data?.total || 0;
                            
                            return (
                              <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                                <p className="font-medium">{`Month: ${label}`}</p>
                                {payload.map((entry, index) => (
                                  <p key={index} style={{ color: entry.color }}>
                                    {`${entry.dataKey}: ${entry.value}`}
                                  </p>
                                ))}
                                <p className="text-primary">{`Month Total: ${monthTotal}`}</p>
                                <p className="text-xs text-muted-foreground">Click any bar to view details</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {getChartCategories().map((category, index) => (
                        <Bar
                          key={category}
                          dataKey={category}
                          stackId="a"
                          fill={getLineColors()[index % getLineColors().length]}
                          onClick={(data, index, event) => {
                            // Custom click handler for each bar
                            const categoryName = category;
                            const monthData = data.payload;
                            const categoryEmployees = monthData[`${categoryName}_employees`] || [];
                            
                            setSelectedDataPoint({
                              month: `${monthData.monthName} ${monthData.month} - ${categoryName}`,
                              count: monthData[categoryName] || 0,
                              month_number: monthData.month_number,
                              employees: categoryEmployees
                            });
                            setFilteredEmployees(categoryEmployees);
                            setShowModal(true);
                          }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts Grid - Only show when no filter is applied */}
          {selectedFilter === "all" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Account Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>By Account</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prepareChartData(dashboardData.by_account)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Location Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>By Location</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={prepareChartData(dashboardData.by_location)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Employment Status */}
            <Card>
              <CardHeader>
                <CardTitle>By Employment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={prepareChartData(dashboardData.by_employee_status)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {prepareChartData(dashboardData.by_employee_status).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By Gender */}
            <Card>
              <CardHeader>
                <CardTitle>By Gender</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={prepareChartData(dashboardData.by_gender)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {prepareChartData(dashboardData.by_gender).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By Status */}
            <Card>
              <CardHeader>
                <CardTitle>By Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={prepareChartData(dashboardData.by_status)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {prepareChartData(dashboardData.by_status).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {/* Employee Modal */}
          <Dialog open={showModal} onOpenChange={setShowModal}>
            <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Employee Details - {selectedDataPoint?.month} {new Date().getFullYear()}
                  </DialogTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={exportModalDataToCSV}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredEmployees.length} employees
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Close
                  </Button>
                </div>
                
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Work Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Leader</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">{employee.name}</TableCell>
                          <TableCell>{employee.position}</TableCell>
                          <TableCell>{employee.department}</TableCell>
                          <TableCell>{employee.account || 'N/A'}</TableCell>
                          <TableCell>{employee.location || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {employee.employee_status || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={employee.status === 'active' ? 'default' : 'destructive'}>
                              {employee.status || 'active'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={employee.is_leader === 'Yes' ? 'default' : 'secondary'}>
                              {employee.is_leader || 'No'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}
