import React, { Suspense, lazy, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const SubmitModal = lazy(() => import("@/modals/SubmitModal"));

const navLinkClass = ({ isActive }) =>
  `text-xs font-ui font-semibold uppercase tracking-wider transition-colors ${
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [submitMounted, setSubmitMounted] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const openSubmit = () => {
    setSubmitMounted(true);
    setSubmitOpen(true);
  };

  const handleLogout = async () => {
    await logout();
    toast({ title: "Logged out" });
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="container flex h-20 items-center justify-between gap-6">
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
            <Ticket size={16} className="text-primary-foreground" />
          </div>
          <span className="font-heading text-xl tracking-tight text-foreground">HackHub</span>
        </Link>

        {/* Center nav links — uppercase, spaced, matching the reference pattern */}
        <nav className="hidden items-center gap-8 md:flex">
          <NavLink to="/explore" className={navLinkClass}>
            Explore
          </NavLink>
          {user && (
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          )}
        </nav>

        {/* Right side — plain login/user link, then one prominent pill CTA */}
        <div className="flex shrink-0 items-center gap-4">
          {user ? (
            <div className="hidden items-center gap-4 sm:flex">
              <span className="text-sm font-ui font-medium text-muted-foreground">{user.name || user.email}</span>
              <button onClick={handleLogout} className="text-xs font-ui font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden text-xs font-ui font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground sm:block"
            >
              Log in
            </Link>
          )}

          <Button size="sm" className="px-5" onClick={openSubmit}>
            Submit Hackathon
          </Button>
        </div>
      </div>

      {submitMounted && (
        <Suspense fallback={null}>
          <SubmitModal open={submitOpen} onClose={() => setSubmitOpen(false)} />
        </Suspense>
      )}
    </header>
  );
}
