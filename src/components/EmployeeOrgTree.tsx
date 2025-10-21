import React, { useState, useEffect, useCallback } from 'react';
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
  User
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

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
  isExpanded: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  directReportsCount: number;
  level: number;
}

interface EmployeeOrgTreeProps {
  employees: Employee[];
}

interface EmployeeDetailModalProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
}

function EmployeeDetailModal({ employee, isOpen, onClose }: EmployeeDetailModalProps) {
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

          {/* Employment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Employment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Date of Joining:</span>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(employee.date_of_joining)}
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Date of Birth:</span>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(employee.date_of_birth)}
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Account:</span>
                  <p className="text-sm text-muted-foreground">{employee.account || 'Not specified'}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Gender:</span>
                  <p className="text-sm text-muted-foreground">{employee.gender || 'Not specified'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

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

export function EmployeeOrgTree({ employees }: EmployeeOrgTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Build complete tree structure with all children loaded
  const buildTree = useCallback(() => {
    try {
      // Find root employees (those who don't report to anyone or report to someone not in the list)
      const rootEmployees = employees.filter(emp => 
        !emp.reporting_to || !employees.find(e => e.id === emp.reporting_to)
      );

      // Calculate direct reports count for each employee
      const directReportsCount = new Map<string, number>();
      employees.forEach(emp => {
        if (emp.reporting_to) {
          directReportsCount.set(emp.reporting_to, (directReportsCount.get(emp.reporting_to) || 0) + 1);
        }
      });

      // Recursively build tree with all children loaded
      const buildNodeWithChildren = (employee: Employee, level: number = 0): TreeNode => {
        const directReports = employees.filter(emp => emp.reporting_to === employee.id);
        const children = directReports.map(child => buildNodeWithChildren(child, level + 1));
        
        return {
          employee,
          children,
          isExpanded: true, // Default to expanded
          isLoading: false,
          hasLoaded: true, // All children are pre-loaded
          directReportsCount: directReportsCount.get(employee.id) || 0,
          level
        };
      };

      const rootNodes = rootEmployees.map(emp => buildNodeWithChildren(emp, 0));
      setTree(rootNodes);
      setError(null);
    } catch (err) {
      setError('Failed to build tree structure');
    } finally {
      setLoading(false);
    }
  }, [employees]);

  // Toggle node expansion (simplified since all children are pre-loaded)
  const toggleNode = useCallback((nodeId: string) => {
    setTree(prev => 
      prev.map(toggleNodeExpansion(nodeId))
    );
  }, [toggleNodeExpansion]);

  // Helper function to toggle node expansion
  const toggleNodeExpansion = (nodeId: string) => (node: TreeNode): TreeNode => {
    if (node.employee.id === nodeId) {
      return { ...node, isExpanded: !node.isExpanded };
    }
    return {
      ...node,
      children: node.children.map(toggleNodeExpansion(nodeId))
    };
  };

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

  // Calculate dynamic card width based on tree depth and complexity
  const getCardWidth = (node: TreeNode, depth: number) => {
    const baseWidth = 180;
    const maxWidth = 220;
    const minWidth = 140;
    
    // Reduce width for deeper levels to fit more nodes
    const depthReduction = depth * 8;
    const calculatedWidth = Math.max(minWidth, Math.min(maxWidth, baseWidth - depthReduction));
    
    return calculatedWidth;
  };

  // Render a single tree node horizontally
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.directReportsCount > 0;
    const isExpanded = node.isExpanded;
    const cardWidth = getCardWidth(node, depth);

    return (
      <div key={node.employee.id} className="flex flex-col items-center">
        {/* Employee Card */}
        <div 
          className={cn(
            "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200",
            "hover:bg-accent/50 cursor-pointer group relative shadow-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "bg-background hover:shadow-md"
          )}
          style={{ width: `${cardWidth}px` }}
          onClick={() => handleEmployeeClick(node.employee)}
          onKeyDown={(e) => handleKeyDown(e, node.employee.id)}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
          aria-label={`${node.employee.name}, ${node.position}, ${node.directReportsCount} direct reports`}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-background border shadow-sm z-10"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.employee.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
          
          {/* Employee Avatar */}
          <Avatar className={cn(
            "ring-2 ring-background group-hover:ring-primary/20 transition-all",
            depth === 0 ? "h-14 w-14" : "h-12 w-12"
          )}>
            <AvatarImage src={node.employee.photoUrl} alt={node.employee.name} />
            <AvatarFallback className={cn(
              "font-semibold",
              depth === 0 ? "text-base" : "text-sm"
            )}>
              {node.employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Employee Info */}
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-1 mb-1">
              <h3 className={cn(
                "font-semibold truncate",
                depth === 0 ? "text-sm" : "text-xs"
              )} style={{ maxWidth: `${cardWidth - 40}px` }}>
                {node.employee.name}
              </h3>
              {node.directReportsCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1 py-0">
                  <Users className="h-3 w-3 mr-1" />
                  {node.directReportsCount}
                </Badge>
              )}
            </div>
            <p className={cn(
              "text-muted-foreground truncate font-medium",
              depth === 0 ? "text-xs" : "text-xs"
            )} style={{ maxWidth: `${cardWidth - 20}px` }}>
              {node.employee.position}
            </p>
            <p className="text-xs text-muted-foreground truncate" style={{ maxWidth: `${cardWidth - 20}px` }}>
              {node.employee.department}
            </p>
            {node.employee.location && (
              <p className="text-xs text-muted-foreground truncate" style={{ maxWidth: `${cardWidth - 20}px` }}>
                {node.employee.location}
              </p>
            )}
          </div>
        </div>

        {/* Vertical Connector Line */}
        {hasChildren && isExpanded && (
          <div className="w-0.5 h-6 bg-primary/30 my-2"></div>
        )}

        {/* Children - Horizontal Layout with dynamic spacing */}
        {isExpanded && node.children.length > 0 && (
          <div className="flex gap-4 items-start mt-2">
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
          <span>Building organization tree...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">Error Loading Tree</h3>
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
          <h3 className="font-semibold text-lg">No Organization Tree</h3>
          <p className="text-muted-foreground">
            No reporting relationships found. Set up reporting_to relationships to see the organization tree.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Organization Tree</h2>
          <p className="text-muted-foreground">
            Click on any employee to view their details
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{employees.length} employees</span>
        </div>
      </div>

      {/* Enhanced tree container with better scrolling */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="h-[600px] overflow-auto">
          <div className="p-6">
            <div className="flex flex-col items-center min-w-max">
              {tree.map(node => renderTreeNode(node))}
            </div>
          </div>
        </div>
      </div>

      {/* Employee Detail Modal */}
      <EmployeeDetailModal
        employee={selectedEmployee}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEmployee(null);
        }}
      />
    </div>
  );
}
