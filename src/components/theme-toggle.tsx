"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { iconButtonClass } from "@/components/ui";

export function ThemeToggle() {
  const t = useTranslations("nav");
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // storage may be blocked; class still applies for this page
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={iconButtonClass}
      aria-label={t("toggleTheme")}
      title={t("toggleTheme")}
      aria-pressed={mounted ? dark : undefined}
    >
      {mounted && dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}
