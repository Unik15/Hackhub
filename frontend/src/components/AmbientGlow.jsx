import React from "react";
import { motion } from "framer-motion";

// Toned way down for the light theme — a barely-there color wash instead of
// the neon glow this was designed for on a dark background.
export default function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute left-[8%] top-[-12%] h-[420px] w-[420px] rounded-full bg-primary/[0.06] blur-[120px]"
        animate={{ x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[4%] top-[18%] h-[380px] w-[380px] rounded-full bg-secondary/[0.05] blur-[120px]"
        animate={{ x: [0, -30, 20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-14%] left-[38%] h-[420px] w-[420px] rounded-full bg-accent/[0.05] blur-[130px]"
        animate={{ x: [0, 20, -30, 0], y: [0, -25, 15, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
