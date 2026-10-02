import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useToast, dismissToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
            className={`flex w-[320px] items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-xl ${
              t.variant === "destructive" ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-card"
            }`}
          >
            {t.variant === "destructive" ? (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary" />
            )}
            <div className="flex-1">
              {t.title && <p className="font-ui text-sm font-medium text-foreground">{t.title}</p>}
              {t.description && <p className="mt-0.5 font-body text-xs text-muted-foreground">{t.description}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
