import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Ticket } from "lucide-react";
import AuthVisualPanel from "@/components/auth/AuthVisualPanel";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={{ background: "#14161F" }}>
      <AuthVisualPanel />

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md rounded border border-white/10 bg-white/[0.04] p-8 backdrop-blur-2xl"
          style={{ boxShadow: "0 0 60px -15px rgba(242, 169, 59, 0.3)" }}
        >
          <Link to="/" className="mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded" style={{ background: "#F2A93B" }}>
              <Ticket size={16} className="text-[#191B29]" />
            </div>
            <span className="font-heading text-xl tracking-tight text-white">HackHub</span>
          </Link>

          <h1 className="font-heading text-2xl tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-white/50">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-white/50">{footer}</div>}
        </motion.div>
      </div>
    </div>
  );
}
