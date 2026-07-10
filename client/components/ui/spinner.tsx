import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-fg-subtle ${className}`} aria-label="Loading" />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
