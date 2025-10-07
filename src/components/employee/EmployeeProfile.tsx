import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Edit2, X, Upload, User, Building, MapPin, Mail, Phone, Calendar, Award, Save, Clock } from "lucide-react";
import { useEmployees } from '@/hooks/use-employees';
import { authenticatedFetch } from "@/utils/auth-utils";
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";

interface EmployeeProfileProps {
  isOpen: boolean;
  onClose: () => void;
  employee: {
    id: string;
    employeeId?: string;
    name: string;
    position: string;
    department: string;
    photoUrl: string;
    email?: string;
    phone?: string;
    mobile?: string;
    bio?: string;
    startDate?: string;
    skills?: string[];
    expertise?: string;
    experienceYears?: number;
    manager?: string;
    reporting_to?: string;
    location?: string;
    dateOfBirth?: string;
    dateOfJoining?: string;
    gender?: string;
  };
}

export function EmployeeProfile({ isOpen, onClose, employee }: EmployeeProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState(employee);
  const [photo, setPhoto] = useState<File | null>(null);
  const [managerName, setManagerName] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [skillsInput, setSkillsInput] = useState<string>('');
  const { toast } = useToast();
  const isAdmin = true; // For demo purposes, assume admin
  const { updateEmployee, employees, fetchEmployees } = useEmployees();
  
  // Debug logging - COMPREHENSIVE
  console.log('🔍 EmployeeProfile DEBUGGING:');
  console.log('📥 Received employee prop:', {
    id: employee.id,
    employeeId: employee.employeeId,
    name: employee.name,
    dateOfBirth: employee.dateOfBirth,
    dateOfJoining: employee.dateOfJoining,
    experienceYears: employee.experienceYears,
    email: employee.email,
    phone: employee.phone
  });
  
  console.log('📊 ProfileData state:', {
    id: profileData.id,
    employeeId: profileData.employeeId,
    name: profileData.name,
    dateOfBirth: profileData.dateOfBirth,
    dateOfJoining: profileData.dateOfJoining,
    experienceYears: profileData.experienceYears,
    email: profileData.email,
    phone: profileData.phone
  });

  // Update profileData when employee prop changes
  useEffect(() => {
    setProfileData(employee);
    // Initialize skills input with current skills
    setSkillsInput(employee.skills ? employee.skills.join(', ') : '');
  }, [employee]);

  // Update profileData when employees list changes (in case of updates from other components)
  useEffect(() => {
    const updatedEmployee = employees.find(emp => emp.id === employee.id);
    if (updatedEmployee) {
      setProfileData({
        ...updatedEmployee,
        photoUrl: updatedEmployee.photoUrl || ""
      });
      // Also update skills input
      setSkillsInput(updatedEmployee.skills ? updatedEmployee.skills.join(', ') : '');
    }
  }, [employees, employee.id]);

  // Get unique departments, locations, and managers for dropdowns
  const departments = [...new Set(employees.map(emp => emp.department).filter(Boolean))];
  const locations = [...new Set(employees.map(emp => emp.location).filter(Boolean))];
  const managers = employees.filter(emp => emp.id !== employee.id); // Exclude current employee
  
  // Ensure arrays are not empty and have valid values
  const validDepartments = departments.filter(dept => dept && dept.trim() !== '');
  const validLocations = locations.filter(loc => loc && loc.trim() !== '');
  
  // Gender options
  const genderOptions = ['MALE', 'FEMALE'];

  // Sync profileData with employee prop when it changes
  useEffect(() => {
    setProfileData(employee);
  }, [employee]);

  // Find manager name from reporting_to UUID
  useEffect(() => {
    if (employee.reporting_to && employees.length > 0) {
      const manager = employees.find(emp => emp.id === employee.reporting_to);
      if (manager) {
        setManagerName(manager.name);
      } else {
        setManagerName('Manager not found');
      }
    } else {
      setManagerName('No manager assigned');
    }
  }, [employee.reporting_to, employees]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      console.log("Photo file selected:", file.name, file.size, "bytes");
    }
  };

  const calculateExperience = (dateOfJoining?: string) => {
    if (!dateOfJoining) return 'N/A';
    
    try {
      const joiningDate = new Date(dateOfJoining);
      const currentDate = new Date();
      
      // Calculate the difference in years
      let years = currentDate.getFullYear() - joiningDate.getFullYear();
      let months = currentDate.getMonth() - joiningDate.getMonth();
      
      // Adjust if the current month is before the joining month
      if (months < 0) {
        years--;
        months += 12;
      }
      
      // Calculate days for more precise calculation
      const daysDiff = currentDate.getDate() - joiningDate.getDate();
      if (daysDiff < 0) {
        months--;
      }
      
      // Format the experience
      if (years === 0 && months === 0) {
        return 'Less than 1 month';
      } else if (years === 0) {
        return `${months} month${months > 1 ? 's' : ''}`;
      } else if (months === 0) {
        return `${years} year${years > 1 ? 's' : ''}`;
      } else {
        return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
      }
    } catch {
      return 'N/A';
    }
  };

  const handleSubmit = async () => {
    setIsUpdating(true);
    try {
      let photoUrl = profileData.photoUrl;
      
      // Upload photo if one is selected
      if (photo) {
        console.log("Uploading photo before updating employee...");
        const formData = new FormData();
        formData.append('file', photo);
        formData.append('name', employee.name);
        
        const response = await authenticatedFetch(`http://localhost:8000/api/employees/upload-photo/${employee.id}`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to upload image');
        }
        
        const data = await response.json();
        console.log("Photo uploaded successfully:", data.photo_url);
        photoUrl = data.photo_url;
        
        // Clear the photo state since it's now uploaded
        setPhoto(null);
      }
      
      // Update employee with all data including new photo URL
      const updatedEmployee = await updateEmployee(employee.id, {
        email: profileData.email,
        phone: profileData.phone,
        mobile: profileData.mobile,
        department: profileData.department,
        reporting_to: profileData.reporting_to,
        bio: profileData.bio,
        photoUrl: photoUrl,
        skills: profileData.skills,
        expertise: profileData.expertise,
        experienceYears: profileData.experienceYears,
        location: profileData.location,
        gender: profileData.gender,
        dateOfBirth: profileData.dateOfBirth,
        dateOfJoining: profileData.dateOfJoining
      });
      
      if (updatedEmployee) {
        console.log("✅ Employee update successful:", updatedEmployee);
        
        // Update local state with the complete updated employee data
        setProfileData(prev => {
          const newData = {
            ...prev,
            ...updatedEmployee,
            photoUrl: photoUrl
          };
          console.log("🔄 Updating profileData from:", prev, "to:", newData);
          return newData;
        });
        
        // Update skills input with the new skills
        setSkillsInput(updatedEmployee.skills ? updatedEmployee.skills.join(', ') : '');
        
        // Force refresh the global employees list to ensure Directory gets updated
        console.log("🔄 Refreshing global employees list...");
        await fetchEmployees();
        
        setIsEditing(false);
        toast({
          title: "Success",
          description: "Profile updated successfully",
        });
      } else {
        console.warn("⚠️ Employee update returned null/undefined");
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setProfileData(employee); // Reset to original data
    setSkillsInput(employee.skills ? employee.skills.join(', ') : ''); // Reset skills input
    setPhoto(null); // Clear selected photo
    setIsEditing(false);
  };


  return (
    <Dialog open={isOpen} onOpenChange={() => {
      setIsEditing(false);
      onClose();
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        {/* Fixed Header Section */}
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12" key={profileData.photoUrl}>
              <AvatarImage src={profileData.photoUrl} alt={profileData.name} />
              <AvatarFallback className="text-lg">
                {profileData.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{profileData.name}</h2>
              <p className="text-sm text-muted-foreground">{profileData.position}</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-4 w-4" />
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleCancel}>
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      className="gap-2" 
                      onClick={handleSubmit}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Loading Overlay */}
        {isUpdating && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Updating profile...</p>
            </div>
          </div>
        )}

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-1">

          {/* Profile Picture Section */}
          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Profile Picture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Avatar className="h-20 w-20 flex-shrink-0" key={`profile-${profileData.photoUrl}`}>
                    <AvatarImage src={profileData.photoUrl} alt={profileData.name} />
                    <AvatarFallback className="text-lg">
                      {profileData.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-3 flex-1 min-w-0 overflow-hidden">
                    <div className="space-y-2">
                      <Label htmlFor="profile-picture" className="text-sm font-medium">
                        Choose Profile Picture
                      </Label>
                      <div className="w-full">
                        <Input
                          id="profile-picture"
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoChange}
                          className="h-14 w-full cursor-pointer file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:transition-colors file:min-w-fit file:whitespace-nowrap"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload a new profile picture (JPG, PNG, GIF). Maximum file size: 5MB
                    </p>
                    {photo && (
                      <p className="text-xs text-blue-600 font-medium">
                        📷 Photo selected: {photo.name}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                {/* Employee ID - Read Only */}
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input 
                    id="employeeId"
                    value={profileData.employeeId || ''} 
                    disabled
                    className="bg-muted"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email"
                    name="email"
                    type="email"
                    value={profileData.email || ''} 
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input 
                    id="phone"
                    name="phone"
                    value={profileData.phone || profileData.mobile || ''} 
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                  />
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  {isEditing ? (
                    <Select 
                      value={profileData.location || 'none'} 
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, location: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Location</SelectItem>
                        {validLocations.length > 0 ? (
                          validLocations.map((location) => (
                            <SelectItem key={location} value={location}>
                              {location}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No locations available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value={profileData.location || 'Not provided'} 
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>

                {/* Department */}
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  {isEditing ? (
                    <Select 
                      value={profileData.department || 'none'} 
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, department: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {validDepartments.length > 0 ? (
                          validDepartments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No departments available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value={profileData.department || 'Not provided'} 
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>

                {/* Manager */}
                <div className="space-y-2">
                  <Label htmlFor="manager">Manager</Label>
                  {isEditing ? (
                    <Select 
                      value={profileData.reporting_to || 'none'} 
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, reporting_to: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.name} ({manager.position})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value={managerName || 'Not provided'} 
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  {isEditing ? (
                    <Select 
                      value={profileData.gender || 'none'} 
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, gender: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Prefer not to say</SelectItem>
                        {genderOptions.map((gender) => (
                          <SelectItem key={gender} value={gender}>
                            {gender}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input 
                      value={profileData.gender || 'Not provided'} 
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>

                {/* Date of Birth */}
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input 
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={profileData.dateOfBirth || ''} 
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                  />
                </div>

                {/* Date of Joining */}
                <div className="space-y-2">
                  <Label htmlFor="dateOfJoining">Date of Joining</Label>
                  <Input 
                    id="dateOfJoining"
                    name="dateOfJoining"
                    type="date"
                    value={profileData.dateOfJoining || ''} 
                    onChange={handleChange}
                    disabled={!isEditing}
                    className={!isEditing ? "bg-muted" : ""}
                  />
                </div>

                {/* Experience At Info Services - Only show in view mode */}
                {!isEditing && profileData.dateOfJoining && (
                  <div className="space-y-2">
                    <Label htmlFor="experience">Experience At Info Services</Label>
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {calculateExperience(profileData.dateOfJoining)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bio Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Bio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea 
                    id="bio" 
                    name="bio"
                    value={profileData.bio || ''} 
                    onChange={handleChange}
                    rows={4}
                    placeholder="Enter employee biography..."
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{profileData.bio || 'No bio provided'}</p>
              )}
            </CardContent>
          </Card>

          {/* Skills Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5" />
                Skills
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  <Label htmlFor="skills">Skills (comma-separated)</Label>
                  <Input 
                    id="skills" 
                    name="skills"
                    value={skillsInput} 
                    onChange={(e) => {
                      // Allow user to type freely, including commas
                      setSkillsInput(e.target.value);
                    }}
                    onBlur={() => {
                      // Convert to skills array when user finishes typing
                      const skillsArray = skillsInput.split(',').map(skill => skill.trim()).filter(skill => skill);
                      setProfileData(prev => ({ ...prev, skills: skillsArray }));
                    }}
                    placeholder="Enter skills separated by commas (e.g., React, Node.js, Python, Machine Learning)"
                  />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      💡 Type skills separated by commas. You can type commas freely - they will be processed when you finish typing.
                    </p>
                    <p className="text-xs text-blue-600">
                      ✅ Example: "React, Node.js, Python, Machine Learning"
                    </p>
                    {skillsInput && (
                      <p className="text-xs text-green-600">
                        📝 You can see your input: "{skillsInput}"
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {profileData.skills && profileData.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profileData.skills.map((skill, index) => (
                        <span key={index} className="px-2 py-1 bg-muted rounded-md text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No skills provided</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Expertise Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5" />
                Expertise
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  <Label htmlFor="expertise">Expertise</Label>
                  {/* Expertise dropdown populated from existing employees' expertise values */}
                  <Select
                    value={profileData.expertise || ''}
                    onValueChange={(value) => setProfileData(prev => ({ ...prev, expertise: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select expertise" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Unique expertise values across employees */}
                      {[...new Set((employees || []).map(e => e.expertise).filter(Boolean))].map((exp) => (
                        <SelectItem key={String(exp)} value={String(exp)}>
                          {String(exp)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {profileData.expertise || 'No expertise provided'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Experience Years Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Experience Years
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-2">
                  <Label htmlFor="experienceYears">Experience Years</Label>
                  <Input 
                    id="experienceYears" 
                    name="experienceYears"
                    type="number"
                    min="0"
                    max="50"
                    value={profileData.experienceYears || ''} 
                    onChange={handleChange}
                    placeholder="Enter years of experience"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {profileData.experienceYears ? `${profileData.experienceYears} years` : 'No experience provided'}
                </p>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}