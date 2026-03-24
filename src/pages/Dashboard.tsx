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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Legend } from 'recharts';
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";
import { useToast } from "@/hooks/use-toast";
import { consolidateRemoteLocations, isIndiaEmployeeByLocation, isUSAEmployeeByLocation } from "@/lib/utils";
import { exportEmployeesToCSV } from "@/utils/csvExport";
import { API_BASE_URL } from "@/config/api";

interface Employee {
  id: string;
  employeeId?: string;
  employee_id?: string;
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
  /** Azure Entra usageLocation (ISO 3166 alpha-2), when synced */
  usage_location?: string;
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
  const [selectedLocation, setSelectedLocation] = useState<string>("all"); // India, USA, All
  const [selectedDataPoint, setSelectedDataPoint] = useState<ChartDataPoint | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const { toast } = useToast();

  // CSV Export function for modal data - Updated with comprehensive field coverage
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

      // Helper function to get employee name by ID (for manager field)
      const getManagerName = (employeeId: string) => {
        // Search in all dashboard employees, not just filtered ones
        const employee = dashboardData?.employees?.find(emp => emp.id === employeeId);
        return employee ? employee.name : "Unknown";
      };

      // Generate filename with timestamp and context
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      const context = selectedDataPoint?.month || "employees";
      const filename = `employees_${context.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.csv`;

      // Use the comprehensive CSV export utility
      exportEmployeesToCSV(filteredEmployees, filename, getManagerName);

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

      // Always bust the dashboard cache on mount so navigating back shows fresh data
      apiCache.delete(CACHE_KEYS.DASHBOARD);

      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/employees-dashboard/`, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Transform employee data to match frontend interface
      if (data.employees) {
        data.employees = data.employees.map((emp: Employee) => {
          // Normalize account names specifically to fix duplicate entries
          let normalizedAccount = emp.account;
          if (normalizedAccount === "ADP- USA") {
            normalizedAccount = "ADP - USA";
          }

          // Normalize location casing to fix duplicate entries like "india", "INDIA", "India"
          let normalizedLocation = emp.location;
          if (normalizedLocation) {
            normalizedLocation = normalizedLocation.trim().split(/\s+/).map(word => {
              if (word.toUpperCase() === 'USA') return 'USA';
              if (word.toUpperCase() === 'US') return 'US';
              if (word.toUpperCase() === 'UK') return 'UK';
              // Title case other words
              return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';
            }).join(' ');
          }

          return {
            ...emp,
            account: normalizedAccount,
            location: normalizedLocation || emp.location,
            employeeId: emp.employee_id || emp.employeeId || "",
            id: emp.id || "temp-" + Math.random().toString(36).substr(2, 9)
          };
        });
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

  // Filter employees by location
  const getLocationFilteredEmployees = (employees: Employee[]): Employee[] => {
    if (selectedLocation === "all") {
      return employees;
    }

    const filtered = employees.filter(emp => {
      if (selectedLocation === "india") {
        return isIndiaEmployeeByLocation(emp.location, emp.usage_location);
      }
      if (selectedLocation === "usa") {
        return isUSAEmployeeByLocation(emp.location, emp.usage_location);
      }
      return true;
    });

    return filtered;
  };

  // Get filtered dashboard data based on location
  const getFilteredDashboardData = (): DashboardData | null => {
    if (!dashboardData) return null;

    const locationFilteredEmployees = getLocationFilteredEmployees(dashboardData.employees);

    // Recalculate all analytics based on filtered employees
    const by_account: { [key: string]: number } = {};
    const by_location: { [key: string]: number } = {};
    const by_employee_status: { [key: string]: number } = {};
    const by_employment_category: { [key: string]: number } = {};
    const by_is_leader: { [key: string]: number } = {};
    const by_expertise: { [key: string]: number } = {};
    const by_department: { [key: string]: number } = {};
    const by_gender: { [key: string]: number } = {};
    const by_status: { [key: string]: number } = {};

    locationFilteredEmployees.forEach(emp => {
      // Only count active employees
      const empStatus = emp.status || "active";
      if (empStatus === "inactive") return;

      // Account
      const account = emp.account || "Unknown";
      by_account[account] = (by_account[account] || 0) + 1;

      // Location
      const location = emp.location || "Unknown";
      const normalizedLocation = location.toLowerCase().trim();
      if (normalizedLocation.startsWith('remote -') || normalizedLocation === 'remote') {
        by_location['Remote'] = (by_location['Remote'] || 0) + 1;
      } else {
        by_location[location] = (by_location[location] || 0) + 1;
      }

      // Employee status
      const empStatusType = emp.employee_status || "Unknown";
      by_employee_status[empStatusType] = (by_employee_status[empStatusType] || 0) + 1;

      // Employment category
      const category = emp.employment_category || "Unknown";
      by_employment_category[category] = (by_employment_category[category] || 0) + 1;

      // Is leader
      const isLeader = emp.is_leader || "No";
      by_is_leader[isLeader] = (by_is_leader[isLeader] || 0) + 1;

      // Expertise
      const expertise = emp.expertise || "Unknown";
      by_expertise[expertise] = (by_expertise[expertise] || 0) + 1;

      // Department
      const department = emp.department || "Unknown";
      by_department[department] = (by_department[department] || 0) + 1;

      // Gender
      const gender = emp.gender || "Unknown";
      by_gender[gender] = (by_gender[gender] || 0) + 1;

      // Status
      by_status[empStatus] = (by_status[empStatus] || 0) + 1;
    });

    // Calculate monthly headcount for filtered employees
    const monthly_headcount = [];
    const current_year = new Date().getFullYear();
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

      let count = 0;
      for (const emp of locationFilteredEmployees) {
        const empStatus = emp.status || "active";
        if (empStatus === "inactive") continue;

        const join_date_str = emp.date_of_joining || emp.created_at;
        if (join_date_str) {
          try {
            const join_date = new Date(join_date_str);
            if (join_date <= monthEnd) {
              count += 1;
            }
          } catch {
            count += 1;
          }
        }
      }

      monthly_headcount.push({
        month: targetDate.toLocaleDateString('en-US', { month: 'short' }),
        count,
        month_number: targetDate.getMonth() + 1
      });
    }

    return {
      total_employees: locationFilteredEmployees.filter(emp => (emp.status || "active") !== "inactive").length,
      monthly_headcount,
      by_account,
      by_location,
      by_employee_status,
      by_employment_category,
      by_is_leader,
      by_expertise,
      by_department,
      by_gender,
      by_status,
      employees: locationFilteredEmployees
    };
  };

  // Apply filters to data
  useEffect(() => {
    if (dashboardData) {
      applyFilters();
    }
  }, [dashboardData, selectedFilter, filterValue, selectedLocation]);

  const applyFilters = () => {
    if (!dashboardData) return;

    // Get location-filtered data
    const filteredData = getFilteredDashboardData();
    if (!filteredData) return;

    // Calculate monthly headcount data for multi-line chart
    const monthly_headcount = [];
    const current_year = new Date().getFullYear();

    // Get all unique categories for the selected filter
    const categories = new Set<string>();
    filteredData.employees.forEach(emp => {
      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        categories.add(fieldValue);
      }
    });

    // If no filter selected or no categories, show total count
    if (selectedFilter === "all" || categories.size === 0) {
      const now = new Date();

      // Generate data for the last 12 months
      for (let i = 11; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

        let count = 0;
        for (const emp of filteredData.employees) {
          const empStatus = emp.status || "active";
          if (empStatus === "inactive") continue;

          const join_date_str = emp.date_of_joining || emp.created_at;
          if (join_date_str) {
            try {
              const join_date = new Date(join_date_str);
              if (join_date <= monthEnd) {
                count += 1;
              }
            } catch {
              count += 1;
            }
          }
        }

        monthly_headcount.push({
          month: targetDate.toLocaleDateString('en-US', { month: 'short' }),
          count,
          month_number: targetDate.getMonth() + 1,
          employees: filteredData.employees
        });
      }
    } else {
      // Generate data for each category - last 12 months
      const now = new Date();

      for (let i = 11; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const monthData: { month: string; month_number: number; employees: Employee[] } = {
          month: targetDate.toLocaleDateString('en-US', { month: 'short' }),
          month_number: targetDate.getMonth() + 1,
          employees: []
        };

        // Calculate count for each category
        categories.forEach(category => {
          let count = 0;
          const categoryEmployees: Employee[] = [];

          for (const emp of filteredData.employees) {
            const empStatus = emp.status || "active";
            if (empStatus === "inactive") continue;

            const fieldValue = emp[selectedFilter as keyof Employee];
            if (fieldValue === category) {
              const join_date_str = emp.date_of_joining || emp.created_at;
              if (join_date_str) {
                try {
                  const join_date = new Date(join_date_str);
                  if (join_date <= monthEnd) {
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
    const filteredData = getFilteredDashboardData();
    if (!filteredData) return [];

    const now = new Date();
    const monthlyData = [];

    // Generate data for the last 12 months
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

      const newJoiners = filteredData.employees.filter(emp => {
        const empStatus = emp.status || "active";
        if (empStatus === "inactive") return false;

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
    const filteredData = getFilteredDashboardData();
    if (!filteredData || selectedFilter === "all") {
      return [];
    }

    const categories = new Set<string>();
    filteredData.employees.forEach(emp => {
      const empStatus = emp.status || "active";
      if (empStatus === "inactive") return;

      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        // Consolidate remote locations when filter is location
        if (selectedFilter === "location") {
          const normalizedValue = fieldValue.toLowerCase().trim();
          if (normalizedValue.startsWith('remote -') || normalizedValue === 'remote') {
            categories.add('Remote');
          } else {
            categories.add(fieldValue);
          }
        } else {
          categories.add(fieldValue);
        }
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
    const filteredData = getFilteredDashboardData();
    if (!filteredData || selectedFilter === "all") {
      return [];
    }

    const current_year = new Date().getFullYear();
    const categories = new Set<string>();

    // Get all unique categories for the selected filter
    filteredData.employees.forEach(emp => {
      const empStatus = emp.status || "active";
      if (empStatus === "inactive") return;

      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        // Consolidate remote locations when filter is location
        if (selectedFilter === "location") {
          const normalizedValue = fieldValue.toLowerCase().trim();
          if (normalizedValue.startsWith('remote -') || normalizedValue === 'remote') {
            categories.add('Remote');
          } else {
            categories.add(fieldValue);
          }
        } else {
          categories.add(fieldValue);
        }
      }
    });

    const monthlyData = [];
    const now = new Date();

    // Generate data for the last 12 months
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = targetDate.toISOString().slice(0, 7); // YYYY-MM format
      const monthName = targetDate.toLocaleDateString('en-US', { month: 'short' });

      const monthData: {
        month: string;
        monthName: string;
        month_number: number;
        employees: Employee[]
        total: number;
        [key: string]: any;

      } = {
        month: monthKey,
        monthName: monthName,
        month_number: targetDate.getMonth() + 1,
        total: 0,
        employees: []
      };

      // Calculate hires for each category in this month
      categories.forEach(category => {
        let hires = 0;
        const categoryEmployees: Employee[] = [];

        for (const emp of filteredData.employees) {
          const empStatus = emp.status || "active";
          if (empStatus === "inactive") continue;

          const fieldValue = emp[selectedFilter as keyof Employee];

          // Handle consolidated remote locations
          let matchesCategory = false;
          if (selectedFilter === "location" && category === "Remote") {
            const normalizedValue = fieldValue?.toLowerCase().trim();
            matchesCategory = normalizedValue?.startsWith('remote -') || normalizedValue === 'remote';
          } else {
            matchesCategory = fieldValue === category;
          }

          if (matchesCategory) {
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
    const filteredData = getFilteredDashboardData();
    if (!filteredData || selectedFilter === "all") {
      return filteredData?.employees || [];
    }

    return filteredData.employees.filter(emp => {
      const empStatus = emp.status || "active";
      if (empStatus === "inactive") return false;

      const fieldValue = emp[selectedFilter as keyof Employee];
      return fieldValue && fieldValue !== "Unknown";
    });
  };

  // Get category distribution for filtered data
  const getCategoryDistribution = () => {
    const filteredData = getFilteredDashboardData();
    if (!filteredData || selectedFilter === "all") {
      return null;
    }

    const filteredEmployees = getFilteredEmployees();
    const distribution: { [key: string]: number } = {};

    filteredEmployees.forEach(emp => {
      const empStatus = emp.status || "active";
      if (empStatus === "inactive") return;

      const fieldValue = emp[selectedFilter as keyof Employee];
      if (fieldValue && fieldValue !== "Unknown") {
        // Consolidate remote locations when filter is location
        if (selectedFilter === "location") {
          const normalizedValue = fieldValue.toLowerCase().trim();
          if (normalizedValue.startsWith('remote -') || normalizedValue === 'remote') {
            distribution['Remote'] = (distribution['Remote'] || 0) + 1;
          } else {
            distribution[fieldValue] = (distribution[fieldValue] || 0) + 1;
          }
        } else {
          distribution[fieldValue] = (distribution[fieldValue] || 0) + 1;
        }
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

  const prepareChartData = (data: { [key: string]: number } | null | undefined) => {
    if (!data || typeof data !== 'object') {
      return [];
    }

    // Consolidate remote locations for location charts
    const consolidatedData: { [key: string]: number } = {};

    Object.entries(data).forEach(([name, value]) => {
      const normalizedName = name.toLowerCase().trim();

      // Consolidate remote locations
      if (normalizedName.startsWith('remote -') || normalizedName === 'remote') {
        consolidatedData['Remote'] = (consolidatedData['Remote'] || 0) + value;
      } else {
        consolidatedData[name] = value;
      }
    });

    return Object.entries(consolidatedData).map(([name, value]) => ({ name, value }));
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
        {/* Left Sidebar - Always Fixed */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 sidebar-glass transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}>
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

        {/* Main Content - Account for fixed sidebar and header */}
        <main className="flex-1 p-6 lg:ml-64 pt-16">
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
            <p className="text-muted-foreground mb-4">Comprehensive insights into your workforce data</p>

            {/* Location Filter Buttons */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm font-medium text-muted-foreground">Filter by Location:</span>
              <div className="flex items-center gap-2">
                <Button
                  variant={selectedLocation === "india" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedLocation("india")}
                  className={`transition-all duration-200 ${selectedLocation === "india"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  India
                </Button>
                <Button
                  variant={selectedLocation === "usa" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedLocation("usa")}
                  className={`transition-all duration-200 ${selectedLocation === "usa"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  USA
                </Button>
                <Button
                  variant={selectedLocation === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedLocation("all")}
                  className={`transition-all duration-200 ${selectedLocation === "all"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  All
                </Button>
              </div>
            </div>
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
          {(() => {
            const filteredData = getFilteredDashboardData();
            if (!filteredData) return null;

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{filteredData.total_employees}</div>
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
                    <div className="text-2xl font-bold">{filteredData.by_is_leader.Yes || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      {filteredData.total_employees > 0 ? ((filteredData.by_is_leader.Yes || 0) / filteredData.total_employees * 100).toFixed(1) : 0}% of workforce
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
                      {Object.keys(filteredData.by_location).length}
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
                    <div className="text-2xl font-bold">{Object.keys(filteredData.by_department).length}</div>
                    <p className="text-xs text-muted-foreground">
                      Active departments
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

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
          {selectedFilter === "all" && (() => {
            const filteredData = getFilteredDashboardData();
            if (!filteredData) return null;

            // ================= Prepare Data Once =================
            const accountData = filteredData.by_account
              ? prepareChartData(filteredData.by_account)
              : [];

            const locationData = filteredData.by_location
              ? prepareChartData(filteredData.by_location)
              : [];

            const employeeStatusData = filteredData.by_employee_status
              ? prepareChartData(filteredData.by_employee_status)
              : [];

            const genderData = filteredData.by_gender
              ? prepareChartData(filteredData.by_gender)
              : [];

            const statusData = filteredData.by_status
              ? prepareChartData(filteredData.by_status)
              : [];

            // ================= Reusable Legend Formatter =================
            const renderLegend =
              (data: any[]) =>
                (value: string, entry: any) => {
                  const total = data.reduce((sum, item) => sum + item.value, 0);
                  const percentage =
                    total > 0
                      ? ((entry.payload.value / total) * 100).toFixed(0)
                      : 0;

                  return (
                    <span className="text-sm font-medium">
                      {value} ({entry.payload.value}, {percentage}%)
                    </span>
                  );
                };
 
            return (
              <div className="space-y-8 mb-8">

                {/* ================= ROW 1 (2 Columns) ================= */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* By Account */}
                  {accountData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>By Account</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={accountData}
                              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                interval={0}
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* By Location */}
                  {locationData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>By Location</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={locationData}
                              margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                interval={0}
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Bar dataKey="value" fill="#82ca9d" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                </div>


                {/* ================= ROW 2 (3 Columns) ================= */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Employment Status */}
                  {employeeStatusData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>By Employment Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={employeeStatusData}
                                cx="50%"
                                cy="45%"
                                outerRadius={75}
                                dataKey="value"
                              >
                                {employeeStatusData.map((entry, index) => (
                                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend
                                verticalAlign="bottom"
                                align="center"
                                formatter={renderLegend(employeeStatusData)}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gender */}
                  {genderData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>By Gender</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={genderData}
                                cx="50%"
                                cy="45%"
                                outerRadius={75}
                                dataKey="value"
                              >
                                {genderData.map((entry, index) => (
                                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend
                                verticalAlign="bottom"
                                align="center"
                                formatter={renderLegend(genderData)}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Status */}
                  {statusData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>By Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={statusData}
                                cx="50%"
                                cy="45%"
                                outerRadius={75}
                                dataKey="value"
                              >
                                {statusData.map((entry, index) => (
                                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend
                                verticalAlign="bottom"
                                align="center"
                                formatter={renderLegend(statusData)}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                </div>

              </div>
            );

          })()}

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
                            <Badge variant={employee.status === 'inactive' ? 'destructive' : 'default'}>
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
