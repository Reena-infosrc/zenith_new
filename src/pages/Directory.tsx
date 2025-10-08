import { useState, useEffect } from "react";
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
  BarChart2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmployeeCard, EmployeeCardProps } from "@/components/EmployeeCard";
import { EmployeeList } from "@/components/EmployeeList";
import { EmployeeHierarchy } from "@/components/EmployeeHierarchy";
import { EmployeeHierarchyFlowchart } from "@/components/EmployeeHierarchyFlowchart";
import { InteractiveOrgChart } from "@/components/InteractiveOrgChart";
import { AddEmployeeForm } from "@/components/employee/AddEmployeeForm";
import { ImportEmployees } from "@/components/employee/ImportEmployees";
import { useAuth } from "@/hooks/use-auth"; // Assuming you have this
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEmployees, Employee as ApiEmployee } from '@/hooks/use-employees';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  
  const isAdmin = true; // For demo purposes, assume admin
  
  const { 
    employees, 
    isLoading, 
    error,
    createEmployee,
    updateEmployee,
    importEmployeesFromCsv,
    fetchEmployees
  } = useEmployees();
  
  // Show loading state when navigating or when data is loading
  const showLoading = isLoading || isNavigating;
  
  // Available departments, locations, and accounts for filters - dynamically generated from employee data
  const departments = [...new Set(employees.map(emp => emp.department).filter(Boolean))].sort();
  const locations = [...new Set(employees.map(emp => emp.location).filter(Boolean))].sort();
  const accounts = [...new Set(employees.map(emp => emp.account).filter(Boolean))].sort();
  
  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter) 
        : [...prev, filter]
    );
  };
  
  const clearFilters = () => setActiveFilters([]);
  
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
  
  // Filter employees based on active filters
  const filteredEmployees = employees.filter(employee => {
    // Department filters
    if (activeFilters.some(filter => filter.startsWith("Department:")) && 
        !activeFilters.includes(`Department: ${employee.department}`)) {
      return false;
    }
    
    // Location filters
    if (activeFilters.some(filter => filter.startsWith("Location:")) && 
        !activeFilters.includes(`Location: ${employee.location}`)) {
      return false;
    }
    
    // Account filters
    if (activeFilters.some(filter => filter.startsWith("Account:")) && 
        !activeFilters.includes(`Account: ${employee.account}`)) {
      return false;
    }
    
    return true;
  });

  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header onMenuToggle={toggleSidebar} />
      
      {/* Main Layout */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Left Sidebar */}
        <aside 
          className={`fixed inset-y-0 left-0 z-20 w-64 bg-background border-r border-border transform transition-transform duration-300 ease-in-out pt-16 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 lg:static lg:z-0`}
          style={{ paddingTop: '0px' }}
        >
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
        <main className="flex-1">
          <div className="container px-4 py-6">
            {/* Welcome Section */}
            <section className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                Directory
              </h1>
              <p className="text-muted-foreground">Manage your organization's employee directory</p>
            </section>
            
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
                  <DropdownMenuContent align="end" className="w-56">
                    {/* Department Section */}
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      Department
                    </div>
                    {departments.map(dept => (
                      <DropdownMenuItem 
                        key={dept} 
                        onClick={() => toggleFilter(`Department: ${dept}`)}
                        className="pl-4"
                      >
                        {dept}
                      </DropdownMenuItem>
                    ))}
                    
                    {/* Location Section */}
                    {locations.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-t mt-1">
                          Location
                        </div>
                        {locations.map(location => (
                          <DropdownMenuItem 
                            key={location} 
                            onClick={() => toggleFilter(`Location: ${location}`)}
                            className="pl-4"
                          >
                            {location}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    
                    {/* Account Section */}
                    {accounts.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-t mt-1">
                          Account
                        </div>
                        {accounts.map(account => (
                          <DropdownMenuItem 
                            key={account} 
                            onClick={() => toggleFilter(`Account: ${account}`)}
                            className="pl-4"
                          >
                            {account}
                          </DropdownMenuItem>
                        ))}
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
              ) : filteredEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-muted-foreground text-lg font-semibold mb-2">No Employees Found</div>
                  <div className="text-muted-foreground mb-4">
                    {employees.length === 0 
                      ? "No employees have been added yet. Click 'Add Employee' to get started."
                      : "No employees match your current filters. Try adjusting your filters."
                    }
                  </div>
                  {employees.length === 0 && (
                    <Button onClick={() => setShowAddEmployee(true)} variant="default">
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Employee
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {viewMode === "grid" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {filteredEmployees.map((employee) => {
                        return (
                          <EmployeeCard
                            key={employee.id}
                            {...employee}
                          />
                        );
                      })}
                    </div>
                  )}
                  
                  {viewMode === "list" && (
                    <EmployeeList employees={filteredEmployees as any} updateEmployee={updateEmployee as any} />
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
                        <EmployeeHierarchy employees={filteredEmployees as any} />
                      )}
                      {hierarchyViewMode === "flowchart" && (
                        <EmployeeHierarchyFlowchart employees={filteredEmployees as any} />
                      )}
                      {hierarchyViewMode === "tree" && (
                        <InteractiveOrgChart employees={filteredEmployees as any} />
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
