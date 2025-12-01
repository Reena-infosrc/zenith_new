import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { usePerformancePreload } from "@/hooks/use-performance-preload";

type RequireAuthProps = {
  children: ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { accounts } = useMsal();

  const hasMsalAccount = accounts && accounts.length > 0;
  const hasToken = !!localStorage.getItem("auth_token");

  // Start preloading performance data after authentication
  usePerformancePreload();

  if (!hasMsalAccount && !hasToken) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}


