import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-white/60">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function authInputClass(hasError) {
  return `w-full rounded border bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 disabled:opacity-50 ${
    hasError ? "border-red-500/60" : "border-white/10 focus:border-[#F2A93B]"
  }`;
}

/** Submit button that shows a spinner + disables while the request is in flight. */
export function AuthSubmitButton({ busy, label, busyLabel }) {
  return (
    <Button type="submit" disabled={busy} className="w-full">
      {busy ? (
        <>
          <Loader2 size={16} className="animate-spin" /> {busyLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-xs text-white/40">or</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}
