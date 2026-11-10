import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import PageLoader from "@/components/PageLoader";

/**
 * Guards admin-only pages. Logged-out visitors are sent to login; signed-in
 * non-admins are sent home rather than shown a page they cannot use.
 */
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
