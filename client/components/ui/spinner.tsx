import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-fg-subtle ${className}`} aria-label="Loading" />;
}

// `hint` is for when the wait stops being a normal load and becomes a wait on
// something that is not answering. A spinner with no explanation reads as
// "frozen" and gets the tablet rebooted mid-shift; saying what it is waiting for
// is the difference between a blip and a support call.
export function PageSpinner({ hint }: { hint?: string } = {}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface">
      <Spinner className="h-8 w-8" />
      {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
    </div>
  );
}
