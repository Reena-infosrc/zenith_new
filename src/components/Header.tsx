
import { useState, useEffect } from "react";
import { MenuIcon, BellIcon, LogOut, MessageSquare, ChevronDown } from "lucide-react";
import { ModeToggle } from "@/components/ModeToggle";
import { AdminPortal } from "@/components/AdminPortal";
import { SearchDropdown } from "@/components/SearchDropdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { useMsal } from "@azure/msal-react";
import { useEmployees } from "@/hooks/use-employees";
import { authenticatedFetch, clearAuthMemory } from "@/utils/auth-utils";
import { API_BASE_URL } from "@/config/api";

type HeaderProps = {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [isLeadership, setIsLeadership] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { isEnabled, isHidden } = useFeatureFlags();
  const { instance, accounts } = useMsal();
  const { employees } = useEmployees();

  // Get current user information from MSAL
  const currentAccount = accounts?.[0];
  const username = currentAccount?.name || "User";
  const userEmail = currentAccount?.username || "user@example.com";

  // Find current employee by matching email
  const currentEmployee = employees.find(emp => emp.email?.toLowerCase() === userEmail.toLowerCase());
  const displayEmailOrId = currentEmployee?.employeeId ? currentEmployee.employeeId : userEmail;

  // Add scroll listener to change header appearance when scrolled
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchLeadershipFlag = async () => {
      if (!userEmail) return;
      try {
        const res = await authenticatedFetch(`${API_BASE_URL}/client-rm-feedback/me-context`);
        if (!res.ok) return;
        const data = await res.json();
        setIsLeadership(Boolean(data.is_leadership));
        setIsAdmin(Boolean(data.is_admin));
      } catch {
        // keep header resilient
      }
    };
    fetchLeadershipFlag();
  }, [userEmail]);

  const handleSignOut = async () => {
    try {
      // Set flag to prevent auto-login after logout
      sessionStorage.setItem('user_logged_out', 'true');

      // Clear app auth state
      clearAuthMemory();

      // Clear MSAL session and redirect to logout
      await instance.logoutRedirect({
        account: currentAccount || undefined,
        postLogoutRedirectUri: window.location.origin + '/'
      });
    } catch (error) {
      // Fallback: just clear local state and navigate
      clearAuthMemory();
      navigate('/');
    }
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-30 w-full transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm' : 'bg-transparent'
      }`}>
      <div className="w-full px-4 h-16 flex items-center">
        <div className="flex items-center w-56">
          <Button variant="ghost" size="icon" onClick={onMenuToggle} className="mr-2 lg:hidden">
            <MenuIcon className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 flex justify-start pl-[4%]">
          <div className="hidden md:block w-full max-w-md">
            <SearchDropdown />
          </div>
        </div>

        {/* Admin Portal positioned before notifications - controlled by feature flag */}
        <div className="flex items-center gap-3 w-56 justify-end">
          {!isHidden('admin_portal') && isAdmin && (
            <AdminPortal disabled={!isEnabled('admin_portal')} />
          )}

          {/* Notifications - controlled by feature flag */}
          {!isHidden('notifications') && (
            <Button
              variant="ghost"
              size="icon"
              className={`relative ${!isEnabled('notifications') ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!isEnabled('notifications')}
            >
              <BellIcon className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full"></span>
            </Button>
          )}

          <ModeToggle />

          {/* Leadership Reports Dropdown (separate from profile) */}
          {isLeadership && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-accent/50 transition-colors"
                  aria-label="Reports"
                  title="Reports"
                >
                  <span className="text-sm font-medium">Reports</span>
                  <ChevronDown className="w-4 h-4 ml-1 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-48 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg"
                sideOffset={8}
              >
                <DropdownMenuLabel className="px-3 py-2 text-xs text-muted-foreground">
                  Reports
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/performance/monthly-feedback")}
                  className="flex items-center gap-2 p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">Monthly feedback</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-2 hover:bg-accent/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-hr-primary flex items-center justify-center text-white">
                  {username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{username}</span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="min-w-56 max-w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg"
              sideOffset={8}
            >
              <DropdownMenuLabel className="flex items-center gap-3 px-3 py-3">
                <div className="w-10 h-10 rounded-full bg-gradient-hr-primary flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{username}</p>
                  <p className="text-xs text-muted-foreground break-all leading-relaxed">{displayEmailOrId}</p>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleSignOut}
                className="flex items-center gap-2 p-3 hover:bg-accent/30 transition-colors cursor-pointer text-red-600 dark:text-red-400"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
