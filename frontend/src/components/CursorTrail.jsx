import React, { useEffect, useRef, useState } from "react";

const TRAIL_LENGTH = 12;
const EASE = 0.28; // higher = trail follows cursor more tightly

// Cycles through the brand palette so the trail reads as a gradient echo.
const GLOW_COLORS = ["#7b39fc", "#a78bfa", "#22D3EE"];

// Swap to this if you want a text/symbol trail instead of glow dots —
// pass mode="text" to <CursorTrail /> to use it.
const TRAIL_CHARACTERS = ["</>", "{ }", "✦", "$", "01"];

export default function CursorTrail({ mode = "glow" }) {
  const dotsRef = useRef([]);
  const positions = useRef(Array.from({ length: TRAIL_LENGTH }, () => ({ x: -100, y: -100 })));
  const mouse = useRef({ x: -100, y: -100 });
  const hasMoved = useRef(false);
  const [enabled, setEnabled] = useState(false);

  // Only run on devices with a real mouse, and skip it entirely if the
  // person has asked the OS for reduced motion.
  useEffect(() => {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(isFinePointer && !reducedMotion);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      hasMoved.current = true;
    };
    window.addEventListener("mousemove", handleMove, { passive: true });

    let rafId;
    const animate = () => {
      if (hasMoved.current) {
        let prev = mouse.current;
        positions.current.forEach((pos, i) => {
          pos.x += (prev.x - pos.x) * EASE;
          pos.y += (prev.y - pos.y) * EASE;
          const el = dotsRef.current[i];
          if (el) {
            const scale = 1 - i / TRAIL_LENGTH;
            el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
            el.style.opacity = String(scale * 0.8);
          }
          prev = pos;
        });
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[999] overflow-hidden">
      {Array.from({ length: TRAIL_LENGTH }).map((_, i) =>
        mode === "text" ? (
          <span
            key={i}
            ref={(el) => (dotsRef.current[i] = el)}
            className="absolute select-none font-mono text-xs font-semibold"
            style={{
              color: GLOW_COLORS[i % GLOW_COLORS.length],
              textShadow: `0 0 8px ${GLOW_COLORS[i % GLOW_COLORS.length]}`,
              willChange: "transform, opacity",
            }}
          >
            {TRAIL_CHARACTERS[i % TRAIL_CHARACTERS.length]}
          </span>
        ) : (
          <div
            key={i}
            ref={(el) => (dotsRef.current[i] = el)}
            className="absolute h-2.5 w-2.5 rounded-full"
            style={{
              background: GLOW_COLORS[i % GLOW_COLORS.length],
              boxShadow: `0 0 10px 2px ${GLOW_COLORS[i % GLOW_COLORS.length]}`,
              willChange: "transform, opacity",
            }}
          />
        )
      )}
    </div>
  );
}
