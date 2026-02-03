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
import { ANIMATION_CONFIG, getCurrentAnimation } from "@/config/animation";
import { HRCharacterAnimation } from "./SidebarContentHRCharacter";
import { CloudGearAnimation } from "./CloudGearAnimation";

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
      <span className={cn(
        "transition-all duration-300",
        active ? "scale-110 text-primary" : "text-muted-foreground group-hover:text-foreground"
      )}>
        {icon}
      </span>
      <span className={cn(
        "transition-all duration-300 font-medium",
        active ? "text-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground"
      )}>
        {label}
      </span>
    </>
  );

  const buttonClasses = cn(
    "group relative w-full justify-start gap-3 mb-2 px-4 py-3 rounded-lg",
    "transition-all duration-300 ease-out",
    "border border-transparent",
    "hover:border-primary/20 hover:shadow-md hover:shadow-primary/5",
    "hover:translate-x-1",
    active
      ? "bg-gradient-to-r from-primary/15 to-primary/5 border-primary/30 shadow-lg shadow-primary/10 text-foreground font-semibold"
      : "hover:bg-gradient-to-r hover:from-accent/30 hover:to-accent/10",
    disabled && "opacity-40 cursor-not-allowed hover:translate-x-0"
  );

  return to ? (
    <Button
      variant="ghost"
      asChild
      disabled={disabled}
      className={buttonClasses}
    >
      <Link to={disabled ? "#" : to}>
        {content}
      </Link>
    </Button>
  ) : (
    <Button
      variant="ghost"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={buttonClasses}
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
      <div className="h-full flex flex-col w-64 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/98 to-background/95 backdrop-blur-xl border-r border-border/50" />
        <div className="relative z-10 flex flex-col h-full">
          <div className="h-2" />
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
            <div className="space-y-1">
              {modules.map((module) => (
                <ModuleButton
                  key={module.name}
                  icon={module.icon}
                  label={module.name}
                  active={activeModule === module.name}
                  to={module.to}
                  onClick={() => handleModuleClick(module.name)}
                  disabled={true}
                />
              ))}
            </div>
          </div>

          {/* Animated Logo - Switchable via config */}
          {/* <div className="flex-shrink-0 px-4 py-4 flex items-center justify-center" style={{
          position: 'sticky',
          bottom: '80px', 
          zIndex: 10
        }}>
          <div className="relative w-28 h-28">
            {getCurrentAnimation() === 'cloud-gear' ? (
              <CloudGearAnimation settings={ANIMATION_CONFIG.settings} />
            ) : (
              <HRCharacterAnimation />
            )}
          </div>
        </div> */}

          <div className="px-4 py-3 flex justify-center">
            <h1 className="text-xl font-bold text-gradient-primary">
              Zenith
            </h1>
          </div>

          <div className="flex-shrink-0 px-4 py-4 mt-auto border-t border-border/50 bg-gradient-to-t from-background/95 to-transparent backdrop-blur-sm" style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10
          }}>
            <div className="flex items-center justify-center">
              <div className="px-3 py-1.5 rounded-md bg-muted/30 border border-border/30 backdrop-blur-sm">
                <p className="text-xs font-medium text-muted-foreground text-center whitespace-nowrap">
                  v0.0.0
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get version info from build-time constants
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const gitCommit = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'dev';

  return (
    <div className="h-full flex flex-col w-64 relative">
      {/* Glass morphism overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/98 to-background/95 backdrop-blur-xl border-r border-border/50" />

      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Spacer for better top spacing */}
        {/* Logo Section */}
        <div className="flex items-center justify-center pt-4 pb-2 pr-3">
          <img
            src="/LOGO.svg"
            alt="Zenith Logo"
            className="w-auto h-8 max-w-[80%] block dark:hidden"
          />
          <img
            src="/LOGO1.png"
            alt="Zenith Logo"
            className="w-auto h-8 max-w-[80%] hidden dark:block"
          />
        </div>

        {/* Scrollable menu items */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
          <div className="space-y-1">
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

        {/* Animated Logo - Switchable via config */}
        {/* <div className="flex-shrink-0 px-4 py-4 flex items-center justify-center" style={{
          position: 'sticky',
          bottom: '80px', 
          zIndex: 10
        }}>
          <div className="relative w-28 h-28">
            {getCurrentAnimation() === 'cloud-gear' ? (
              <CloudGearAnimation settings={ANIMATION_CONFIG.settings} />
            ) : (
              <HRCharacterAnimation />
            )}
          </div>
        </div> */}

        <div className="px-4 py-3 flex justify-center mb-3">
          <h1 className="text-2xl font-bold text-gradient-primary">
            Zenith
          </h1>
        </div>

        {/* Version Info at Bottom - Fixed at bottom */}
        <div className="flex-shrink-0 px-4 py-4 mt-auto border-t border-border/50 bg-gradient-to-t from-background/95 to-transparent backdrop-blur-sm" style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10
        }}>
          <div className="flex items-center justify-center">
            <div className="px-3 py-1.5 rounded-md bg-muted/30 border border-border/30 backdrop-blur-sm">
              <p className="text-xs font-medium text-muted-foreground text-center whitespace-nowrap" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                <span className="opacity-60">v</span>
                <span className="font-semibold">{appVersion}</span>
                {gitCommit && gitCommit !== 'dev' && (
                  <span className="ml-1.5 text-[10px] opacity-50 font-mono">
                    ({gitCommit})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
