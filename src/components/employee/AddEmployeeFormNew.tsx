import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, X } from "lucide-react";
import { useEmployees } from '@/hooks/use-employees';
import { useClients } from '@/hooks/use-clients';
import { useEmployeeStatuses } from '@/hooks/use-employee-statuses';
import { EMPLOYEE_STATUS_OPTIONS, CLIENT_OPTIONS } from "@/lib/utils";

interface AddEmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  departments: string[];
}

export function AddEmployeeForm({ isOpen, onClose, departments }: AddEmployeeFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    employeeId: '',
    firstName: '',
    lastName: '',
    name: '',
    email: '',
    position: '',
    department: '',
    phone: '',
    mobile: '',
    employmentCategory: '',
    gender: '',
    employeeStatus: '',
    account: '',
    isLeader: '',
    location: '',
    dateOfBirth: '',
    dateOfJoining: '',
    bio: '',
    projectStartDate: '',
    projectEndDate: '',
    manager: ''
  });

  const { createEmployee } = useEmployees();
  const { clients: dynamicClients, isLoading: clientsLoading } = useClients();
  const { employeeStatuses: dynamicEmployeeStatuses, isLoading: statusesLoading } = useEmployeeStatuses();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.position || !formData.department || !formData.email) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields (First Name, Last Name, Position, Department, Email).",
        variant: "destructive"
      });
      return;
    }
    
    const newEmployee = await createEmployee({
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`,
      position: formData.position,
      department: formData.department,
      email: formData.email,
      phone: formData.phone,
      mobile: formData.mobile,
      employmentCategory: formData.employmentCategory,
      gender: formData.gender,
      employeeStatus: formData.employeeStatus,
      account: formData.account,
      isLeader: formData.isLeader,
      location: formData.location,
      dateOfBirth: formData.dateOfBirth,
      dateOfJoining: formData.dateOfJoining,
      bio: formData.bio,
      projectStartDate: formData.projectStartDate,
      projectEndDate: formData.projectEndDate,
      photoUrl: photo || undefined
    });
    
    if (newEmployee) {
      // Reset form and close dialog
      setFormData({
        employeeId: '',
        firstName: '',
        lastName: '',
        name: '',
        email: '',
        position: '',
        department: '',
        phone: '',
        mobile: '',
        employmentCategory: '',
        gender: '',
        employeeStatus: '',
        account: '',
        isLeader: '',
        location: '',
        dateOfBirth: '',
        dateOfJoining: '',
        bio: '',
        projectStartDate: '',
        projectEndDate: '',
        manager: ''
      });
      setPhoto(null);
      setPhotoPreview(null);
      onClose();
      
      toast({
        title: "Employee added successfully",
        description: `${newEmployee.name} has been added to the directory.`,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left column - Photo upload */}
            <div className="md:w-1/3 flex flex-col items-center">
              <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50">
                {photoPreview ? (
                  <>
                    <img 
                      src={photoPreview} 
                      alt="Profile preview" 
                      className="w-full h-full object-cover"
                    />
                    <button 
                      type="button"
                      onClick={clearPhoto}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-full"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-xs text-center text-muted-foreground">Upload photo</p>
                  </div>
                )}
                
                <input 
                  type="file" 
                  id="photo-upload" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handlePhotoChange}
                />
                <label 
                  htmlFor="photo-upload"
                  className="absolute inset-0 cursor-pointer"
                ></label>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Recommended: Square image, 300x300px or larger</p>
            </div>
            
            {/* Right column - Form fields */}
            <div className="md:w-2/3 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employeeId">Employee ID</Label>
                    <Input 
                      id="employeeId" 
                      name="employeeId"
                      value={formData.employeeId}
                      onChange={handleChange}
                      placeholder="E0001"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name <span className="text-red-500">*</span></Label>
                    <Input 
                      id="firstName" 
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name <span className="text-red-500">*</span></Label>
                    <Input 
                      id="lastName" 
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                    <Input 
                      id="email" 
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="position">Position <span className="text-red-500">*</span></Label>
                    <Input 
                      id="position" 
                      name="position"
                      value={formData.position}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="department">Department <span className="text-red-500">*</span></Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('department', value)}
                      value={formData.department}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              {/* Employment Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Employment Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employmentCategory">Employment Category</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('employmentCategory', value)}
                      value={formData.employmentCategory}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FTE">FTE</SelectItem>
                        <SelectItem value="Contractor">Contractor</SelectItem>
                        <SelectItem value="Intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="employeeStatus">Employee Status</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('employeeStatus', value)}
                      value={formData.employeeStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {(dynamicEmployeeStatuses.length > 0 ? dynamicEmployeeStatuses : EMPLOYEE_STATUS_OPTIONS).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="account">Account</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('account', value)}
                      value={formData.account}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        {(dynamicClients.length > 0 ? dynamicClients : CLIENT_OPTIONS).map((client) => (
                          <SelectItem key={client} value={client}>
                            {client}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="isLeader">Is Leader</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('isLeader', value)}
                      value={formData.isLeader}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input 
                      id="location" 
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      placeholder="Work location"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange('gender', value)}
                      value={formData.gender}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">MALE</SelectItem>
                        <SelectItem value="FEMALE">FEMALE</SelectItem>
                        <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input 
                      id="phone" 
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile</Label>
                    <Input 
                      id="mobile" 
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input 
                      id="dateOfBirth" 
                      name="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="dateOfJoining">Date of Joining</Label>
                    <Input 
                      id="dateOfJoining" 
                      name="dateOfJoining"
                      type="date"
                      value={formData.dateOfJoining}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
              
              {/* Additional Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Additional Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <textarea 
                    id="bio" 
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Add Employee
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
