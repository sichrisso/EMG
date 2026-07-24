import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageSpinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { UserRole } from "@/types";

interface Props {
  role?: UserRole;
  requireApproval?: boolean;
  children?: React.ReactNode;
}

export function ProtectedRoute({ role, requireApproval, children }: Props) {
  const { isLoading, isAuthenticated, isAdmin, profile, mentorProfile } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageSpinner />;
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location.pathname + location.search }} replace />;
  }

  // Admins work in the console and nowhere else: any other route sends them
  // back to /admin, so the student/mentor product never gets in their way.
  if (isAdmin && !location.pathname.startsWith("/admin")) {
    return <Navigate to="/admin" replace />;
  }

  if (role && profile?.role !== role) {
    const redirect =
      profile?.role === "mentor" ? "/mentor/dashboard" : "/home";
    return <Navigate to={redirect} replace />;
  }

  if (requireApproval) {
    // undefined means still fetching, show spinner, don't redirect yet
    if (mentorProfile === undefined) return <PageSpinner />;
    if (mentorProfile?.status !== "approved") {
      return <Navigate to="/become-a-mentor" replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
}
