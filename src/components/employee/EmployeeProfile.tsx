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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Edit2, X, Upload, User, Building, MapPin, Mail, Phone, Calendar, Award, Save, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useEmployees } from '@/hooks/use-employees';
import { useClients } from '@/hooks/use-clients';
import { useEmployeeStatuses } from '@/hooks/use-employee-statuses';
import { useAuth } from '@/hooks/use-auth';
import { authenticatedFetch } from "@/utils/auth-utils";
import { apiCache, CACHE_KEYS } from "@/utils/api-cache";
import { consolidateRemoteLocations, DEPARTMENT_OPTIONS, EMPLOYEE_STATUS_OPTIONS, CLIENT_OPTIONS, toCamelCase } from "@/lib/utils";
import { ImageCrop } from "@/components/ui/ImageCrop";
import { API_BASE_URL } from "@/config/api";

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
    projectStartDate?: string;
    projectEndDate?: string;
    skills?: string[];
    expertise?: string;
    experienceYears?: number;
    manager?: string;
    reporting_to?: string;
    location?: string;
    dateOfBirth?: string;
    dateOfJoining?: string;
    gender?: string;
    employeeStatus?: string;
    account?: string;
    status?: string;
    resignationDate?: string;
    reasonForResignation?: string;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
  } | null;
}

export function EmployeeProfile({ isOpen, onClose, employee }: EmployeeProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState(employee || {
    id: '',
    employeeId: '',
    name: '',
    position: '',
    department: '',
    photoUrl: '',
    email: '',
    phone: '',
    mobile: '',
    bio: '',
    projectStartDate: '',
    projectEndDate: '',
    skills: [],
    expertise: '',
    experienceYears: 0,
    manager: '',
    reporting_to: '',
    location: '',
    dateOfBirth: '',
    dateOfJoining: '',
    gender: '',
    employeeStatus: '',
    account: '',
    status: 'active',
    resignationDate: '',
    reasonForResignation: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: ''
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [photoClearedByUser, setPhotoClearedByUser] = useState(false);
  const [managerName, setManagerName] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [skillsInput, setSkillsInput] = useState<string>('');
  const [assessmentSkills, setAssessmentSkills] = useState<string[]>([]);
  const { toast } = useToast();
  const { user, isAdmin, isLoading } = useAuth();
  const { updateEmployee, employees, fetchEmployees } = useEmployees();
  const { clients: dynamicClients, isLoading: clientsLoading } = useClients();
  const { employeeStatuses: dynamicEmployeeStatuses, isLoading: statusesLoading } = useEmployeeStatuses();

  // Determine if current user can edit or view sensitive fields on this profile
  // Allow editing if:
  // 1. User is an admin, OR
  // 2. User's email matches the employee's email (case-insensitive)
  const isSelf = !!(user?.email && employee?.email && user.email.toLowerCase() === employee.email.toLowerCase());
  const canEditProfile = !isLoading && (isAdmin || isSelf);
  const canEditBasicInfo = !isLoading && isAdmin;
  const canViewSensitiveFields = !isLoading && (isAdmin || isSelf);
  const canViewEmergencyContact = !isLoading && (isAdmin || isSelf);

  // Debug logging removed for security

  // Update profileData when employee prop changes
  useEffect(() => {
    if (!employee) return;
    setProfileData(prev => ({
      ...employee,
      // Only update photoUrl if it hasn't been explicitly cleared by the user
      photoUrl: photoClearedByUser ? '' : (employee.photoUrl || ""),
      // Use the actual status from the API response, only default to 'active' if status is undefined/null
      status: employee.status !== undefined ? employee.status : 'active'
    }));
    // Initialize skills input with current skills
    setSkillsInput(employee.skills ? employee.skills.join(', ') : '');
  }, [employee, photoClearedByUser]);

  // Update profileData when employees list changes (in case of updates from other components)
  useEffect(() => {
    if (!employee) return;
    const updatedEmployee = employees.find(emp => emp.id === employee.id);
    if (updatedEmployee) {
      setProfileData(prev => ({
        ...updatedEmployee,
        // Only update photoUrl if it hasn't been explicitly cleared by the user
        photoUrl: photoClearedByUser ? '' : (updatedEmployee.photoUrl || ""),
        // Use the actual status from the updated employee, only default to 'active' if status is undefined/null
        status: updatedEmployee.status !== undefined ? updatedEmployee.status : 'active'
      }));
      // Also update skills input
      setSkillsInput(updatedEmployee.skills ? updatedEmployee.skills.join(', ') : '');
    }
  }, [employees, employee, photoClearedByUser]);

  // Get unique departments, locations, and managers for dropdowns
  const departments = DEPARTMENT_OPTIONS; // Use predefined department options
  const rawLocations = [...new Set(employees.map(emp => emp.location).filter(Boolean))];
  const locations = consolidateRemoteLocations(rawLocations);
  const managers = employees.filter(emp => emp.id !== employee.id); // Exclude current employee
  // Use dynamic employee status options from API, fallback to predefined options
  const employeeStatusOptions = dynamicEmployeeStatuses.length > 0 ? dynamicEmployeeStatuses : EMPLOYEE_STATUS_OPTIONS;
  // Use dynamic client/account options from API, fallback to predefined options
  const clientOptions = dynamicClients.length > 0 ? dynamicClients : CLIENT_OPTIONS;

  // Ensure arrays are not empty and have valid values
  const validDepartments = departments.filter(dept => dept && dept.trim() !== '');
  const validLocations = locations.filter(loc => loc && loc.trim() !== '');

  // Gender options
  const genderOptions = ['MALE', 'FEMALE'];

  // Sync profileData with employee prop when it changes
  useEffect(() => {
    if (!employee) return;
    setProfileData(prev => ({
      ...employee,
      // Only update photoUrl if it hasn't been explicitly cleared by the user
      photoUrl: photoClearedByUser ? '' : (employee.photoUrl || ""),
      // Preserve other user changes
      status: prev.status !== undefined ? prev.status : (employee.status !== undefined ? employee.status : 'active')
    }));
  }, [employee, photoClearedByUser]);

  // Find manager name from reporting_to UUID
  useEffect(() => {
    if (!employee?.reporting_to || employees.length === 0) return;
    const manager = employees.find(emp => emp.id === employee.reporting_to);
    if (manager) {
      setManagerName(manager.name);
    } else {
      setManagerName('Manager not found');
    }
  }, [employee?.reporting_to, employees]);

  // Fetch tools from self-assessment review metadata and filter 2 and 3-star ratings
  useEffect(() => {
    const fetchAssessmentSkills = async () => {
      if (!employee?.id || !isOpen) return;

      try {
        const cyclesResponse = await authenticatedFetch(`${API_BASE_URL}/reviews/cycles`);
        if (!cyclesResponse.ok) return;
        const cycles = await cyclesResponse.json();
        const filteredCycles = cycles.filter((c: any) => c.status !== 'draft');

        let selectedCycle = filteredCycles.find((c: any) => c.status === 'open' || c.status === 'active');
        if (!selectedCycle && filteredCycles.length > 0) {
          selectedCycle = filteredCycles.sort((a: any, b: any) => b.year.localeCompare(a.year))[0];
        }

        if (selectedCycle) {
          const reviewResponse = await authenticatedFetch(
            `${API_BASE_URL}/reviews?employeeId=${employee.id}&cycleYear=${selectedCycle.year}&reviewType=self`
          );

          if (reviewResponse.ok) {
            const reviews = await reviewResponse.json();
            if (Array.isArray(reviews) && reviews.length > 0) {
              const review = reviews.find((r: any) => !r.isDraft && r.submittedAt) || reviews.find((r: any) => r.isDraft) || reviews[0];

              if (review?.metadata?.toolsAndTechnologies) {
                const tools = review.metadata.toolsAndTechnologies;
                const assessmentTools = tools
                  .filter((t: any) => t.rating === 2 || t.rating === 3)
                  .map((t: any) => t.tool);
                setAssessmentSkills(assessmentTools);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching assessment skills:', error);
      }
    };

    fetchAssessmentSkills();
  }, [employee?.id, isOpen]);

  // Early return if employee is null
  if (!employee) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive"
        });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive"
        });
        return;
      }

      // Reset the photo cleared flag since user is selecting a new photo
      setPhotoClearedByUser(false);

      // Create preview URL and show crop modal
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
      setShowCropModal(true);
    }
  };

  const handleCropComplete = (croppedImageBlob: Blob) => {
    // Convert blob to File
    const croppedFile = new File([croppedImageBlob], 'cropped-image.jpg', {
      type: 'image/jpeg',
    });

    setPhoto(croppedFile);
    setShowCropModal(false);

    // Clean up preview URL
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }

    toast({
      title: "Image cropped successfully",
      description: "Your profile picture has been cropped and is ready to upload.",
    });
  };

  const handleCropCancel = () => {
    setShowCropModal(false);

    // Clean up preview URL
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }

    // Reset file input
    const fileInput = document.getElementById('profile-picture') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
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
        const formData = new FormData();
        formData.append('file', photo);
        formData.append('name', employee.name);

        const response = await authenticatedFetch(`${API_BASE_URL}/employees/upload-photo/${employee.id}`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to upload image');
        }

        const data = await response.json();
        photoUrl = data.photo_url;

        // Clear the photo state since it's now uploaded
        setPhoto(null);
      }

      // Update employee with all data including new photo URL
      const updatedEmployee = await updateEmployee(employee.id, {
        employeeId: profileData.employeeId,
        name: toCamelCase(profileData.name),
        email: profileData.email,
        phone: profileData.phone,
        mobile: profileData.mobile,
        emergencyContactName: profileData.emergencyContactName,
        emergencyContactRelationship: profileData.emergencyContactRelationship,
        emergencyContactPhone: profileData.emergencyContactPhone,
        department: profileData.department,
        reporting_to: profileData.reporting_to,
        bio: profileData.bio,
        projectStartDate: profileData.projectStartDate,
        projectEndDate: profileData.projectEndDate,
        photoUrl: photoUrl,
        skills: profileData.skills,
        expertise: profileData.expertise,
        experienceYears: profileData.experienceYears,
        location: profileData.location,
        gender: profileData.gender,
        employeeStatus: profileData.employeeStatus,
        account: profileData.account,
        dateOfBirth: profileData.dateOfBirth,
        dateOfJoining: profileData.dateOfJoining,
        status: profileData.status !== undefined ? profileData.status : 'active',
        resignationDate: profileData.resignationDate,
        reasonForResignation: profileData.reasonForResignation
      });

      if (updatedEmployee) {
        // Update local state with the complete updated employee data
        setProfileData(prev => {
          const newData = {
            ...prev,
            ...updatedEmployee,
            photoUrl: photoUrl
          };
          return newData;
        });

        // Update skills input with the new skills
        setSkillsInput(updatedEmployee.skills ? updatedEmployee.skills.join(', ') : '');

        // Force refresh the global employees list to ensure Directory gets updated
        await fetchEmployees();

        setIsEditing(false);
        toast({
          title: "Success",
          description: "Profile updated successfully",
        });
      }
    } catch (error) {
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
    setProfileData(prev => ({
      ...employee,
      // Only reset photoUrl if it hasn't been explicitly cleared by the user
      photoUrl: photoClearedByUser ? '' : (employee.photoUrl || "")
    })); // Reset to original data
    setSkillsInput(employee.skills ? employee.skills.join(', ') : ''); // Reset skills input
    setPhoto(null); // Clear selected photo
    setIsEditing(false);
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Don't close the dialog if crop modal is open
      if (!open && showCropModal) {
        return;
      }
      setIsEditing(false);
      onClose();
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        {/* Fixed Header Section */}
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0" key={profileData.photoUrl}>
              {profileData.photoUrl ? (
                <img
                  src={profileData.photoUrl}
                  alt={profileData.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-muted-foreground">
                  {profileData.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{profileData.name}</h2>
              <p className="text-sm text-muted-foreground">{profileData.position}</p>
            </div>
            {canEditProfile && (
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
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    {/* Photo Preview Section */}
                    <div className="md:w-1/3">
                      <div className="flex flex-col items-center">
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
                                onClick={(e) => {
                                  // Prevent the label click from triggering
                                  e.stopPropagation();
                                  e.preventDefault();

                                  setPhotoPreview(null);
                                  setPhoto(null);
                                  const fileInput = document.getElementById('profile-picture') as HTMLInputElement;
                                  if (fileInput) fileInput.value = '';
                                }}
                                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors z-10"
                              >
                                <X className="h-4 w-4 text-white" />
                              </button>
                            </>
                          ) : profileData.photoUrl ? (
                            <>
                              <img
                                src={profileData.photoUrl}
                                alt={profileData.name}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  // Prevent the label click from triggering
                                  e.stopPropagation();
                                  e.preventDefault();

                                  // Clear the existing profile photo
                                  setPhotoClearedByUser(true);
                                  setProfileData(prev => ({ ...prev, photoUrl: '' }));
                                  setPhotoPreview(null);
                                  setPhoto(null);
                                  const fileInput = document.getElementById('profile-picture') as HTMLInputElement;
                                  if (fileInput) fileInput.value = '';

                                  toast({
                                    title: "Profile photo removed",
                                    description: "The profile photo has been removed. You can upload a new one.",
                                  });
                                }}
                                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors z-10"
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
                            id="profile-picture"
                            className="hidden"
                            accept="image/*"
                            onChange={handlePhotoChange}
                          />
                          <label
                            htmlFor="profile-picture"
                            className="absolute inset-0 cursor-pointer"
                          ></label>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          Recommended: Square image, 300x300px or larger
                        </p>
                      </div>
                    </div>

                    {/* Upload Info Section */}
                    <div className="md:w-2/3 space-y-3">
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
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <p className="text-sm text-blue-700 font-medium flex items-center gap-2">
                            📷 Photo selected: {photo.name}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            Click "Save Changes" to upload the cropped image
                          </p>
                        </div>
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
                  {/* Employee ID */}
                  <div className="space-y-2">
                    <Label htmlFor="employeeId">Employee ID</Label>
                    <Input
                      id="employeeId"
                      name="employeeId"
                      value={profileData.employeeId || ''}
                      disabled={true}
                      readOnly
                      className="bg-muted cursor-not-allowed"
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
                      disabled={true}
                      readOnly
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      value={
                        canViewSensitiveFields
                          ? (profileData.phone || profileData.mobile || '')
                          : (profileData.phone || profileData.mobile ? 'Hidden for privacy' : '')
                      }
                      disabled={true}
                      readOnly
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    {isEditing ? (
                      <Select
                        value={profileData.location || 'none'}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, location: value === 'none' ? '' : value }))}
                        disabled={!isAdmin}
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
                        disabled={!canEditBasicInfo}
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

                  {/* Employee Status */}
                  <div className="space-y-2">
                    <Label htmlFor="employeeStatus">Employee Status</Label>
                    {isEditing ? (
                      <Select
                        value={profileData.employeeStatus || 'none'}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, employeeStatus: value === 'none' ? '' : value }))}
                        disabled={!canEditBasicInfo}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Status</SelectItem>
                          {employeeStatusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={profileData.employeeStatus || 'Not provided'}
                        disabled
                        className="bg-muted"
                      />
                    )}
                  </div>

                  {/* Client */}
                  <div className="space-y-2">
                    <Label htmlFor="account">Client</Label>
                    {isEditing ? (
                      <Select
                        value={profileData.account || 'none'}
                        onValueChange={(value) => setProfileData(prev => ({ ...prev, account: value === 'none' ? '' : value }))}
                        disabled={!canEditBasicInfo}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Client</SelectItem>
                          {clientOptions.map((client) => (
                            <SelectItem key={client} value={client}>
                              {client}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={profileData.account || 'Not provided'}
                        disabled
                        className="bg-muted"
                      />
                    )}
                  </div>

                  {/* Manager */}
                  <div className="space-y-2">
                    <Label htmlFor="manager">Manager</Label>
                    {isEditing ? (
                      <>
                        {/* Searchable Combobox */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between"
                              disabled={!canEditBasicInfo}
                            >
                              {(() => {
                                const selected = managers.find(m => m.id === (profileData.reporting_to || ''))
                                return selected ? `${selected.name} (${selected.position})` : 'No Manager'
                              })()}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                            <Command>
                              <CommandInput placeholder="Search manager..." />
                              <CommandEmpty>No managers found.</CommandEmpty>
                              <CommandList>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={() => setProfileData(prev => ({ ...prev, reporting_to: '' }))}
                                  >
                                    No Manager
                                  </CommandItem>
                                  {managers.map(manager => (
                                    <CommandItem
                                      key={manager.id}
                                      value={`${manager.name} ${manager.position}`}
                                      onSelect={() => setProfileData(prev => ({ ...prev, reporting_to: manager.id }))}
                                    >
                                      {manager.name} ({manager.position})
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </>
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
                        disabled={!canEditBasicInfo}
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
                    {canViewSensitiveFields ? (
                      <Input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        value={profileData.dateOfBirth || ''}
                        onChange={handleChange}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-muted" : ""}
                      />
                    ) : (
                      <Input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="text"
                        value={(() => {
                          if (!profileData.dateOfBirth) return '';
                          const parts = profileData.dateOfBirth.split('-');
                          if (parts.length === 3) {
                            const [year, month, day] = parts;
                            return `${day}-${month}-XXXX`;
                          }
                          return profileData.dateOfBirth;
                        })()}
                        disabled
                        readOnly
                        className="bg-muted cursor-not-allowed"
                      />
                    )}
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
                      disabled={!isEditing || !canEditBasicInfo}
                      className={(!isEditing || !canEditBasicInfo) ? "bg-muted" : ""}
                    />
                  </div>

                  {/* Project Start Date */}
                  <div className="space-y-2">
                    <Label htmlFor="projectStartDate">Project Start Date</Label>
                    <Input
                      id="projectStartDate"
                      name="projectStartDate"
                      type="date"
                      value={profileData.projectStartDate || ''}
                      onChange={handleChange}
                      disabled={!isEditing || !canEditBasicInfo}
                      className={(!isEditing || !canEditBasicInfo) ? "bg-muted" : ""}
                    />
                  </div>

                  {/* Project End Date */}
                  <div className="space-y-2">
                    <Label htmlFor="projectEndDate">Project End Date</Label>
                    <Input
                      id="projectEndDate"
                      name="projectEndDate"
                      type="date"
                      value={profileData.projectEndDate || ''}
                      onChange={handleChange}
                      disabled={!isEditing || !canEditBasicInfo}
                      className={(!isEditing || !canEditBasicInfo) ? "bg-muted" : ""}
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

                  {/* Employee Status */}
                  <div className="space-y-2">
                    <Label htmlFor="status">Employee Status</Label>
                    {isEditing ? (
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="status"
                          checked={(profileData.status !== undefined ? profileData.status : 'active') === 'active'}
                          onCheckedChange={(checked) => {
                            setProfileData(prev => ({
                              ...prev,
                              status: checked ? 'active' : 'inactive',
                              // Clear resignation fields when switching to active
                              resignationDate: checked ? '' : prev.resignationDate,
                              reasonForResignation: checked ? '' : prev.reasonForResignation
                            }));
                          }}
                          disabled={!canEditBasicInfo}
                        />
                        <Label htmlFor="status" className="text-sm font-medium">
                          {(profileData.status !== undefined ? profileData.status : 'active') === 'active' ? 'Active' : 'Inactive'}
                        </Label>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <div className={`w-2 h-2 rounded-full ${(profileData.status !== undefined ? profileData.status : 'active') === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium">
                          {(profileData.status !== undefined ? profileData.status : 'active') === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Resignation Date - Only show when inactive (optional for update) */}
                  {(profileData.status !== undefined ? profileData.status : 'active') === 'inactive' && (
                    <div className="space-y-2">
                      <Label htmlFor="resignationDate">
                        Resignation Date
                      </Label>
                      <Input
                        id="resignationDate"
                        name="resignationDate"
                        type="date"
                        value={profileData.resignationDate || ''}
                        onChange={handleChange}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-muted" : ""}
                      />
                    </div>
                  )}

                  {/* Reason for Resignation - Only show when inactive (optional for update) */}
                  {(profileData.status !== undefined ? profileData.status : 'active') === 'inactive' && (
                    <div className="space-y-2">
                      <Label htmlFor="reasonForResignation">
                        Reason for Resignation
                      </Label>
                      <Textarea
                        id="reasonForResignation"
                        name="reasonForResignation"
                        value={profileData.reasonForResignation || ''}
                        onChange={handleChange}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-muted" : ""}
                        placeholder="Enter reason for resignation..."
                      />
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
                      disabled={!isAdmin}
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
                      disabled={!isAdmin}
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
                    {((profileData.skills || []).length > 0 || assessmentSkills.length > 0) ? (
                      <div className="flex flex-wrap gap-2">
                        {[...new Set([...(profileData.skills || []), ...assessmentSkills])].map((skill, index) => (
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
                      disabled={!isAdmin}
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
                      disabled={!isAdmin}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {profileData.experienceYears ? `${profileData.experienceYears} years` : 'No experience provided'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Emergency Contact (admin + self) - at end of view details */}
            {canViewEmergencyContact && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName">Name</Label>
                      <Input
                        id="emergencyContactName"
                        name="emergencyContactName"
                        value={profileData.emergencyContactName || ''}
                        onChange={handleChange}
                        disabled={!canEditProfile || !isEditing}
                        className={!isEditing || !canEditProfile ? "bg-muted" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactRelationship">Relationship</Label>
                      <Input
                        id="emergencyContactRelationship"
                        name="emergencyContactRelationship"
                        value={profileData.emergencyContactRelationship || ''}
                        onChange={handleChange}
                        disabled={!canEditProfile || !isEditing}
                        className={!isEditing || !canEditProfile ? "bg-muted" : ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">Phone Number</Label>
                      <Input
                        id="emergencyContactPhone"
                        name="emergencyContactPhone"
                        type="tel"
                        value={profileData.emergencyContactPhone || ''}
                        onChange={handleChange}
                        disabled={!canEditProfile || !isEditing}
                        className={!isEditing || !canEditProfile ? "bg-muted" : ""}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Image Crop Modal */}
      {showCropModal && photoPreview && (
        <ImageCrop
          src={photoPreview}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspectRatio={1}
          circularCrop={false}
        />
      )}
    </Dialog>
  );
}