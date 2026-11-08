import React, { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import PageLoader from "@/components/PageLoader";
import { Toaster } from "@/components/ui/toaster";

// Route-level code splitting — each page ships as its own chunk.
const Home = lazy(() => import("@/pages/home"));
const HackathonList = lazy(() => import("@/pages/HackathonList"));
const HackathonDetails = lazy(() => import("@/pages/HackathonDetails"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AdminReviews = lazy(() => import("@/pages/AdminReviews"));
const Participants = lazy(() => import("@/pages/Participants"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

export default function App() {
  return (
    <>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth pages own their full-screen layout — no navbar/ambient wrapper */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route
            path="/explore"
            element={
              <ProtectedRoute>
                <HackathonList />
              </ProtectedRoute>
            }
          />
          <Route path="/hackathon/:id" element={<HackathonDetails />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/hackathons/:hackathonId/participants"
            element={
              <ProtectedRoute>
                <Participants />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <AdminRoute>
                <AdminReviews />
              </AdminRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
    <Toaster />
    </>
  );
}
