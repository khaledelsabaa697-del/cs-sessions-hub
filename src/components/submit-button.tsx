"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonPrimary } from "@/components/ui";

export function SubmitButton({
  idle,
  pendingLabel,
  className,
  disabled = false,
}: {
  idle: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={cn(buttonPrimary, className)}>
      {pending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      {pending ? pendingLabel : idle}
    </button>
  );
}
