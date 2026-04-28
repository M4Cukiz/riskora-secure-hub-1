import { Navigate } from "react-router-dom";
import { useStore } from "@/store/StoreContext";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { currentUser, loading } = useStore();
  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role === "supplier") return <Navigate to="/supplier/portal" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;
