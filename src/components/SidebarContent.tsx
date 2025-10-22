import { 
  Calendar, 
  Users, 
  UserPlus, 
  BarChart2, 
  Layout, 
  DollarSign, 
  BookOpen, 
  TrendingUp, 
  HelpCircle,
  Star,
  Folders
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { useAuth } from "@/hooks/use-auth";
import { useMemo } from "react";

type ModuleButtonProps = {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const ModuleButton = ({ icon, label, active, to, onClick, disabled }: ModuleButtonProps) => {
  const content = (
    <>
      {icon}
      <span className="transition-all duration-200">{label}</span>
    </>
  );

  return to ? (
    <Button
      variant="ghost"
      asChild
      disabled={disabled}
      className={cn(
        "w-full justify-start gap-3 mb-1 px-4",
        active ? "bg-accent" : "hover:bg-accent/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Link to={disabled ? "#" : to}>{content}</Link>
    </Button>
  ) : (
    <Button
      variant="ghost"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full justify-start gap-3 mb-1 px-4",
        active ? "bg-accent" : "hover:bg-accent/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {content}
    </Button>
  );
};

type SidebarContentProps = {
  activeModule?: string;
  onModuleChange?: (module: string) => void;
}

export function SidebarContent({ activeModule, onModuleChange }: SidebarContentProps) {
  const { isEnabled, isDisabled, isHidden, isLoading } = useFeatureFlags();
  const { isAdmin } = useAuth();

  const handleModuleClick = (moduleName: string) => {
    if (onModuleChange) {
      onModuleChange(moduleName);
    }
  };

  const modules = useMemo(() => [
    { name: 'Home', icon: <Layout size={20} />, to: '/home', featureFlag: 'home_module' },
    { name: 'Directory', icon: <Users size={20} />, to: '/directory', featureFlag: 'directory_module' },
    { name: 'Leave', icon: <Calendar size={20} />, to: '/leave', featureFlag: 'leave_module' },
    { name: 'Recruitment', icon: <UserPlus size={20} />, to: '/recruitment', featureFlag: 'recruitment_module' },
    { name: 'Performance', icon: <BarChart2 size={20} />, to: '/performance', featureFlag: 'performance_module' },
    { name: 'Analytics', icon: <TrendingUp size={20} />, to: '/dashboard', featureFlag: 'dashboard_module', adminOnly: true },
    { name: 'Engagement', icon: <Star size={20} />, to: '/engagement', featureFlag: 'engagement_module' },
    { name: 'Resource Hub', icon: <Folders size={20} />, to: '/resource-hub', featureFlag: 'resource_hub_module' },
    { name: 'Compensation', icon: <DollarSign size={20} />, to: '/compensation', featureFlag: 'compensation_module' },
    { name: 'Learning', icon: <BookOpen size={20} />, featureFlag: 'learning_module' },
    { name: 'Helpdesk', icon: <HelpCircle size={20} />, featureFlag: 'helpdesk_module' },
  ], []);

  // Filter modules based on feature flags and admin status
  const visibleModules = useMemo(() => modules.filter(module => {
    // Hide admin-only modules for non-admin users
    if (module.adminOnly && !isAdmin) {
      return false;
    }
    
    if (!module.featureFlag) return true; // Always show modules without feature flags
    return !isHidden(module.featureFlag);
  }), [modules, isHidden, isAdmin]);

  // If still loading and no cached data, show skeleton or default state
  if (isLoading) {
    // Show all modules as disabled while loading to prevent layout shift
    return (
      <div className="py-4 h-full flex flex-col w-64">
        <div className="flex-1 overflow-auto px-2">
          {modules.map((module) => (
            <ModuleButton 
              key={module.name}
              icon={module.icon}
              label={module.name}
              active={activeModule === module.name}
              to={module.to}
              onClick={() => handleModuleClick(module.name)}
              disabled={true} // Show as disabled while loading
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 h-full flex flex-col w-64">

      <div className="flex-1 overflow-auto px-2">
        {visibleModules.map((module) => (
          <ModuleButton 
            key={module.name}
            icon={module.icon}
            label={module.name}
            active={activeModule === module.name}
            to={module.to}
            onClick={() => handleModuleClick(module.name)}
            disabled={module.featureFlag ? isDisabled(module.featureFlag) : false}
          />
        ))}
      </div>
    </div>
  );
}
