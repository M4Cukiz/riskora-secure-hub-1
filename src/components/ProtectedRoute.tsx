import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useStore } from "@/store/StoreContext";
import type { Role } from "@/types";
import { Loader2 } from "lucide-react";

interface Props {
  allow: Role[];
  children: ReactNode;
}

export function ProtectedRoute({ allow, children }: Props) {
  const { currentUser, loading } = useStore();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!allow.includes(currentUser.role)) {
    if (currentUser.role === "supplier") return <Navigate to="/supplier/portal" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
