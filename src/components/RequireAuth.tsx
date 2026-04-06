import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMsal } from "@azure/msal-react";

type RequireAuthProps = {
  children: ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const { accounts } = useMsal();

  const hasMsalAccount = accounts && accounts.length > 0;
  const hasToken = !!localStorage.getItem("auth_token");

  if (!hasMsalAccount && !hasToken) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}


