
import { useState, useEffect } from "react";
import { Settings, Users, BarChart3, Shield, Database, ChevronDown, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { UserManagement } from "@/components/admin/UserManagement";

type AdminPortalProps = {
  disabled?: boolean;
};

export function AdminPortal({ disabled = false }: AdminPortalProps) {
  const { user, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const navigate = useNavigate();

  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (showUserManagement) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showUserManagement]);

  // Only render for admin users
  if (!isAdmin) return null;

  const adminItems = [
    {
      icon: <Flag className="w-4 h-4" />,
      label: "Feature Flags",
      description: "Manage module visibility and functionality",
      action: () => {
        navigate('/feature-flags');
        setIsOpen(false);
      }
    },
    {
      icon: <Users className="w-4 h-4" />,
      label: "User Management",
      description: "Manage user accounts and permissions",
      action: () => {
        setShowUserManagement(true);
        setIsOpen(false);
      }
    },
    {
      icon: <BarChart3 className="w-4 h-4" />,
      label: "System Analytics",
      description: "View system performance metrics",
    },
    {
      icon: <Database className="w-4 h-4" />,
      label: "Data Management",
      description: "Database backup and maintenance",
    },
    {
      icon: <Shield className="w-4 h-4" />,
      label: "Security Settings",
      description: "Configure security policies",
    }
  ];

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={disabled}
            className={`relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 group ${
              disabled 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-accent/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-hr-primary flex items-center justify-center">
                <Shield className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-medium hidden sm:inline">Admin</span>
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 hidden sm:inline">
                Portal
              </Badge>
            </div>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          align="end" 
          className="w-80 p-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg animate-in fade-in-0 zoom-in-95"
          sideOffset={8}
        >
          <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-hr-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">Admin Portal</p>
              <p className="text-xs text-muted-foreground">System Management</p>
            </div>
          </DropdownMenuLabel>
          
          <DropdownMenuSeparator className="my-2" />
          
          <div className="space-y-1">
            {adminItems.map((item, index) => (
              <DropdownMenuItem
                key={index}
                onClick={item.action}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:bg-primary/20 dark:group-hover:bg-primary/30 transition-colors">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
          
          <DropdownMenuSeparator className="my-2" />
          
          <DropdownMenuItem className="flex items-center gap-2 p-3 rounded-lg hover:bg-accent/30 transition-colors duration-200">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Admin Settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User Management Modal */}
      {showUserManagement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-background rounded-lg shadow-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto p-6">
              <UserManagement onClose={() => setShowUserManagement(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
