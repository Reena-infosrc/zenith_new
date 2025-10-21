import React, { useState, useCallback, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ChevronDown, 
  ChevronRight, 
  Users, 
  Loader2,
  AlertCircle,
  RefreshCw,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Building,
  User,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
  bio?: string;
  startDate?: string;
  reporting_to?: string;
  employment_category?: string;
  gender?: string;
  employee_status?: string;
  account?: string;
  is_leader?: string;
  location?: string;
  date_of_birth?: string;
  date_of_joining?: string;
}

interface OrgChartNode {
  id: number;
  name: string;
  designation: string;
  profilePic?: string;
  directReports: number;
  currentProject: string;
  children: OrgChartNode[];
}

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
  isExpanded: boolean;
  directReportsCount: number;
  level: number;
}

interface InteractiveOrgChartProps {
  employees: Employee[];
}

interface EmployeeDetailModalProps {
  employee: Employee | null;
  employees: Employee[];
  isOpen: boolean;
  onClose: () => void;
}

function EmployeeDetailModal({ employee, employees, isOpen, onClose }: EmployeeDetailModalProps) {
  if (!employee) return null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not specified';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={employee.photoUrl} alt={employee.name} />
              <AvatarFallback className="text-lg">
                {employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold">{employee.name}</h2>
              <p className="text-sm text-muted-foreground">{employee.position}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Department:</span>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{employee.department}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Location:</span>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{employee.location || 'Not specified'}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Employment Category:</span>
                  </div>
                  <Badge variant="secondary" className="ml-6">
                    {employee.employment_category || 'Not specified'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                  </div>
                  <Badge 
                    variant={employee.employee_status === 'Billable' ? 'default' : 'secondary'}
                    className="ml-6"
                  >
                    {employee.employee_status || 'Not specified'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {employee.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.email}</span>
                  </div>
                )}
                {employee.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reporting Relationships */}
          {(() => {
            // Find direct reports (children)
            const directReports = employees.filter(emp => 
              emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && emp.reporting_to === employee.id
            );
            
            // Find reporting manager
            const reportingManager = employee.reporting_to && employee.reporting_to !== null && employee.reporting_to.trim() !== '' 
              ? employees.find(emp => emp.id === employee.reporting_to)
              : null;
            
            // Only show this section if there are relationships
            if (directReports.length === 0 && !reportingManager) {
              return null;
            }
            
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Reporting Relationships
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Reporting Manager */}
                  {reportingManager && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <ChevronDown className="h-4 w-4 text-muted-foreground rotate-180" />
                        <span className="text-sm font-medium">Reports to:</span>
                      </div>
                      <div className="ml-6 flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={reportingManager.photoUrl} alt={reportingManager.name} />
                          <AvatarFallback className="text-xs">
                            {reportingManager.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{reportingManager.name}</p>
                          <p className="text-xs text-muted-foreground">{reportingManager.position}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Direct Reports */}
                  {directReports.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Direct Reports ({directReports.length}):</span>
                      </div>
                      <div className="ml-6 space-y-2">
                        {directReports.map(report => (
                          <div key={report.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={report.photoUrl} alt={report.name} />
                              <AvatarFallback className="text-xs">
                                {report.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{report.name}</p>
                              <p className="text-xs text-muted-foreground">{report.position}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Bio */}
          {employee.bio && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{employee.bio}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InteractiveOrgChart({ employees }: InteractiveOrgChartProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Build tree structure from employee data
  const buildTree = useCallback(() => {
    try {
      setLoading(true);
      
      // Find root employees (those who don't report to anyone or report to someone not in the list)
      const rootEmployees = employees.filter(emp => 
        !emp.reporting_to || emp.reporting_to === null || emp.reporting_to.trim() === '' || !employees.find(e => e.id === emp.reporting_to)
      );

      // Calculate direct reports count for each employee
      const directReportsCount = new Map<string, number>();
      employees.forEach(emp => {
        if (emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '') {
          directReportsCount.set(emp.reporting_to, (directReportsCount.get(emp.reporting_to) || 0) + 1);
        }
      });

      // Recursively build tree
      const buildNodeWithChildren = (employee: Employee, level: number = 0): TreeNode => {
        const directReports = employees.filter(emp => emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && emp.reporting_to === employee.id);
        
        // Sort children by hierarchy level, then by name
        const getHierarchyLevel = (position: string): number => {
          const pos = position.toLowerCase();
          
          // Executive level (highest) - only C-level executives - use word boundaries
          if (pos.includes(' ceo ') || pos.includes(' cto ') || pos.includes(' cfo ') || pos.includes(' cso ') ||
              pos.startsWith('ceo') || pos.startsWith('cto') || pos.startsWith('cfo') || pos.startsWith('cso') ||
              pos.endsWith('ceo') || pos.endsWith('cto') || pos.endsWith('cfo') || pos.endsWith('cso')) {
            return 1;
          }
          // VP level
          if (pos.includes('vp') || pos.includes('vice president')) {
            return 2;
          }
          // All Director types (both Director and Senior Director) - consolidated into Level 3
          if (pos.includes('director')) {
            return 3;
          }
          // Manager level
          if (pos.includes('manager') || pos.includes('lead')) {
            return 4;
          }
          // Senior level
          if (pos.includes('senior')) {
            return 5;
          }
          // Regular level (lowest)
          return 6;
        };
        
        // Sort direct reports by hierarchy level, then by name
        directReports.sort((a, b) => {
          const levelA = getHierarchyLevel(a.position);
          const levelB = getHierarchyLevel(b.position);
          
          if (levelA !== levelB) {
            return levelA - levelB; // Lower level number = higher in hierarchy
          }
          
          // If same level, sort by name
          return a.name.localeCompare(b.name);
        });
        
        const children = directReports.map(child => buildNodeWithChildren(child, level + 1));
        
        return {
          employee,
          children,
          isExpanded: level < 2, // Expand first 2 levels by default
          directReportsCount: directReportsCount.get(employee.id) || 0,
          level
        };
      };

      // Create root nodes and sort by hierarchy level (same logic as Org's List)
      const rootNodes = rootEmployees.map(emp => buildNodeWithChildren(emp, 0));
      
      // Sort root employees by hierarchy level (CEO/CTO at top, then VPs, then Directors, etc.)
      const getHierarchyLevel = (position: string): number => {
        const pos = position.toLowerCase();
        
        // Executive level (highest) - only C-level executives - use word boundaries
        if (pos.includes(' ceo ') || pos.includes(' cto ') || pos.includes(' cfo ') || pos.includes(' cso ') ||
            pos.startsWith('ceo') || pos.startsWith('cto') || pos.startsWith('cfo') || pos.startsWith('cso') ||
            pos.endsWith('ceo') || pos.endsWith('cto') || pos.endsWith('cfo') || pos.endsWith('cso')) {
          return 1;
        }
        // VP level
        if (pos.includes('vp') || pos.includes('vice president')) {
          return 2;
        }
        // All Director types (both Director and Senior Director) - consolidated into Level 3
        if (pos.includes('director')) {
          return 3;
        }
        // Manager level
        if (pos.includes('manager') || pos.includes('lead')) {
          return 4;
        }
        // Senior level
        if (pos.includes('senior')) {
          return 5;
        }
        // Regular level (lowest)
        return 6;
      };
      
      // Sort root nodes by hierarchy level, then by name
      rootNodes.sort((a, b) => {
        const levelA = getHierarchyLevel(a.employee.position);
        const levelB = getHierarchyLevel(b.employee.position);
        
        if (levelA !== levelB) {
          return levelA - levelB; // Lower level number = higher in hierarchy
        }
        
        // If same level, sort by name
        return a.employee.name.localeCompare(b.employee.name);
      });
      
      console.log('📊 Org Tree - Root employees sorted by hierarchy level:', rootNodes.map(node => ({
        name: node.employee.name,
        position: node.employee.position,
        level: getHierarchyLevel(node.employee.position)
      })));
      
      setTree(rootNodes);
      setError(null);
    } catch (err) {
      setError('Failed to build organization chart');
    } finally {
      setLoading(false);
    }
  }, [employees]);

  // Toggle node expansion
  const toggleNode = useCallback((nodeId: string) => {
    setTree(prev => 
      prev.map(toggleNodeExpansion(nodeId))
    );
  }, [toggleNodeExpansion]);

  // Helper function to toggle node expansion recursively
  const toggleNodeExpansion = useCallback((nodeId: string) => (node: TreeNode): TreeNode => {
    if (node.employee.id === nodeId) {
      return { ...node, isExpanded: !node.isExpanded };
    }
    return {
      ...node,
      children: node.children.map(toggleNodeExpansion(nodeId))
    };
  }, []);

  // Handle employee click
  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent, nodeId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleNode(nodeId);
    }
  }, [toggleNode]);

  // Generate sample project names for demonstration
  const getCurrentProject = (employee: Employee): string => {
    const projects = [
      'AI Platform', 'Data Engine', 'Mobile App', 'Web Portal', 
      'Cloud Migration', 'Security Suite', 'Analytics Dashboard',
      'API Gateway', 'ML Pipeline', 'DevOps Tools'
    ];
    const hash = employee.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return projects[hash % projects.length];
  };

  // Render a single tree node
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.directReportsCount > 0;
    const isExpanded = node.isExpanded;
    const currentProject = getCurrentProject(node.employee);

    return (
      <div key={node.employee.id} className="flex flex-col items-center">
        {/* Sleek Employee Card */}
        <div 
          className={cn(
            "relative bg-gradient-to-br from-card to-card/80 backdrop-blur-sm",
            "border border-border/50 rounded-xl p-4 transition-all duration-300",
            "hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20",
            "cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary/20",
            "w-72 min-h-[140px] flex flex-col justify-between",
            depth === 0 ? "ring-1 ring-primary/10 shadow-lg" : "shadow-md"
          )}
          onClick={() => handleEmployeeClick(node.employee)}
          onKeyDown={(e) => handleKeyDown(e, node.employee.id)}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
          aria-label={`${node.employee.name}, ${node.employee.position}, ${node.directReportsCount} direct reports`}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "absolute -top-2 -right-2 h-7 w-7 p-0 rounded-full",
                "bg-background border border-border shadow-lg hover:shadow-xl",
                "transition-all duration-200 z-10",
                "hover:bg-primary hover:text-primary-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.employee.id);
              }}
              aria-label={isExpanded ? 'Collapse team' : 'Expand team'}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
          
          {/* Employee Info */}
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <Avatar className={cn(
              "ring-2 ring-background group-hover:ring-primary/30 transition-all duration-200",
              depth === 0 ? "h-12 w-12" : "h-10 w-10"
            )}>
              <AvatarImage src={node.employee.photoUrl} alt={node.employee.name} />
              <AvatarFallback className={cn(
                "font-semibold bg-gradient-to-br from-primary/10 to-primary/20",
                depth === 0 ? "text-sm" : "text-xs"
              )}>
                {node.employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h3 className={cn(
                "font-semibold truncate group-hover:text-primary transition-colors",
                depth === 0 ? "text-base" : "text-sm"
              )}>
                {node.employee.name}
              </h3>
              
              <p className="text-xs text-muted-foreground font-medium truncate mb-2">
                {node.employee.position}
              </p>

              {/* Department Badge */}
              <Badge 
                variant="secondary" 
                className="text-xs mb-2 bg-gradient-to-r from-secondary/50 to-secondary/30"
              >
                {node.employee.department}
              </Badge>

              {/* Direct Reports Count */}
              {node.directReportsCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{node.directReportsCount} reports</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Project Info */}
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              <span className="truncate">{currentProject}</span>
            </div>
          </div>
        </div>

        {/* Vertical Connector Line */}
        {hasChildren && isExpanded && (
          <div className="w-0.5 h-6 bg-gradient-to-b from-primary/40 to-primary/20 my-3"></div>
        )}

        {/* Children */}
        {isExpanded && node.children.length > 0 && (
          <div className="flex gap-4 items-start mt-4 flex-wrap justify-center">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Initialize tree on mount
  useEffect(() => {
    buildTree();
  }, [buildTree]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Building organization chart...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">Error Loading Chart</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={buildTree} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Users className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">No Organization Chart</h3>
          <p className="text-muted-foreground">
            No reporting relationships found. Set up reporting_to relationships to see the organization chart.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Interactive Organization Chart</h2>
          <p className="text-muted-foreground">
            Click on any employee to view their details. Click expand/collapse buttons to show/hide team members.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{employees.length} employees</span>
        </div>
      </div>

      {/* Organization Chart Container */}
      <div className="border border-border/50 rounded-xl bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm overflow-hidden shadow-lg">
        <div className="h-[700px] overflow-auto">
          <div className="p-6">
            <div className="flex flex-col items-center min-w-max space-y-6">
              {tree.map(node => renderTreeNode(node))}
            </div>
          </div>
        </div>
      </div>

      {/* Employee Detail Modal */}
      <EmployeeDetailModal
        employee={selectedEmployee}
        employees={employees}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEmployee(null);
        }}
      />
    </div>
  );
}
