import React, { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronRight, 
  Users, 
  Loader2,
  AlertCircle,
  RefreshCw
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
  reporting_to?: string;
}

interface HierarchyNode {
  employee: Employee;
  children: HierarchyNode[];
  isExpanded: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  directReportsCount: number;
  level: number;
}

interface EmployeeHierarchyFlowchartProps {
  employees: Employee[];
}

export function EmployeeHierarchyFlowchart({ employees }: EmployeeHierarchyFlowchartProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadedChildren, setLoadedChildren] = useState<Map<string, HierarchyNode[]>>(new Map());

  // Build hierarchy structure
  const buildHierarchy = useCallback(() => {
    try {
      console.log('🔍 Building hierarchy with employees:', employees.length);
      
      // Handle empty employees array
      if (!employees || employees.length === 0) {
        console.log('⚠️ No employees found, setting empty hierarchy');
        setHierarchy([]);
        setError(null);
        setLoading(false);
        return;
      }
      
      // Debug: Check all employees and their reporting relationships
      console.log('📊 All employees data:', employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        reporting_to: emp.reporting_to,
        hasReportingTo: !!emp.reporting_to,
        reportingToExists: emp.reporting_to ? employees.find(e => e.id === emp.reporting_to) : null
      })));
      
      // Debug: Check for the specific missing employee
      const missingEmployee = employees.find(emp => emp.id === 'bf716eb3-b688-4e79-8467-d41cc5db0791');
      if (missingEmployee) {
        console.log('🔍 Missing employee found:', {
          id: missingEmployee.id,
          name: missingEmployee.name,
          reporting_to: missingEmployee.reporting_to,
          reportingToExists: missingEmployee.reporting_to ? employees.find(e => e.id === missingEmployee.reporting_to) : null
        });
      } else {
        console.log('❌ Missing employee NOT found in employees array');
      }
      
      // Find root employees (those who don't report to anyone or report to someone not in the list)
      const rootEmployees = employees.filter(emp => 
        !emp.reporting_to || emp.reporting_to === null || emp.reporting_to.trim() === '' || !employees.find(e => e.id === emp.reporting_to)
      );
      
      // Debug: Check for orphaned employees (employees who report to someone not in the list)
      const orphanedEmployees = employees.filter(emp => 
        emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && !employees.find(e => e.id === emp.reporting_to)
      );
      console.log('🚨 Orphaned employees (report to non-existent manager):', orphanedEmployees.length);
      console.log('📋 Orphaned employees:', orphanedEmployees.map(emp => ({ 
        id: emp.id, 
        name: emp.name, 
        reportsTo: emp.reporting_to
      })));
      
      console.log('🌳 Root employees found:', rootEmployees.length);
      console.log('📋 Root employees:', rootEmployees.map(emp => ({ id: emp.id, name: emp.name })));
      
      // Debug: Check which employees are NOT root employees (i.e., they report to someone)
      const nonRootEmployees = employees.filter(emp => 
        emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && employees.find(e => e.id === emp.reporting_to)
      );
      console.log('👥 Non-root employees (report to someone):', nonRootEmployees.length);
      console.log('📋 Non-root employees:', nonRootEmployees.map(emp => ({ 
        id: emp.id, 
        name: emp.name, 
        reportsTo: emp.reporting_to,
        reportsToName: employees.find(e => e.id === emp.reporting_to)?.name
      })));

      // Calculate total descendants count (including children of children) for each employee
      const calculateTotalDescendants = (employeeId: string, visited: Set<string> = new Set()): number => {
        // Prevent circular references
        if (visited.has(employeeId)) {
          console.warn(`⚠️ Circular reference detected for employee ${employeeId}`);
          return 0;
        }
        
        visited.add(employeeId);
        
        const directReports = employees.filter(emp => emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && emp.reporting_to === employeeId);
        let totalCount = directReports.length;
        
        // Recursively count children of children
        directReports.forEach(child => {
          totalCount += calculateTotalDescendants(child.id, new Set(visited));
        });
        
        return totalCount;
      };

      const totalDescendantsCount = new Map<string, number>();
      employees.forEach(emp => {
        totalDescendantsCount.set(emp.id, calculateTotalDescendants(emp.id));
      });

      // Create initial hierarchy nodes
      const createNode = (employee: Employee, level: number = 0): HierarchyNode => ({
        employee,
        children: [],
        isExpanded: false,
        isLoading: false,
        hasLoaded: false,
        directReportsCount: totalDescendantsCount.get(employee.id) || 0,
        level
      });

      // Create root nodes and sort by hierarchy level (position-based)
      const rootNodes = rootEmployees.map(emp => createNode(emp, 0));
      
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
      
      console.log('📊 Root employees sorted by hierarchy level:', rootNodes.map(node => ({
        name: node.employee.name,
        position: node.employee.position,
        level: getHierarchyLevel(node.employee.position)
      })));
      
      // Debug: Verify all employees are accounted for
      const allAccountedEmployees = new Set<string>();
      rootNodes.forEach(node => {
        allAccountedEmployees.add(node.employee.id);
        // Add all descendants
        const addDescendants = (node: HierarchyNode) => {
          node.children.forEach(child => {
            allAccountedEmployees.add(child.employee.id);
            addDescendants(child);
          });
        };
        addDescendants(node);
      });
      
      const missingFromHierarchy = employees.filter(emp => !allAccountedEmployees.has(emp.id));
      console.log('🔍 Employees missing from hierarchy:', missingFromHierarchy.length);
      console.log('📋 Missing employees:', missingFromHierarchy.map(emp => ({ 
        id: emp.id, 
        name: emp.name, 
        reporting_to: emp.reporting_to
      })));
      
      // If there are missing employees, add them as root employees ONLY if they are truly orphaned
      if (missingFromHierarchy.length > 0) {
        console.log('🔧 Checking missing employees for proper categorization');
        
        // Only add truly orphaned employees as root employees
        const trulyOrphanedEmployees = missingFromHierarchy.filter(emp => 
          !emp.reporting_to || emp.reporting_to === null || emp.reporting_to.trim() === '' || !employees.find(e => e.id === emp.reporting_to)
        );
        
        console.log('🚨 Truly orphaned employees to add as root:', trulyOrphanedEmployees.length);
        console.log('📋 Truly orphaned employees:', trulyOrphanedEmployees.map(emp => ({ 
          id: emp.id, 
          name: emp.name, 
          reporting_to: emp.reporting_to
        })));
        
        if (trulyOrphanedEmployees.length > 0) {
          const missingNodes = trulyOrphanedEmployees.map(emp => createNode(emp, 0));
          rootNodes.push(...missingNodes);
        }
        
        // Check for employees that should be under managers but aren't showing up
        const employeesWithValidManagers = missingFromHierarchy.filter(emp => 
          emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && employees.find(e => e.id === emp.reporting_to)
        );
        
        if (employeesWithValidManagers.length > 0) {
          console.log('⚠️ Employees with valid managers but missing from hierarchy:', employeesWithValidManagers.length);
          console.log('📋 These employees should appear under their managers:', employeesWithValidManagers.map(emp => ({ 
            id: emp.id, 
            name: emp.name, 
            reportsTo: emp.reporting_to,
            reportsToName: employees.find(e => e.id === emp.reporting_to)?.name
          })));
        }
      }
      
      setHierarchy(rootNodes);
      setError(null);
      
      // Final verification: Check for duplicates
      const finalEmployeeIds = new Set<string>();
      const duplicates: string[] = [];
      
      const checkForDuplicates = (nodes: HierarchyNode[]) => {
        nodes.forEach(node => {
          if (finalEmployeeIds.has(node.employee.id)) {
            duplicates.push(node.employee.id);
            console.warn(`⚠️ Duplicate employee found: ${node.employee.id} (${node.employee.name})`);
          } else {
            finalEmployeeIds.add(node.employee.id);
          }
          checkForDuplicates(node.children);
        });
      };
      
      checkForDuplicates(rootNodes);
      
      if (duplicates.length > 0) {
        console.error('❌ Duplicates found in hierarchy:', duplicates);
      } else {
        console.log('✅ No duplicates found in hierarchy');
      }
      
      // Final summary
      console.log('✅ Hierarchy built successfully:');
      console.log(`📊 Total employees: ${employees.length}`);
      console.log(`🌳 Root employees: ${rootEmployees.length}`);
      console.log(`👥 Non-root employees: ${nonRootEmployees.length}`);
      console.log(`🚨 Orphaned employees: ${orphanedEmployees.length}`);
      console.log(`🔍 Missing from hierarchy: ${missingFromHierarchy.length}`);
      console.log(`📋 Final hierarchy nodes: ${rootNodes.length}`);
      console.log(`🔄 Unique employees in hierarchy: ${finalEmployeeIds.size}`);
      console.log(`⚠️ Duplicates: ${duplicates.length}`);
    } catch (err) {
      console.error('❌ Error building hierarchy:', err);
      setError(`Failed to build hierarchy structure: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [employees]);

  // Load children for a specific node
  const loadChildren = useCallback(async (nodeId: string) => {
    try {
      setHierarchy(prev => 
        prev.map(updateNodeLoading(nodeId, true))
      );

      // Find direct reports
      const directReports = employees.filter(emp => emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && emp.reporting_to === nodeId);
      
      console.log(`🔍 Loading children for ${nodeId}:`, directReports.length, 'direct reports found');
      console.log('📋 Direct reports:', directReports.map(emp => ({ id: emp.id, name: emp.name })));
      
      // Calculate total descendants count (including children of children) for each employee
      const calculateTotalDescendants = (employeeId: string, visited: Set<string> = new Set()): number => {
        // Prevent circular references
        if (visited.has(employeeId)) {
          console.warn(`⚠️ Circular reference detected for employee ${employeeId}`);
          return 0;
        }
        
        visited.add(employeeId);
        
        const directReports = employees.filter(emp => emp.reporting_to && emp.reporting_to !== null && emp.reporting_to.trim() !== '' && emp.reporting_to === employeeId);
        let totalCount = directReports.length;
        
        // Recursively count children of children
        directReports.forEach(child => {
          totalCount += calculateTotalDescendants(child.id, new Set(visited));
        });
        
        return totalCount;
      };

      const totalDescendantsCount = new Map<string, number>();
      employees.forEach(emp => {
        totalDescendantsCount.set(emp.id, calculateTotalDescendants(emp.id));
      });

      // Create child nodes
      const childNodes: HierarchyNode[] = directReports.map(emp => ({
        employee: emp,
        children: [],
        isExpanded: false,
        isLoading: false,
        hasLoaded: false,
        directReportsCount: totalDescendantsCount.get(emp.id) || 0,
        level: (employees.find(e => e.id === nodeId)?.reporting_to ? 
          employees.find(e => e.id === nodeId)!.reporting_to!.split('.').length : 0) + 1
      }));
      
      // Sort child nodes by hierarchy level, then by name
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
      
      childNodes.sort((a, b) => {
        const levelA = getHierarchyLevel(a.employee.position);
        const levelB = getHierarchyLevel(b.employee.position);
        
        if (levelA !== levelB) {
          return levelA - levelB; // Lower level number = higher in hierarchy
        }
        
        // If same level, sort by name
        return a.employee.name.localeCompare(b.employee.name);
      });
      
      console.log(`📊 Children for ${nodeId} sorted by hierarchy level:`, childNodes.map(node => ({
        name: node.employee.name,
        position: node.employee.position,
        level: getHierarchyLevel(node.employee.position)
      })));

      // Cache the children
      setLoadedChildren(prev => new Map(prev).set(nodeId, childNodes));

      // Update hierarchy
      setHierarchy(prev => 
        prev.map(updateNodeChildren(nodeId, childNodes, true))
      );

    } catch (err) {
      setError('Failed to load children');
    } finally {
      setHierarchy(prev => 
        prev.map(updateNodeLoading(nodeId, false))
      );
    }
  }, [employees, updateNodeChildren, updateNodeLoading]);

  // Helper function to update node loading state
  const updateNodeLoading = useCallback((nodeId: string, isLoading: boolean) => (node: HierarchyNode): HierarchyNode => {
    if (node.employee.id === nodeId) {
      return { ...node, isLoading };
    }
    return {
      ...node,
      children: node.children.map(updateNodeLoading(nodeId, isLoading))
    };
  }, []);

  // Helper function to update node children
  const updateNodeChildren = useCallback((nodeId: string, children: HierarchyNode[], hasLoaded: boolean) => (node: HierarchyNode): HierarchyNode => {
    if (node.employee.id === nodeId) {
      return { ...node, children, hasLoaded };
    }
    return {
      ...node,
      children: node.children.map(updateNodeChildren(nodeId, children, hasLoaded))
    };
  }, []);

  // Toggle node expansion
  const toggleNode = useCallback(async (nodeId: string) => {
    const node = findNodeById(hierarchy, nodeId);
    if (!node) return;

    if (!node.isExpanded && !node.hasLoaded) {
      // Load children if not already loaded
      await loadChildren(nodeId);
    }

    setHierarchy(prev => 
      prev.map(toggleNodeExpansion(nodeId))
    );
  }, [hierarchy, loadChildren, findNodeById, toggleNodeExpansion]);

  // Helper function to toggle node expansion
  const toggleNodeExpansion = useCallback((nodeId: string) => (node: HierarchyNode): HierarchyNode => {
    if (node.employee.id === nodeId) {
      return { ...node, isExpanded: !node.isExpanded };
    }
    return {
      ...node,
      children: node.children.map(toggleNodeExpansion(nodeId))
    };
  }, []);

  // Find node by ID
  const findNodeById = useCallback((nodes: HierarchyNode[], id: string): HierarchyNode | null => {
    for (const node of nodes) {
      if (node.employee.id === id) return node;
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
    return null;
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent, nodeId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleNode(nodeId);
    }
  }, [toggleNode]);

  // Render a single node
  const renderNode = (node: HierarchyNode, depth: number = 0) => {
    const hasChildren = node.directReportsCount > 0;
    const canExpand = hasChildren && !node.hasLoaded;
    const isExpanded = node.isExpanded;

    return (
      <div key={node.employee.id} className="relative">
        <div 
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-all duration-200",
            "hover:bg-accent/50 cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            depth > 0 && "ml-6 border-l-2 border-l-primary/20"
          )}
          style={{ marginLeft: `${depth * 24}px` }}
          onClick={() => toggleNode(node.employee.id)}
          onKeyDown={(e) => handleKeyDown(e, node.employee.id)}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
          aria-label={`${node.employee.name}, ${node.position}, ${node.directReportsCount} team members`}
        >
          {/* Expand/Collapse Button */}
          <div className="flex items-center justify-center w-6 h-6">
            {node.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
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
            ) : (
              <div className="w-4 h-4" />
            )}
          </div>

          {/* Employee Avatar */}
          <Avatar className="h-10 w-10">
            <AvatarImage src={node.employee.photoUrl} alt={node.employee.name} />
            <AvatarFallback className="text-sm">
              {node.employee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Employee Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{node.employee.name}</h3>
              {node.directReportsCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {node.directReportsCount}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{node.employee.position}</p>
            <p className="text-xs text-muted-foreground truncate">{node.employee.department}</p>
          </div>
        </div>

        {/* Children */}
        {isExpanded && node.children.length > 0 && (
          <div className="mt-2">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Initialize hierarchy on mount
  useEffect(() => {
    buildHierarchy();
  }, [buildHierarchy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Building hierarchy...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">Error Loading Hierarchy</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={buildHierarchy} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Users className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="font-semibold text-lg">No Hierarchy Data</h3>
          <p className="text-muted-foreground">
            No reporting relationships found. Set up reporting_to relationships to see the hierarchy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Organization Hierarchy</h2>
          <p className="text-muted-foreground">
            Click on any employee to see their direct reports
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{employees.length} employees</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            {hierarchy.map(node => renderNode(node))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
