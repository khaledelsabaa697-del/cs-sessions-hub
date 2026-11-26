"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export function GradingStatusWatcher({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
