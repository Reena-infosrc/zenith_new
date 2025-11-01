import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Employee } from '@/hooks/use-employees';
import { Input } from '@/components/ui/input';

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
  directReportsCount: number;
  level: number;
  hasChildrenWithReportees: boolean; // Track if any child has reportees
}

interface InteractiveOrgChartProps {
  employees: Employee[];
  searchQuery?: string;
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

  const directReports = employees.filter(emp => 
    emp.reporting_to && emp.reporting_to.trim() !== '' && emp.reporting_to === employee.id
  );
  
  const reportingManager = employee.reporting_to && employee.reporting_to.trim() !== '' 
    ? employees.find(emp => emp.id === employee.reporting_to)
    : null;

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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Department:</span>
                  <p className="text-sm text-muted-foreground">{employee.department}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Location:</span>
                  <p className="text-sm text-muted-foreground">{employee.location || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Employment Category:</span>
                  <Badge variant="secondary">{employee.employment_category || 'Not specified'}</Badge>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant={employee.employee_status === 'Billable' ? 'default' : 'secondary'}>
                    {employee.employee_status || 'Not specified'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Reporting Relationships
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reportingManager && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Reports to:</span>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
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
              
              {directReports.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Direct Reports ({directReports.length}):</span>
                  <div className="space-y-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InteractiveOrgChart({ employees, searchQuery = '' }: InteractiveOrgChartProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Improved tree building algorithm
  const buildTree = useCallback(() => {
    try {
      setLoading(true);
      
      if (!employees || employees.length === 0) {
        setTree([]);
        setLoading(false);
        return;
      }

      // Create a map for quick employee lookup
      const employeeMap = new Map<string, Employee>();
      employees.forEach(emp => {
        if (emp.id) {
          employeeMap.set(emp.id, emp);
        }
      });

      // Find root employees: those with no reporting_to or reporting_to not in the list
      const rootEmployees = employees.filter(emp => {
        const reportingTo = emp.reporting_to;
        if (!reportingTo || reportingTo.trim() === '') {
          return true;
        }
        // Check if the reporting manager exists in our employee list
        return !employeeMap.has(reportingTo);
      });

      // Calculate direct reports count for each employee
      const directReportsCount = new Map<string, number>();
      employees.forEach(emp => {
        const reportingTo = emp.reporting_to;
        if (reportingTo && reportingTo.trim() !== '' && employeeMap.has(reportingTo)) {
          directReportsCount.set(reportingTo, (directReportsCount.get(reportingTo) || 0) + 1);
        }
      });

      // Recursively build tree
      const buildNodeWithChildren = (employee: Employee, level: number = 0): TreeNode => {
        const directReports = employees.filter(emp => 
          emp.reporting_to && emp.reporting_to.trim() !== '' && emp.reporting_to === employee.id
        );
        
        // Sort direct reports: first by hierarchy (if we can determine it), then by name
        directReports.sort((a, b) => {
          // Try to sort by position hierarchy
          const aIsManager = a.position?.toLowerCase().includes('manager') || 
                            a.position?.toLowerCase().includes('director') ||
                            a.position?.toLowerCase().includes('vp') ||
                            a.position?.toLowerCase().includes('ceo');
          const bIsManager = b.position?.toLowerCase().includes('manager') || 
                            b.position?.toLowerCase().includes('director') ||
                            b.position?.toLowerCase().includes('vp') ||
                            b.position?.toLowerCase().includes('ceo');
          
          if (aIsManager && !bIsManager) return -1;
          if (!aIsManager && bIsManager) return 1;
          
          return a.name.localeCompare(b.name);
        });
        
        const children = directReports.map(child => buildNodeWithChildren(child, level + 1));
        
        // Check if any child has reportees
        const hasChildrenWithReportees = children.some(child => child.directReportsCount > 0);
        
        return {
          employee,
          children,
          directReportsCount: directReportsCount.get(employee.id) || 0,
          level,
          hasChildrenWithReportees
        };
      };

      const rootNodes = rootEmployees.map(emp => buildNodeWithChildren(emp, 0));
      
      // Sort root nodes by position hierarchy
      rootNodes.sort((a, b) => {
        const aIsExec = a.employee.position?.toLowerCase().includes('ceo') ||
                       a.employee.position?.toLowerCase().includes('cto') ||
                       a.employee.position?.toLowerCase().includes('cfo');
        const bIsExec = b.employee.position?.toLowerCase().includes('ceo') ||
                       b.employee.position?.toLowerCase().includes('cto') ||
                       b.employee.position?.toLowerCase().includes('cfo');
        
        if (aIsExec && !bIsExec) return -1;
        if (!aIsExec && bIsExec) return 1;
        
        return a.employee.name.localeCompare(b.employee.name);
      });
      
      setTree(rootNodes);
      setError(null);
    } catch (err) {
      console.error('Error building tree:', err);
      setError('Failed to build organization chart');
    } finally {
      setLoading(false);
    }
  }, [employees]);

  // Initialize expanded nodes for first 2 levels
  useEffect(() => {
    if (tree.length > 0) {
      const initialExpanded = new Set<string>();
      const markExpanded = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.level < 2) {
            initialExpanded.add(node.employee.id);
          }
          if (node.level < 2) {
            markExpanded(node.children);
          }
        });
      };
      markExpanded(tree);
      setExpandedNodes(initialExpanded);
    }
  }, [tree]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsModalOpen(true);
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  // Highlight matching employees in search
  const shouldHighlight = (employee: Employee) => {
    const query = searchQuery || localSearchQuery;
    if (!query) return false;
    const lowerQuery = query.toLowerCase();
    return employee.name.toLowerCase().includes(lowerQuery) ||
           employee.position?.toLowerCase().includes(lowerQuery) ||
           employee.department?.toLowerCase().includes(lowerQuery);
  };

  // Render a tree node
  const renderTreeNode = useCallback((node: TreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.directReportsCount > 0;
    const isExpanded = expandedNodes.has(node.employee.id);
    const isHighlighted = shouldHighlight(node.employee);
    
    // Determine layout: horizontal if children have reportees, vertical if leaf nodes
    const useHorizontalLayout = node.hasChildrenWithReportees && node.children.length > 1;

    return (
      <div 
        key={node.employee.id} 
        className="flex flex-col items-center relative flex-shrink-0"
        style={{ marginTop: depth > 0 ? '24px' : '0' }}
      >
        {/* Employee Card */}
        <div 
          className={cn(
            "relative group",
            "bg-gradient-to-br from-background/95 via-background/90 to-background/95",
            "backdrop-blur-xl border rounded-xl",
            "p-3 transition-all duration-200",
            "hover:shadow-lg hover:shadow-primary/10",
            "cursor-pointer",
            "w-[220px] min-w-[220px] flex flex-col gap-2",
            isHighlighted ? "ring-2 ring-primary shadow-lg border-primary" : "border-border/60 shadow-sm",
            depth === 0 ? "ring-1 ring-primary/20 shadow-md" : ""
          )}
          onClick={() => handleEmployeeClick(node.employee)}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "absolute -bottom-3 left-1/2 -translate-x-1/2 h-7 w-7 p-0 rounded-full z-20",
                "bg-background border border-border shadow-md",
                "hover:bg-primary hover:text-primary-foreground hover:border-primary",
                "transition-all duration-200"
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
                <ChevronRight className="h-4 w-4 rotate-90" />
              )}
            </Button>
          )}
          
          {/* Employee Info */}
          <div className="flex items-center gap-3">
            <Avatar className={cn(
              "ring-2 ring-background/80 group-hover:ring-primary/30",
              "shadow-md transition-all duration-200 flex-shrink-0",
              "h-12 w-12"
            )}>
              <AvatarImage src={node.employee.photoUrl} alt={node.employee.name} />
              <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-primary/10 to-primary/20 text-foreground">
                {node.employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h3 className={cn(
                "font-semibold truncate text-sm transition-colors",
                "group-hover:text-primary"
              )}>
                {node.employee.name}
              </h3>
              
              <p className="text-xs text-muted-foreground truncate">
                {node.employee.position}
              </p>

              {node.directReportsCount > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Users className="h-3 w-3 text-primary/60" />
                  <span className="text-[10px] text-muted-foreground">{node.directReportsCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vertical Connector Line from Parent to Children - Always Visible */}
        {hasChildren && isExpanded && (
          <div className="w-0.5 h-8 bg-gradient-to-b from-primary via-primary/80 to-primary/60 my-2 shadow-sm shadow-primary/30" />
        )}

        {/* Children Container */}
        {isExpanded && node.children.length > 0 && (
          <div className="relative mt-2 w-full">
            {useHorizontalLayout ? (
              // Horizontal layout for nodes with reportees
              <div className="flex flex-row gap-6 justify-center items-start relative">
                {/* Horizontal connector line */}
                {node.children.length > 1 && (
                  <div 
                    className="absolute -top-8 left-1/2 -translate-x-1/2 h-0.5 bg-gradient-to-r from-primary via-primary/90 to-primary rounded-full shadow-md shadow-primary/30 z-0"
                    style={{ 
                      width: `${Math.max(220 * (node.children.length - 1) + 24 * (node.children.length - 1), 200)}px`,
                      minWidth: '200px'
                    }}
                  />
                )}
                
                {node.children.map((child, idx) => (
                  <div 
                    key={child.employee.id} 
                    className="flex flex-col items-center relative flex-shrink-0"
                  >
                    {/* Connection point and vertical line */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10">
                      <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50 border-2 border-background" />
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-gradient-to-b from-primary via-primary/80 to-primary/60 rounded-full shadow-sm shadow-primary/30" />
                    </div>
                    {renderTreeNode(child, depth + 1)}
                  </div>
                ))}
              </div>
            ) : (
              // Vertical layout for leaf nodes
              <div className="flex flex-col items-center gap-4 relative w-full">
                {node.children.map((child, idx) => (
                  <div key={child.employee.id} className="flex flex-col items-center relative w-full">
                    {/* Vertical connector lines */}
                    {idx === 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-0.5 h-8 bg-gradient-to-b from-primary via-primary/80 to-primary/60 rounded-full shadow-sm shadow-primary/30" />
                    )}
                    {idx > 0 && (
                      <>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-md shadow-primary/40 border border-background z-10" />
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-gradient-to-b from-primary/60 to-primary/40" />
                      </>
                    )}
                    {renderTreeNode(child, depth + 1)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [expandedNodes, searchQuery, localSearchQuery, toggleNode]);

  useEffect(() => {
    buildTree();
  }, [buildTree]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Building organization chart...</span>
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
      {/* Header with Search and Zoom Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
            Organization Chart
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Click on any employee to view details. Expand/collapse to navigate.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              className="pl-9 pr-9 w-64"
            />
            {localSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setLocalSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border border-border/50 rounded-lg p-1 bg-background/50 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="h-8 w-8 p-0"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="text-xs font-medium text-muted-foreground min-w-[3rem] text-center px-2">
              {Math.round(zoomLevel * 100)}%
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 2}
              className="h-8 w-8 p-0"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="h-8 w-8 p-0"
              title="Reset Zoom"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Organization Chart Container */}
      <div 
        ref={containerRef}
        className="relative border border-border/50 rounded-2xl bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-xl overflow-hidden shadow-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        
        <div className="relative h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
          <div 
            className="p-8 flex justify-center"
            style={{ 
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s ease-out',
              minWidth: '100%'
            }}
          >
            <div className="flex flex-col items-center gap-6">
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
