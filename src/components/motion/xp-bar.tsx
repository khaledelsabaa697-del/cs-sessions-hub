"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function XpBar({
 progress,
 className,
 label,
 tone = "bronze",
}: {
 /** 0–1 */
 progress: number;
 className?: string;
 label?: string;
 tone?: "bronze" | "teal" | "violet";
}) {
 const reduced = useReducedMotion();
 const pct = Math.min(100, Math.max(0, progress * 100));
 const fills = {
 bronze: "bg-gradient-to-r from-bronze-600 via-bronze-400 to-bronze-300",
 teal: "bg-gradient-to-r from-teal-600 via-teal-400 to-cyan-300",
 violet: "bg-gradient-to-r from-violet-600 via-violet-400 to-fuchsia-300",
 };

 return (
 <div
 className={cn("xp-track h-2.5 rounded-full", className)}
 role="progressbar"
 aria-valuemin={0}
 aria-valuemax={100}
 aria-valuenow={Math.round(pct)}
 aria-label={label}
 >
 <motion.div
 className={cn("xp-fill h-full rounded-full", fills[tone])}
 initial={reduced ? false : { width: 0 }}
 animate={{ width: `${pct}%` }}
 transition={{ duration: reduced ? 0 : 1.1, ease: [0.22, 1, 0.36, 1], delay: reduced ? 0 : 0.25 }}
 />
 </div>
 );
}
