import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmployeeProfile } from "./employee/EmployeeProfile";

export type EmployeeCardProps = {
  id: string;
  employeeId?: string;
  name: string;
  position: string;
  department: string;
  photoUrl?: string; // Optional photo URL
  email?: string;
  phone?: string;
  mobile?: string;
  bio?: string;
  startDate?: string;
  manager?: string;
  reporting_to?: string;
  skills?: string[];
  expertise?: string;
  experienceYears?: number;
  location?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  gender?: string;
  employeeStatus?: string;
  account?: string;
  status?: string;
  resignationDate?: string;
  reasonForResignation?: string;
  className?: string;
}

export function EmployeeCard(props: EmployeeCardProps) {
  const [showProfile, setShowProfile] = useState(false);
  
  // Debug logging removed for security
  
  
  // Generate avatar from name if no photo
  const getInitialsAvatar = (name: string) => {
    const initials = name.split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase();
    
    // Use consistent color based on name
    const colors = [
      'bg-red-500', 'bg-blue-600', 'bg-green-500', 
      'bg-purple-600', 'bg-yellow-500', 'bg-pink-500'
    ];
    const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    
    return colors[colorIndex];
  };

  const isInactive = (props.status || 'active') === 'inactive';

  return (
    <>
      <div className={cn(
        "group h-full [perspective:1000px] aspect-[1/1.5] min-h-[210px]",
        isInactive && "opacity-60 grayscale pointer-events-none",
        props.className
      )}>
        <div className="relative w-full h-full transition-all duration-[800ms] [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
          
          {/* Front Face */}
          <div className="absolute inset-0 [backface-visibility:hidden] bg-white dark:bg-gray-800 rounded-xl border border-border/50 overflow-hidden shadow-sm flex flex-col">
            <div className="aspect-square overflow-hidden shrink-0 border-b border-border/10">
              {props.photoUrl ? (
                <img 
                  src={props.photoUrl} 
                  alt={props.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    const parent = target.parentElement;
                    if (parent) {
                      const color = getInitialsAvatar(props.name);
                      parent.innerHTML = `
                        <div class="${color} w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                          ${props.name.split(' ').map(part => part[0]).join('').toUpperCase()}
                        </div>
                      `;
                    }
                  }}
                />
              ) : (
                <div className={`${getInitialsAvatar(props.name)} w-full h-full flex items-center justify-center text-white text-3xl font-bold`}>
                  {props.name.split(' ').map(part => part[0]).join('').toUpperCase()}
                </div>
              )}
            </div>

            <div className="p-2 text-center flex-1 flex flex-col justify-center bg-gradient-to-b from-transparent to-accent/5">
              <h3 className="font-bold text-[11px] leading-tight text-foreground line-clamp-1 px-1">{props.name}</h3>
              <p className="text-[9px] text-muted-foreground mt-1 font-medium line-clamp-1 px-1">{props.position}</p>
              {props.employeeId && (
                <p className="text-[9.5px] text-muted-foreground/80 mt-1 font-mono font-bold tracking-tight">ID: {props.employeeId}</p>
              )}
            </div>
          </div>

          {/* Back Face - Sky Blue Theme */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-sky-400 to-sky-600 dark:from-sky-500 dark:to-sky-700 rounded-xl border border-sky-300 dark:border-sky-400/30 overflow-hidden flex flex-col p-3 text-white shadow-2xl shadow-sky-500/20">
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
              <h3 className="font-semibold text-xs leading-tight line-clamp-2 w-full">{props.name}</h3>
              <p className="text-[9px] font-medium opacity-90 uppercase tracking-wide leading-tight line-clamp-2 w-full">{props.position}</p>

              <div className="w-full bg-white/15 backdrop-blur-sm rounded-md py-1.5 px-2 border border-white/20">
                <p className="text-[6px] uppercase tracking-widest font-semibold opacity-80">Employee ID</p>
                <p className="text-[11px] font-black tracking-wide mt-0.5">{props.employeeId || 'N/A'}</p>
              </div>

              <p className="text-[9px] opacity-85 line-clamp-1 w-full">{props.department}</p>
            </div>

            <button
              className="w-full py-1.5 bg-white text-sky-600 text-[9px] font-bold rounded-lg shadow-lg hover:bg-sky-50 active:scale-[0.98] transition-all uppercase tracking-tight flex-shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowProfile(true);
              }}
            >
              View profile
            </button>
          </div>
        </div>
      </div>

      {/* Employee Profile Dialog - Only show for active employees */}
      {!isInactive && (
        <EmployeeProfile 
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
          employee={{
          id: props.id,
          employeeId: props.employeeId,
          name: props.name,
          position: props.position,
          department: props.department,
          photoUrl: props.photoUrl || '', // Provide a default empty string for photoUrl
          email: props.email,
          phone: props.phone,
          mobile: props.mobile,
          bio: props.bio,
          projectStartDate: props.startDate,
          manager: props.manager,
          reporting_to: props.reporting_to,
          skills: props.skills,
          expertise: props.expertise,
          experienceYears: props.experienceYears,
          location: props.location,
          dateOfBirth: props.dateOfBirth,
          dateOfJoining: props.dateOfJoining,
          gender: props.gender,
          employeeStatus: props.employeeStatus,
          account: props.account,
          status: props.status,
          resignationDate: props.resignationDate,
          reasonForResignation: props.reasonForResignation
        }}
        />
      )}
    </>
  );
}
