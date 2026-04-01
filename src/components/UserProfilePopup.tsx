import { Mail, Phone, MapPin, Calendar, Building, Users, Award, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';

interface UserProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  employee: {
    id: string;
    name: string;
    email: string;
    position: string;
    department: string;
    photoUrl?: string;
    phone?: string;
    mobile?: string;
    location?: string;
    dateOfBirth?: string;
    dateOfJoining?: string;
    employeeStatus?: string;
    employmentCategory?: string;
    account?: string;
    isLeader?: string;
    gender?: string;
  } | null;
}

export function UserProfilePopup({ isOpen, onClose, employee }: UserProfilePopupProps) {
  const { isAdmin } = useAuth();
  
  if (!employee) return null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-xl font-semibold">Employee Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex items-start gap-4 pb-4 border-b">
            <Avatar className="h-20 w-20">
              <AvatarImage src={employee.photoUrl} alt={employee.name} />
              <AvatarFallback className="text-lg">
                {getInitials(employee.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-foreground">{employee.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-sm">
                  {employee.position}
                </Badge>
                {employee.isLeader === 'Yes' && (
                  <Badge variant="default" className="text-sm">
                    <Award className="h-3 w-3 mr-1" />
                    Leader
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">{employee.department}</p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{employee.email}</p>
                </div>
              </div>
              {isAdmin && (employee.phone || employee.mobile) && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">
                      {employee.mobile || employee.phone}
                    </p>
                  </div>
                </div>
              )}
              {employee.location && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Location</p>
                    <p className="text-sm text-muted-foreground">{employee.location}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Employment Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building className="h-5 w-5" />
              Employment Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Building className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Department</p>
                  <p className="text-sm text-muted-foreground">{employee.department}</p>
                </div>
              </div>
              {employee.account && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Account</p>
                    <p className="text-sm text-muted-foreground">{employee.account}</p>
                  </div>
                </div>
              )}
              {employee.employmentCategory && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Badge variant="outline" className="h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">Employment Category</p>
                    <p className="text-sm text-muted-foreground">{employee.employmentCategory}</p>
                  </div>
                </div>
              )}
              {employee.employeeStatus && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Badge variant="outline" className="h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-sm text-muted-foreground">{employee.employeeStatus}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Personal Information (Admin Only) */}
          {isAdmin && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {employee.dateOfBirth && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Date of Birth</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(employee.dateOfBirth)}
                      </p>
                    </div>
                  </div>
                )}
                {employee.dateOfJoining && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Date of Joining</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(employee.dateOfJoining)}
                      </p>
                    </div>
                  </div>
                )}
                {employee.dateOfJoining && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Experience At Info Services</p>
                      <p className="text-sm text-muted-foreground">
                        {calculateExperience(employee.dateOfJoining)}
                      </p>
                    </div>
                  </div>
                )}
                {employee.gender && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Gender</p>
                      <p className="text-sm text-muted-foreground">{employee.gender}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
