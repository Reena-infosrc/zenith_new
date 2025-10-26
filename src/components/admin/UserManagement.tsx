import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Trash2, Edit, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/config/api";
import { authenticatedFetch } from "@/utils/auth-utils";

interface Admin {
  id: string;
  employee_id: string;
  email: string;
  name: string;
  department?: string;
  position?: string;
  created_at: string;
  created_by?: string;
  is_active: boolean;
}

interface Employee {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  position: string;
}

interface UserManagementProps {
  onClose?: () => void;
}

export function UserManagement({ onClose }: UserManagementProps) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const { toast } = useToast();

  // Form state for adding new admin
  const [formData, setFormData] = useState({
    employee_id: "",
    email: "",
    name: "",
    department: "",
    position: ""
  });

  const fetchAdmins = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/auth-admins`);
      if (response.ok) {
        const data = await response.json();
        // Handle both array and object responses
        const adminsData = Array.isArray(data) ? data : (data.admins || []);
        setAdmins(adminsData);
      } else {
        throw new Error("Failed to fetch admins");
      }
    } catch (error) {
      console.error("Error fetching admins:", error);
      toast({
        title: "Error",
        description: "Failed to fetch admins",
        variant: "destructive"
      });
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
      } else {
        throw new Error("Failed to fetch employees");
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast({
        title: "Error",
        description: "Failed to fetch employees",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
    fetchEmployees();
  }, [fetchAdmins, fetchEmployees]);

  const handleAddAdmin = async () => {
    if (!formData.employee_id || !formData.email || !formData.name) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/auth-admins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Admin added successfully",
        });
        setIsAddDialogOpen(false);
        setFormData({
          employee_id: "",
          email: "",
          name: "",
          department: "",
          position: ""
        });
        fetchAdmins();
      } else {
        const error = await response.json();
        throw new Error(error.detail || "Failed to add admin");
      }
    } catch (error) {
      console.error("Error adding admin:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add admin",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm("Are you sure you want to remove this admin?")) {
      return;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/auth-admins/${adminId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Admin removed successfully",
        });
        fetchAdmins();
      } else {
        throw new Error("Failed to remove admin");
      }
    } catch (error) {
      console.error("Error removing admin:", error);
      toast({
        title: "Error",
        description: "Failed to remove admin",
        variant: "destructive"
      });
    }
  };

  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFormData({
      employee_id: employee.employee_id,
      email: employee.email,
      name: employee.name,
      department: employee.department,
      position: employee.position
    });
  };

  const filteredEmployees = employees.filter(emp => {
    // Only filter out employees who are already admins if admins is an array
    if (Array.isArray(admins) && admins.some(admin => admin.employee_id === emp.employee_id)) {
      return false;
    }
    
    // Filter by search term
    return emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
           emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage admin users and permissions</p>
        </div>
        
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl w-full">
            <DialogHeader>
              <DialogTitle>Add New Admin</DialogTitle>
              <DialogDescription>
                Select an employee to grant admin privileges
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="search">Search Employees</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, email, or employee ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>{employee.employee_id}</TableCell>
                        <TableCell>{employee.name}</TableCell>
                        <TableCell>{employee.email}</TableCell>
                        <TableCell>{employee.department}</TableCell>
                        <TableCell>{employee.position}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEmployeeSelect(employee)}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedEmployee && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Selected Employee</CardTitle>
                    <CardDescription>Review details before adding as admin</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Employee ID</Label>
                        <Input value={formData.employee_id} readOnly />
                      </div>
                      <div>
                        <Label>Name</Label>
                        <Input value={formData.name} readOnly />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input value={formData.email} readOnly />
                      </div>
                      <div>
                        <Label>Department</Label>
                        <Input value={formData.department} readOnly />
                      </div>
                      <div className="col-span-2">
                        <Label>Position</Label>
                        <Input value={formData.position} readOnly />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAdmin} disabled={!selectedEmployee}>
                Add Admin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Admins</CardTitle>
          <CardDescription>
            Users with administrative privileges ({admins.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>{admin.employee_id}</TableCell>
                  <TableCell>{admin.name}</TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>{admin.department || "N/A"}</TableCell>
                  <TableCell>{admin.position || "N/A"}</TableCell>
                  <TableCell>
                    {new Date(admin.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={admin.is_active ? "default" : "secondary"}>
                      {admin.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteAdmin(admin.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
