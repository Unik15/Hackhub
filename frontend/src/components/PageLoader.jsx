import React from "react";

export default function PageLoader() {
  return (
    <div className="container flex items-center justify-center py-32">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
