import React, { forwardRef, useState } from "react";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded font-button font-semibold transition-all disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-95 active:scale-[0.98]",
        secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
        outline: "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        ghost: "hover:bg-muted",
        destructive: "bg-signal text-signal-foreground hover:opacity-90",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export const Button = forwardRef(({ className, variant, size, onClick, children, ...props }, ref) => {
  const [ripples, setRipples] = useState([]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height) * 1.6;
    const x = e.clientX - rect.left - diameter / 2;
    const y = e.clientY - rect.top - diameter / 2;
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev, { id, x, y, diameter }]);
    onClick?.(e);
  };

  const removeRipple = (id) => setRipples((prev) => prev.filter((r) => r.id !== id));

  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} onClick={handleClick} {...props}>
      {children}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ opacity: 0.45, scale: 0 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onAnimationComplete={() => removeRipple(r.id)}
          className="pointer-events-none absolute rounded-full bg-white/70"
          style={{ left: r.x, top: r.y, width: r.diameter, height: r.diameter }}
        />
      ))}
    </button>
  );
});
Button.displayName = "Button";
