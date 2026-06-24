import React, { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eye, Edit2, ChevronUp, ChevronDown } from "lucide-react";
import { EmployeeProfile } from "./employee/EmployeeProfile";
import { EmployeeSelect } from "@/components/ui/employee-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import { Employee, findEmployeeByRef } from '@/hooks/use-employees';

interface EmployeeListProps {
  employees: Employee[];
  updateEmployee?: (id: string, data: Partial<Employee>) => Promise<Employee | null>;
  sortBy?: string;
  sortOrder?: string;
  onSort?: (field: string) => void;
  isAdmin?: boolean;
}

export function EmployeeList({ employees, updateEmployee, sortBy, sortOrder, onSort, isAdmin }: EmployeeListProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);

  // Helper function to get employee name by ID
  const getEmployeeName = (employeeId: string) => {
    const employee = findEmployeeByRef(employees, employeeId);
    return employee ? employee.name : "Unknown";
  };

  // Auto-save function when reporting_to changes
  const handleReportingToChange = async (employeeId: string, reportingToId: string) => {
    if (!updateEmployee) {
      return;
    }

    try {
      await updateEmployee(employeeId, {
        reporting_to: reportingToId || undefined
      });
      setEditingEmployee(null);
    } catch (error) {
      console.error('Error updating employee:', error);
    }
  };

  return (
    <>
      <div className="w-full bg-white dark:bg-gray-800 rounded-lg border border-border overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSort?.("employeeId")}
              >
                <div className="flex items-center">
                  Employee ID
                  {sortBy === "employeeId" && (
                    sortOrder === "asc" ?
                      <ChevronUp className="ml-1 h-4 w-4" /> :
                      <ChevronDown className="ml-1 h-4 w-4" />
                  )}
                </div>
              </TableHead>
              <TableHead className="">Name</TableHead>
              <TableHead className="">Position</TableHead>
              <TableHead className="">Department</TableHead>
              <TableHead className="">Reports To</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => {
              const isInactive = (employee.status || 'active').trim().toLowerCase() === 'inactive';
              return (
                <TableRow
                  key={employee.id}
                  className={isInactive ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                >
                  <TableCell className="font-medium">
                    {employee.employeeId || 'N/A'}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={employee.photoUrl} alt={employee.name} />
                        <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span>{employee.name}</span>
                      {isInactive && (
                        <span className="text-xs text-muted-foreground italic">(Inactive)</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>
                    {editingEmployee === employee.id && !isInactive ? (
                      <EmployeeSelect
                        employees={employees.filter(emp => emp.id !== employee.id)}
                        value={employee.reporting_to}
                        onValueChange={(value) => handleReportingToChange(employee.id, value)}
                        placeholder="Select manager..."
                        className="w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {employee.reporting_to ? getEmployeeName(employee.reporting_to) : "No manager"}
                        </span>
                        {isAdmin && !isInactive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingEmployee(employee.id)}
                            className="h-6 w-6 p-0"
                            disabled={isInactive}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => !isInactive && setSelectedEmployee(employee)}
                      disabled={isInactive}
                      className={isInactive ? 'cursor-not-allowed' : ''}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Profile
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Employee Profile Dialog */}
      {selectedEmployee && (
        <EmployeeProfile
          isOpen={!!selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          employee={{
            ...selectedEmployee,
            photoUrl: selectedEmployee.photoUrl || "",
          }}
        />
      )}
    </>
  );
}
