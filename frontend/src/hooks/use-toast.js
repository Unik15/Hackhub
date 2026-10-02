import { useEffect, useState } from "react";

let toasts = [];
let listeners = [];
let uid = 0;

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

/**
 * Fire a toast from anywhere: toast({ title, description, variant }).
 * variant: "default" | "destructive"
 */
export function toast({ title, description, variant = "default", duration = 4000 }) {
  const id = ++uid;
  toasts = [...toasts, { id, title, description, variant }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, duration);
  return id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [state, setState] = useState(toasts);
  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);
  return { toasts: state };
}
