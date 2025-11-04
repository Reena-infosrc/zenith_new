import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ChevronRight, 
  ChevronDown,
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
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [connectorUpdateKey, setConnectorUpdateKey] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Build tree structure from employee data
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
        
        // Sort direct reports: those with more reportees first, then by name
        directReports.sort((a, b) => {
          const aReportees = directReportsCount.get(a.id) || 0;
          const bReportees = directReportsCount.get(b.id) || 0;
          // First, prioritize nodes with more reportees
          if (aReportees > bReportees) return -1;
          if (aReportees < bReportees) return 1;
          // If same number of reportees, sort by name
          return a.name.localeCompare(b.name);
        });
        
        const children = directReports.map(child => buildNodeWithChildren(child, level + 1));
        
        return {
          employee,
          children,
          directReportsCount: directReportsCount.get(employee.id) || 0,
          level
        };
      };

      const rootNodes = rootEmployees.map(emp => buildNodeWithChildren(emp, 0));
      
      // Sort root nodes: those with more reportees first, then by name
      rootNodes.sort((a, b) => {
        // First, prioritize nodes with more reportees
        if (a.directReportsCount > b.directReportsCount) return -1;
        if (a.directReportsCount < b.directReportsCount) return 1;
        // If same number of reportees, sort by name
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

  // Initialize expanded nodes for first level
  useEffect(() => {
    if (tree.length > 0) {
      const initialExpanded = new Set<string>();
      tree.forEach(node => {
        if (node.level === 0 && node.directReportsCount > 0) {
          initialExpanded.add(node.employee.id);
        }
      });
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

  // Search functionality
  useEffect(() => {
    if (localSearchQuery.trim().length >= 2) {
      const lowerQuery = localSearchQuery.toLowerCase();
      const filtered = employees.filter(emp =>
        emp.name.toLowerCase().includes(lowerQuery) ||
        emp.position?.toLowerCase().includes(lowerQuery) ||
        emp.department?.toLowerCase().includes(lowerQuery) ||
        emp.email?.toLowerCase().includes(lowerQuery)
      ).slice(0, 10); // Limit to 10 results
      setSearchResults(filtered);
      setShowSearchDropdown(true);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
    }
  }, [localSearchQuery, employees]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node) &&
        !searchInputRef.current?.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find all parent IDs from root to a given employee
  const findParentChain = useCallback((employeeId: string): string[] => {
    const chain: string[] = [];
    let currentId: string | undefined = employeeId;
    const employeeMap = new Map<string, Employee>();
    employees.forEach(emp => {
      if (emp.id) employeeMap.set(emp.id, emp);
    });

    while (currentId) {
      chain.push(currentId);
      const employee = employeeMap.get(currentId);
      if (employee?.reporting_to && employee.reporting_to.trim() !== '') {
        currentId = employee.reporting_to;
      } else {
        break;
      }
    }
    return chain.reverse(); // Return from root to target
  }, [employees]);

  // Expand all parent nodes and navigate to employee
  const navigateToEmployee = useCallback((employee: Employee) => {
    // Find all parent nodes that need to be expanded
    const parentChain = findParentChain(employee.id);
    
    // Expand all parent nodes
    setExpandedNodes(prev => {
      const next = new Set(prev);
      parentChain.forEach(id => {
        next.add(id);
      });
      return next;
    });

    // Close dropdown and clear search
    setShowSearchDropdown(false);
    setLocalSearchQuery('');

    // Wait for DOM to update, then scroll to the node
    // Use multiple timeouts to ensure tree is fully expanded and rendered
    setTimeout(() => {
      setConnectorUpdateKey(prev => prev + 1); // Force connector update
      setTimeout(() => {
        const nodeElement = nodeRefs.current.get(employee.id);
        if (nodeElement && chartContainerRef.current) {
          // Get the node's position relative to its offset parent
          // Account for zoom level by calculating actual position
          const containerPadding = 32; // 8 * 4 (p-8)
          
          // Calculate scroll position accounting for zoom
          // The container is scaled, so we need to account for that
          const containerScrollLeft = chartContainerRef.current.scrollLeft;
          const containerScrollTop = chartContainerRef.current.scrollTop;
          
          // Get the element's position within the scaled container
          const containerInner = chartContainerRef.current.querySelector('.p-8') as HTMLElement;
          if (containerInner) {
            const nodeOffsetLeft = nodeElement.offsetLeft;
            const nodeOffsetTop = nodeElement.offsetTop;
            
            // Account for container padding
            const targetScrollLeft = nodeOffsetLeft * zoomLevel - containerPadding;
            const targetScrollTop = nodeOffsetTop * zoomLevel - containerPadding;
            
            chartContainerRef.current.scrollTo({
              left: Math.max(0, targetScrollLeft),
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            // Fallback: use bounding rect
            const nodeRect = nodeElement.getBoundingClientRect();
            const containerRect = chartContainerRef.current.getBoundingClientRect();
            const scrollLeft = nodeRect.left - containerRect.left + chartContainerRef.current.scrollLeft - 100;
            const scrollTop = nodeRect.top - containerRect.top + chartContainerRef.current.scrollTop - 100;
            
            chartContainerRef.current.scrollTo({
              left: scrollLeft,
              top: scrollTop,
              behavior: 'smooth'
            });
          }

          // Highlight the node briefly
          nodeElement.classList.add('ring-4', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            nodeElement.classList.remove('ring-4', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }
      }, 300);
    }, 500);
  }, [findParentChain, zoomLevel]);

  // Highlight matching employees in search
  const shouldHighlight = (employee: Employee) => {
    const query = searchQuery || localSearchQuery;
    if (!query) return false;
    const lowerQuery = query.toLowerCase();
    return employee.name.toLowerCase().includes(lowerQuery) ||
           employee.position?.toLowerCase().includes(lowerQuery) ||
           employee.department?.toLowerCase().includes(lowerQuery);
  };

  // Calculate path for straight lines with rounded corners (fillet)
  // Creates: horizontal segment -> rounded corner -> vertical segment -> rounded corner -> horizontal to child
  const calculateStraightLinePath = (
    x1: number, y1: number, 
    x2: number, y2: number,
    cornerRadius: number = 8
  ): string => {
    // Calculate the bend point (where horizontal meets vertical)
    const bendX = x1 + Math.min((x2 - x1) * 0.5, 60); // Bend point at 50% or max 60px from parent
    
    // Check if nodes are at same vertical level (within threshold)
    if (Math.abs(y2 - y1) < 5) {
      // Same level - single straight horizontal line
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    
    // Different levels - create path with rounded corners
    // Determine direction (y2 > y1 means child is below)
    const goingDown = y2 > y1;
    const radius = Math.min(cornerRadius, Math.abs(y2 - y1) / 2); // Don't exceed half the vertical distance
    
    if (goingDown) {
      // Parent above child: horizontal right -> rounded corner down -> vertical down -> rounded corner right -> horizontal to child
      return `M ${x1} ${y1} 
              L ${bendX - radius} ${y1} 
              A ${radius} ${radius} 0 0 1 ${bendX} ${y1 + radius}
              L ${bendX} ${y2 - radius}
              A ${radius} ${radius} 0 0 0 ${bendX + radius} ${y2}
              L ${x2} ${y2}`;
    } else {
      // Parent below child: horizontal right -> rounded corner up -> vertical up -> rounded corner right -> horizontal to child
      return `M ${x1} ${y1} 
              L ${bendX - radius} ${y1} 
              A ${radius} ${radius} 0 0 0 ${bendX} ${y1 - radius}
              L ${bendX} ${y2 + radius}
              A ${radius} ${radius} 0 0 1 ${bendX + radius} ${y2}
              L ${x2} ${y2}`;
    }
  };

  // Get element center position relative to container (accounting for scroll and zoom)
  const getElementCenter = useCallback((element: HTMLElement | null, container: HTMLElement | null) => {
    if (!element || !container) return { x: 0, y: 0 };
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Account for scroll position
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;
    
    return {
      x: elementRect.left + elementRect.width / 2 - containerRect.left + scrollLeft,
      y: elementRect.top + elementRect.height / 2 - containerRect.top + scrollTop
    };
  }, []);

  // Render SVG connectors
  const renderConnectors = useCallback(() => {
    if (!chartContainerRef.current) return null;

    // Debug: Log all available node refs
    if (nodeRefs.current.size === 0) {
      return null; // No nodes rendered yet
    }

    const connections: Array<{ from: HTMLElement; to: HTMLElement; fromId: string; toId: string }> = [];

    // Collect all connections
    const collectConnections = (node: TreeNode) => {
      if (expandedNodes.has(node.employee.id) && node.children.length > 0) {
        const parentElement = nodeRefs.current.get(node.employee.id);
        if (!parentElement) {
          console.warn('Parent element not found for node:', node.employee.id, node.employee.name);
        }
        node.children.forEach((child) => {
          const childElement = nodeRefs.current.get(child.employee.id);
          if (parentElement && childElement) {
            connections.push({
              from: parentElement,
              to: childElement,
              fromId: node.employee.id,
              toId: child.employee.id
            });
          } else {
            if (!childElement) {
              console.warn('Child element not found for node:', child.employee.id, child.employee.name);
            }
          }
          collectConnections(child);
        });
      }
    };

    tree.forEach(collectConnections);

    if (connections.length === 0) return null;

    const paths: Array<{ d: string; fromId: string; toId: string }> = [];
    
    connections.forEach((conn) => {
      const fromCenter = getElementCenter(conn.from, chartContainerRef.current);
      const toCenter = getElementCenter(conn.to, chartContainerRef.current);
      
      // Validate coordinates - ensure they are valid numbers
      if (isNaN(fromCenter.x) || isNaN(fromCenter.y) || isNaN(toCenter.x) || isNaN(toCenter.y)) {
        console.warn('Invalid coordinates for connection:', { fromCenter, toCenter, fromId: conn.fromId, toId: conn.toId });
        return;
      }
      
      // Ensure minimum distance between points
      if (Math.abs(toCenter.x - fromCenter.x) < 1 && Math.abs(toCenter.y - fromCenter.y) < 1) {
        return;
      }
      
      // Calculate straight line path with rounded corners
      const pathData = calculateStraightLinePath(
        fromCenter.x, fromCenter.y,
        toCenter.x, toCenter.y,
        8 // corner radius in pixels
      );
      
      // Validate path data
      if (pathData && pathData.trim().length > 0) {
        paths.push({ d: pathData, fromId: conn.fromId, toId: conn.toId });
      }
    });

    return (
      <svg 
        key={`connectors-${connectorUpdateKey}`}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="connector-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          </linearGradient>
          {/* Reduced shadow intensity to prevent stacking/brightening effect */}
          <filter id="connector-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.15" />
          </filter>
          {/* Lighter shadow for endpoint markers */}
          <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.2" />
          </filter>
        </defs>
        {paths.map((path, idx) => (
          <g key={`connector-${path.fromId}-${path.toId}-${idx}`}>
            <path
              d={path.d}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeMiterlimit="10"
              style={{ 
                opacity: 1,
                pointerEvents: 'none'
              }}
            />
          </g>
        ))}
        {/* Render endpoint markers at child nodes */}
        {connections.map((conn, idx) => {
          const toCenter = getElementCenter(conn.to, chartContainerRef.current);
          return (
            <circle
              key={`marker-${conn.toId}-${idx}`}
              cx={toCenter.x}
              cy={toCenter.y}
              r="4"
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth="2"
              filter="url(#marker-shadow)"
            />
          );
        })}
      </svg>
    );
  }, [tree, expandedNodes, connectorUpdateKey, getElementCenter]);

  // Update connectors when tree, expansion, or zoom changes
  useEffect(() => {
    // Force re-render of connectors after DOM updates
    // Use longer delay to ensure all node refs are properly set
    const timeout1 = setTimeout(() => {
      setConnectorUpdateKey(prev => prev + 1);
    }, 100);
    
    const timeout2 = setTimeout(() => {
      setConnectorUpdateKey(prev => prev + 1);
    }, 300);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [tree, expandedNodes, zoomLevel]);

  // Observe node positions and update connectors
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      setConnectorUpdateKey(prev => prev + 1);
    });

    // Observe all node elements
    nodeRefs.current.forEach((element) => {
      resizeObserver.observe(element);
    });

    // Also observe the container for scroll/zoom changes
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [tree, expandedNodes]);

  // Render a single node with left-to-right layout
  const renderNode = useCallback((
    node: TreeNode, 
    columnIndex: number, 
    nodeIndex: number, 
    totalNodesInColumn: number
  ): React.ReactNode => {
    const hasChildren = node.directReportsCount > 0;
    const isExpanded = expandedNodes.has(node.employee.id);
    const isHighlighted = shouldHighlight(node.employee);

    return (
      <div 
        key={node.employee.id} 
        className="relative flex flex-row items-start flex-shrink-0"
      >
        {/* Column Container */}
        <div className="flex flex-col items-start gap-6">
          {/* Employee Card - Always Static */}
          <div className="relative flex-shrink-0">
            <div 
              ref={(el) => {
                if (el) {
                  nodeRefs.current.set(node.employee.id, el);
                } else {
                  nodeRefs.current.delete(node.employee.id);
                }
              }}
              data-node-card
          className={cn(
                "relative group",
                "bg-gradient-to-br from-background/95 via-background/90 to-background/95",
                "backdrop-blur-xl border rounded-xl",
                "p-4 transition-all duration-300",
                "hover:shadow-lg hover:shadow-primary/10 hover:border-primary/40",
                "cursor-pointer",
                "w-[220px] min-w-[220px] flex flex-col gap-2",
                isHighlighted ? "ring-2 ring-primary shadow-lg border-primary" : "border-border/60 shadow-sm",
                columnIndex === 0 ? "ring-1 ring-primary/20 shadow-md" : ""
          )}
          onClick={() => handleEmployeeClick(node.employee)}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
            >
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

          {/* Expand/Collapse Button */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                    "absolute -right-3 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full z-20",
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
                    <ChevronDown className="h-4 w-4 rotate-90" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
            </div>
          </div>
        </div>

        {/* Children Column - Rendered to the right when expanded */}
        {hasChildren && isExpanded && node.children.length > 0 && (
          <div className="ml-16 flex flex-col items-start gap-6">
            {node.children.map((child, childIdx) => (
              <div key={child.employee.id} className="relative">
                {/* Recursive render for child node (next column) */}
                {renderNode(child, columnIndex + 1, childIdx, node.children.length)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [expandedNodes, searchQuery, localSearchQuery, toggleNode]);

  // Main render function - renders root nodes in a column
  const renderChart = useCallback((): React.ReactNode => {
    if (tree.length === 0) return null;

    return (
      <div className="flex flex-col items-start gap-6">
        {/* Render each root node and its expanded tree in a vertical column */}
        {tree.map((rootNode, idx) => (
          <div key={rootNode.employee.id} className="relative w-full">
            {renderNode(rootNode, 0, idx, tree.length)}
          </div>
        ))}
      </div>
    );
  }, [tree, renderNode]);

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
            Click on any employee to view details. Use the expand button to see direct reportees.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative" ref={searchDropdownRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
              ref={searchInputRef}
              placeholder="Search employees..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              onFocus={() => {
                if (localSearchQuery.trim().length >= 2 && searchResults.length > 0) {
                  setShowSearchDropdown(true);
                }
              }}
              className="pl-9 pr-9 w-64"
            />
            {localSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 z-10"
                onClick={() => {
                  setLocalSearchQuery('');
                  setSearchResults([]);
                  setShowSearchDropdown(false);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}

            {/* Search Results Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2">
                  <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                    Found {searchResults.length} {searchResults.length === 1 ? 'employee' : 'employees'}
                  </div>
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => navigateToEmployee(result)}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={result.photoUrl} alt={result.name} />
                        <AvatarFallback className="text-xs">
                          {result.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{result.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.position}</p>
                        {result.department && (
                          <p className="text-xs text-muted-foreground truncate">{result.department}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Results Message */}
            {showSearchDropdown && localSearchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 p-4">
                <p className="text-sm text-muted-foreground text-center">
                  No employees found matching &quot;{localSearchQuery}&quot;
                </p>
              </div>
            )}
          </div>
          
          {/* Zoom Controls - Hidden */}
          {/* <div className="flex items-center gap-1 border border-border/50 rounded-lg p-1 bg-background/50 backdrop-blur-sm">
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
          </div> */}
        </div>
      </div>

      {/* Organization Chart Container */}
      <div className="relative border border-border/50 rounded-2xl bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        
        <div 
          ref={chartContainerRef}
          className="relative h-[700px] overflow-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left',
            transition: 'transform 0.2s ease-out'
          }}
        >
          <div className="p-8 min-w-max relative">
            {/* SVG Connectors Overlay */}
            {renderConnectors()}
            {/* Tree Nodes */}
            {renderChart()}
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
