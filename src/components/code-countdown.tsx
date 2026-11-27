"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function CodeCountdown({ expiresAt }: { expiresAt: string }) {
  const t = useTranslations("admin.session");
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, end - Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (remaining === null) {
    return <span className="tabular-nums">—</span>;
  }
  if (remaining <= 0) {
    return <span className="font-medium text-rose-600 dark:text-rose-400">{t("expired")}</span>;
  }
  return <span className="tabular-nums">{formatRemaining(remaining)}</span>;
}
