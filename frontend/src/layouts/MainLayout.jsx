import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import PageLoader from "@/components/PageLoader";
import { Toaster } from "@/components/ui/toaster";

export default function MainLayout() {
  const location = useLocation();

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Navbar is not lazy — it stays mounted and visible while page chunks load below it. */}
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </motion.main>
      </AnimatePresence>
      <Toaster />
    </div>
  );
}
