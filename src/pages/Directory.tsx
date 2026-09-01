import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SidebarContent } from "@/components/SidebarContent";
import { Button } from "@/components/ui/button";
import {
  Grid3x3,
  List,
  Network,
  Filter,
  X,
  Upload,
  Plus,
  BarChart2,
  ArrowUpDown,
  Download,
  User,
  MapPin,
  ChevronDown,
  ChevronRight,
  Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmployeeCard, EmployeeCardProps } from "@/components/EmployeeCard";
import { EmployeeList } from "@/components/EmployeeList";
import { EmployeeHierarchy } from "@/components/EmployeeHierarchy";
import { EmployeeHierarchyFlowchart } from "@/components/EmployeeHierarchyFlowchart";
import { InteractiveOrgChart } from "@/components/InteractiveOrgChart";
import { AddEmployeeForm } from "@/components/employee/AddEmployeeForm";
import { ImportEmployees } from "@/components/employee/ImportEmployees";
import { exportEmployeesToCSV } from "@/utils/csvExport";
import { useAuth } from "@/hooks/use-auth"; // Assuming you have this
import { consolidateRemoteLocations, DEPARTMENT_OPTIONS, groupLocationsByCountry, groupAccounts } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEmployees, Employee as ApiEmployee } from '@/hooks/use-employees';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent as UISidebarContent,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";

type ViewMode = "grid" | "list" | "hierarchy";
type HierarchyViewMode = "levels" | "flowchart" | "tree";

export default function Directory() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>("Directory");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [hierarchyViewMode, setHierarchyViewMode] = useState<HierarchyViewMode>("levels");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<string>("asc");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);


  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const { toast } = useToast();

  const { user, isAdmin } = useAuth();
  const isInactiveTab = isAdmin && activeFilters.includes("Status: InActive");

  const {
    employees,
    isLoading,
    isLoadingMore,
    error,
    createEmployee,
    updateEmployee,
    importEmployeesFromCsv,
    bulkUpdateEmployeeNames
  } = useEmployees({ includeInactive: isAdmin });

  const { stats: dashboardStats } = useDashboardStats();

  const showLoading = (isLoading && employees.length === 0) || isNavigating;

  // Available departments, locations, and accounts for filters - use predefined department options
  const departments = DEPARTMENT_OPTIONS;

  // Process locations to group by country
  const groupedLocations = useMemo(() => {
    const rawLocations = [...new Set(employees.map(emp => emp.location).filter(Boolean))];
    const consolidated = consolidateRemoteLocations(rawLocations);
    return groupLocationsByCountry(
      consolidated,
      employees.map((e) => ({ location: e.location, usageLocation: e.usageLocation }))
    );
  }, [employees]);

  const accounts = useMemo(() => {
    const rawAccounts = [...new Set(employees.map(emp => emp.account).filter(Boolean))];
    return groupAccounts(rawAccounts);
  }, [employees]);


  const toggleFilter = (filter: string) => {
    setActiveFilters(prev =>
      prev.includes(filter)
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const clearFilters = () => setActiveFilters([]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle order if same field
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new field with default order (desc for dates, asc for others)
      setSortBy(field);
      setSortOrder(field === "date_of_joining" ? "desc" : "asc");
    }
  };

  const clearSort = () => {
    setSortBy("");
    setSortOrder("asc");
  };

  // CSV Export function - Updated with comprehensive field coverage
  const exportToCSV = () => {
    try {
      // Use the filtered and sorted employees data
      const dataToExport = sortedAndFilteredEmployees;

      if (dataToExport.length === 0) {
        toast({
          title: "No Data to Export",
          description: "There are no employees to export.",
          variant: "destructive",
        });
        return;
      }

      // Helper function to get employee name by ID (for manager field)
      const getManagerName = (employeeId: string) => {
        const employee = employees.find(emp => emp.id === employeeId);
        return employee ? employee.name : "Unknown";
      };

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      const filename = `employees_${timestamp}.csv`;

      // Use the comprehensive CSV export utility
      exportEmployeesToCSV(dataToExport, filename, getManagerName);

      toast({
        title: "Export Successful",
        description: `${dataToExport.length} employees exported to CSV successfully.`,
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

  // Handle navigation to dashboard with loading state
  const handleNavigateToDashboard = () => {
    setIsNavigating(true);
    navigate('/dashboard');
  };

  // Reset navigation state when component mounts or data loads
  useEffect(() => {
    if (!isLoading && employees.length > 0) {
      setIsNavigating(false);
    }
  }, [isLoading, employees.length]);

  // Drop removed "Entra country" filter chips if still in state (e.g. HMR)
  useEffect(() => {
    setActiveFilters((prev) => prev.filter((f) => !f.startsWith("Entra country:")));
  }, []);

  // Filter employees based on active filters
  const filteredEmployees = employees.filter(employee => {
    // Hide inactive employees for non-admin users
    if (!isAdmin && (employee.status || 'active') === 'inactive') {
      return false;
    }
    // Department filters
    if (activeFilters.some(filter => filter.startsWith("Department:"))) {
      const hasMatch = activeFilters.some(filter => {
        if (!filter.startsWith("Department: ")) return false;
        const filterValue = filter.replace("Department: ", "").trim().toLowerCase();
        return employee.department?.trim().toLowerCase() === filterValue;
      });
      if (!hasMatch) return false;
    }

    // Location filters
    if (activeFilters.some(filter => filter.startsWith("Location:"))) {
      const employeeLocation = employee.location;
      const normalizedLocation = employeeLocation?.trim().toLowerCase();
      const isRemoteEmployee = normalizedLocation?.startsWith('remote -') || normalizedLocation === 'remote' || normalizedLocation?.startsWith('remote-');
      const hasRemoteFilter = activeFilters.some(f => f.toLowerCase() === 'location: remote');

      // Check if any location filter matches
      const hasMatch = activeFilters.some(filter => {
        if (!filter.startsWith("Location: ")) return false;
        const filterValue = filter.replace("Location: ", "").trim().toLowerCase();

        if (filterValue === 'remote' && isRemoteEmployee) return true;
        return normalizedLocation === filterValue;
      });

      if (!hasMatch) return false;
    }

    // Account filters
    if (activeFilters.some(filter => filter.startsWith("Account:"))) {
      const hasMatch = activeFilters.some(filter => {
        if (!filter.startsWith("Account: ")) return false;
        const filterValue = filter.replace("Account: ", "").trim().toLowerCase();
        return employee.account?.trim().toLowerCase() === filterValue;
      });
      if (!hasMatch) return false;
    }

    // Status filter (Hide inactive by default unless explicitly filtering for them)
    // We check if "Status: InActive" is one of the active filters
    const isEditingInactiveFilter = activeFilters.some(filter => filter === "Status: InActive");
    const employeeStatus = (employee.status || 'active').toLowerCase();

    // Only show inactive profiles IF explicitly filtering for them
    // Otherwise, show only active ones.
    if (employeeStatus === 'inactive') {
      if (!isEditingInactiveFilter) return false;
    } else {
      // If it's an active profile and we are explicitly filtering for only inactive, hide it
      if (isEditingInactiveFilter) return false;
    }

    return true;
  });

  // Calculate active employees count - use dashboard stats API if available, otherwise calculate from employees list
  const activeEmployeesCount = dashboardStats?.totalEmployees ?? employees.filter(emp => (emp.status || 'active') !== 'inactive').length;

  // Sort filtered employees
  const sortedAndFilteredEmployees = [...filteredEmployees].sort((a, b) => {
    if (!sortBy) return 0;

    let aValue: string | number;
    let bValue: string | number;

    switch (sortBy) {
      case "name":
        aValue = a.name?.toLowerCase() || "";
        bValue = b.name?.toLowerCase() || "";
        break;
      case "employeeId":
        aValue = a.employeeId?.toLowerCase() || "";
        bValue = b.employeeId?.toLowerCase() || "";
        break;
      case "date_of_joining": {
        const dateA = a.dateOfJoining ? new Date(a.dateOfJoining) : null;
        const dateB = b.dateOfJoining ? new Date(b.dateOfJoining) : null;

        const isValidA = dateA && !isNaN(dateA.getTime());
        const isValidB = dateB && !isNaN(dateB.getTime());

        if (!isValidA && !isValidB) return a.name.localeCompare(b.name);
        if (!isValidA) return 1; // a is invalid, move to bottom
        if (!isValidB) return -1; // b is invalid, move to bottom

        const timeA = (dateA as Date).getTime();
        const timeB = (dateB as Date).getTime();

        if (timeA === timeB) {
          return a.name.localeCompare(b.name);
        }

        aValue = timeA;
        bValue = timeB;
        break;
      }
      default:
        return 0;
    }

    if (sortOrder === "asc") {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header onMenuToggle={toggleSidebar} />

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left Sidebar - Always Fixed */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-52 sidebar-glass transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
        <main className="flex-1 transition-all duration-300 lg:ml-52 pt-16 overflow-hidden max-w-full h-full">
          <div className="container px-6 py-8 h-full overflow-y-auto scrollbar-thin">

            {/* Filters and Actions */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
              <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
                    {/* Department Section */}
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground sticky top-0 bg-background border-b">
                      Department
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      {departments.map(dept => (
                        <DropdownMenuItem
                          key={dept}
                          onClick={() => toggleFilter(`Department: ${dept}`)}
                          className="pl-4"
                        >
                          {dept}
                        </DropdownMenuItem>
                      ))}
                    </div>

                    {/* Location Section */}
                    {Object.keys(groupedLocations).length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-t mt-1 sticky top-0 bg-background border-b z-10">
                          Location
                        </div>
                        <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                          {Object.entries(groupedLocations).map(([country, cityList]) => {
                            const isExpanded = expandedCountry === country;
                            return (
                              <div key={country} className="mb-0">
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setExpandedCountry(isExpanded ? null : country);
                                  }}
                                  className="px-4 py-1.5 text-sm flex items-center justify-between cursor-pointer focus:bg-accent transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3 w-3" />
                                    {country}
                                  </div>
                                  {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </DropdownMenuItem>
                                {isExpanded && (
                                  <div className="bg-muted/5">
                                    {cityList.map(city => (
                                      <DropdownMenuItem
                                        key={city}
                                        onClick={() => toggleFilter(`Location: ${city}`)}
                                        className="pl-8 py-1.5 text-sm focus:bg-accent"
                                      >
                                        {city}
                                      </DropdownMenuItem>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* Account Section */}
                    {Object.keys(accounts).length > 0 && (

                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-t mt-1 sticky top-0 bg-background border-b z-10">
                          Account
                        </div>
                        <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                          {Object.entries(accounts).map(([parentAccount, subAccounts]) => {
                            // If there is only one sub-account, show it as a single item without expansion
                            if (subAccounts.length === 1) {
                              const account = subAccounts[0];
                              return (
                                <DropdownMenuItem
                                  key={account}
                                  onClick={() => toggleFilter(`Account: ${account}`)}
                                  className="px-4 py-1.5 text-sm cursor-pointer focus:bg-accent transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {account}
                                  </div>
                                </DropdownMenuItem>
                              );
                            }

                            const isExpanded = expandedAccount === parentAccount;
                            return (
                              <div key={parentAccount} className="mb-0">
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setExpandedAccount(isExpanded ? null : parentAccount);
                                  }}
                                  className="px-4 py-1.5 text-sm flex items-center justify-between cursor-pointer focus:bg-accent transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    {parentAccount}
                                  </div>
                                  {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </DropdownMenuItem>
                                {isExpanded && (
                                  <div className="bg-muted/5">
                                    {subAccounts.map(account => (
                                      <DropdownMenuItem
                                        key={account}
                                        onClick={() => toggleFilter(`Account: ${account}`)}
                                        className="pl-8 py-1.5 text-sm focus:bg-accent"
                                      >
                                        {account}
                                      </DropdownMenuItem>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}


                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Sort
                      {sortBy && (
                        <span className="text-xs bg-primary text-primary-foreground px-1 rounded">
                          {sortBy === "name" ? "Name" : "Date"} {sortOrder === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      Sort by
                    </div>
                    <DropdownMenuItem
                      onClick={() => handleSort("name")}
                      className="pl-4"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>Name</span>
                        {sortBy === "name" && (
                          <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSort("date_of_joining")}
                      className="pl-4"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>Date of Joining</span>
                        {sortBy === "date_of_joining" && (
                          <span className="text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                    {sortBy && (
                      <>
                        <div className="border-t my-1"></div>
                        <DropdownMenuItem
                          onClick={clearSort}
                          className="pl-4 text-muted-foreground"
                        >
                          Clear Sort
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex border border-border rounded-md overflow-hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-none ${viewMode === "grid" ? "bg-accent" : ""}`}
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-none ${viewMode === "list" ? "bg-accent" : ""}`}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`rounded-none ${viewMode === "hierarchy" ? "bg-accent" : ""}`}
                    onClick={() => setViewMode("hierarchy")}
                  >
                    <Network className="h-4 w-4" />
                  </Button>
                </div>

                {isAdmin && (
                  <>
                    <Button variant="default" className="gap-2" onClick={() => setShowAddEmployee(true)}>
                      <Plus className="h-4 w-4" />
                      Add Employee
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={handleNavigateToDashboard} disabled={isNavigating}>
                      <BarChart2 className="h-4 w-4" />
                      {isNavigating ? "Loading..." : "Dashboard"}
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                    <Button
                      variant={activeFilters.includes("Status: InActive") ? "default" : "outline"}
                      className="gap-2"
                      onClick={() => toggleFilter("Status: InActive")}
                    >
                      <User className="h-4 w-4" />
                      InActive Profiles
                    </Button>
                  </>
                )}
                {/* Hidden Fix Names button - removed as requested */}
                {/* <Button 
                  variant="outline" 
                  className="gap-2" 
                  onClick={async () => {
                    try {
                      const result = await bulkUpdateEmployeeNames();
                      toast({
                        title: "Success",
                        description: `Updated ${result.updated_count} employee names to camel case format`,
                      });
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to update employee names",
                        variant: "destructive"
                      });
                    }
                  }}
                >
                  <User className="h-4 w-4" />
                  Fix Names
                </Button> */}
              </div>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {activeFilters.map((filter, index) => (
                  <div
                    key={index}
                    className="bg-muted text-muted-foreground text-sm px-3 py-1 rounded-full flex items-center gap-2"
                  >
                    <span>{filter}</span>
                    <button onClick={() => toggleFilter(filter)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  className="text-primary text-sm hover:underline"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Employee Directory */}
            <div className="mb-8">
              {isLoadingMore && employees.length > 0 && !showLoading && (
                <div
                  className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  Loading more employees…
                </div>
              )}
              {showLoading ? (
                <div className="flex flex-col justify-center items-center py-12">
                  <div className="animate-spin h-12 w-12 border-4 border-primary rounded-full border-t-transparent mb-4"></div>
                  <div className="text-lg font-medium text-muted-foreground mb-2">
                    {isNavigating ? "Navigating to Dashboard..." : "Loading employees..."}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Please wait while we fetch the latest data
                  </div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-destructive text-lg font-semibold mb-2">Error Loading Employees</div>
                  <div className="text-muted-foreground mb-4">{error}</div>
                  <Button onClick={() => window.location.reload()} variant="outline">
                    Retry
                  </Button>
                </div>
              ) : sortedAndFilteredEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-muted-foreground text-lg font-semibold mb-2">No Employees Found</div>
                  <div className="text-muted-foreground mb-4">
                    {employees.length === 0
                      ? "No employees have been added yet. Click 'Add Employee' to get started."
                      : "No employees match your current filters. Try adjusting your filters."
                    }
                  </div>
                  {employees.length === 0 && isAdmin && (
                    <Button onClick={() => setShowAddEmployee(true)} variant="default">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Employee
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {viewMode === "grid" && (
                    <>
                      {(() => {
                        const currentUserEmail = user?.email?.toLowerCase();
                        const currentUserEmployee = sortedAndFilteredEmployees.find(
                          (emp) => emp.email && currentUserEmail && emp.email.toLowerCase() === currentUserEmail
                        );
                        const otherEmployees = sortedAndFilteredEmployees.filter(
                          (emp) => !currentUserEmployee || emp.id !== currentUserEmployee.id
                        );

                        return (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-11 gap-x-2.5 gap-y-5 pt-3">
                            {currentUserEmployee && (
                              <div className="relative h-full">
                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white text-[11px] uppercase tracking-wider font-black px-5 py-2 rounded-full z-10 shadow-2xl shadow-indigo-600/50 border border-white/30 whitespace-nowrap flex items-center gap-2 group/myprofile">
                                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                                  <span>MY PROFILE</span>
                                </div>
                                <EmployeeCard
                                  key={currentUserEmployee.id}
                                  {...currentUserEmployee}
                                  enableInactiveDetails={isInactiveTab}
                                  className="ring-[4px] ring-indigo-600 ring-offset-4 ring-offset-background shadow-2xl shadow-indigo-600/40 h-full border-transparent rounded-2xl"
                                />
                              </div>
                            )}
                            {otherEmployees
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((employee) => (
                                <EmployeeCard
                                  key={employee.id}
                                  {...employee}
                                  enableInactiveDetails={isInactiveTab}
                                  className="h-full"
                                />
                              ))}
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {viewMode === "list" && (
                    <div className="space-y-4">
                      {/* List View Header with Download Button */}
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-muted-foreground">
                          Showing {sortedAndFilteredEmployees.length} employees ({activeEmployeesCount} active)
                        </div>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={exportToCSV}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Export CSV
                          </Button>
                        )}
                      </div>

                      {/* Employee List Table */}
                      <EmployeeList
                        employees={sortedAndFilteredEmployees as ApiEmployee[]}
                        updateEmployee={updateEmployee as (id: string, data: Partial<ApiEmployee>) => Promise<ApiEmployee | null>}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                        isAdmin={isAdmin}
                      />
                    </div>
                  )}

                  {viewMode === "hierarchy" && (
                    <>
                      {/* Hierarchy View Toggle */}
                      <div className="flex items-center gap-2 mb-6">
                        <span className="text-sm text-muted-foreground">Hierarchy View:</span>
                        <div className="flex border border-border rounded-md overflow-hidden">
                          <Button
                            variant={hierarchyViewMode === "levels" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHierarchyViewMode("levels")}
                            className="rounded-none"
                          >
                            Levels
                          </Button>
                          <Button
                            variant={hierarchyViewMode === "flowchart" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHierarchyViewMode("flowchart")}
                            className="rounded-none"
                          >
                            Org's List
                          </Button>
                          <Button
                            variant={hierarchyViewMode === "tree" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setHierarchyViewMode("tree")}
                            className="rounded-none"
                          >
                            Org's Tree
                          </Button>
                        </div>
                      </div>

                      {/* Render appropriate hierarchy view */}
                      {hierarchyViewMode === "levels" && (
                        <EmployeeHierarchy employees={sortedAndFilteredEmployees as ApiEmployee[]} />
                      )}
                      {hierarchyViewMode === "flowchart" && (
                        <EmployeeHierarchyFlowchart employees={sortedAndFilteredEmployees as ApiEmployee[]} />
                      )}
                      {hierarchyViewMode === "tree" && (
                        <InteractiveOrgChart employees={sortedAndFilteredEmployees as ApiEmployee[]} />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
      {/* Render AddEmployeeForm dialog */}
      <AddEmployeeForm
        isOpen={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        departments={departments}
      />

      {/* Render ImportEmployees dialog */}
      <ImportEmployees
        isOpen={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}
