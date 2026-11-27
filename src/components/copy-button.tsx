"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions can be denied; the value stays visible.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--glass-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-soft)] transition hover:bg-[var(--glass-inset)] ",
        className,
      )}
    >
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
