import React from "react";
import { motion } from "framer-motion";
import { Trophy, Users, Code2, Sparkles } from "lucide-react";

const floatingCards = [
  { icon: Trophy, label: "ETHGlobal Bangkok", detail: "$75,000 prize pool", top: "14%", left: "8%", delay: 0, duration: 5 },
  { icon: Users, label: "1,042 hackers", detail: "joined this week", top: "60%", left: "6%", delay: 0.4, duration: 6 },
  { icon: Code2, label: "AI Genesis Hackathon", detail: "94% skill match", top: "36%", left: "54%", delay: 0.2, duration: 5.5 },
];

export default function AuthVisualPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:block" style={{ background: "#191B29" }}>
      {/* ambient marigold glow */}
      <div
        className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-[140px]"
        style={{ background: "rgba(242, 169, 59, 0.25)" }}
      />

      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative flex h-full flex-col justify-center px-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            <Sparkles size={12} style={{ color: "#F2A93B" }} /> Built for builders
          </span>
          <h2 className="mt-6 max-w-md font-heading text-4xl leading-[0.95] tracking-tight text-white">
            Where hackers find their next win.
          </h2>
          <p className="mt-4 max-w-sm text-white/50">
            Discover, match, and compete in hackathons worldwide — all in one place.
          </p>
        </motion.div>

        {floatingCards.map((c) => (
          <motion.div
            key={c.label}
            className="absolute w-56 rounded border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
            style={{ top: c.top, left: c.left }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: [0, -10, 0] }}
            transition={{
              opacity: { duration: 0.6, delay: c.delay },
              y: { duration: c.duration, repeat: Infinity, ease: "easeInOut", delay: c.delay },
            }}
          >
            <c.icon size={16} style={{ color: "#F2A93B" }} />
            <p className="mt-2 text-sm font-medium text-white">{c.label}</p>
            <p className="text-xs text-white/40">{c.detail}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
