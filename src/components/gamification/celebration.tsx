"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Labels = {
 levelTitle: string;
 levelBody: string;
 badgeTitle: string;
 badgeBody: string;
 dismiss: string;
};

type Toast = {
 id: string;
 title: string;
 body: string;
 kind: "level" | "badge";
};

const COLORS = ["#c79967", "#f6c453", "#7dd3fc", "#c4b5fd", "#6ee7b7"];

/**
 * Detects level-ups and new badges between visits (local only — no DB writes)
 * and shows a small confetti toast. Purely presentational.
 */
export function GradingCelebration({
 studentId,
 level,
 points,
 badgeCount,
 labels,
}: {
 studentId: string;
 level: number;
 points: number;
 badgeCount: number;
 labels: Labels;
}) {
 const reduced = useReducedMotion();
 const [toast, setToast] = useState<Toast | null>(null);

 useEffect(() => {
 const key = `sfe:progress:${studentId}`;
 let previous: { level?: number; badgeCount?: number } | null = null;
 try {
 const raw = localStorage.getItem(key);
 if (raw) previous = JSON.parse(raw);
 } catch {
 previous = null;
 }

 // First visit: remember the baseline, do not celebrate.
 try {
 localStorage.setItem(key, JSON.stringify({ level, points, badgeCount }));
 } catch {
 // storage may be blocked
 }

 if (!previous) return;
 if (typeof previous.level === "number" && level > previous.level) {
 setToast({
 id: `level-${level}`,
 kind: "level",
 title: labels.levelTitle,
 body: labels.levelBody,
 });
 } else if (typeof previous.badgeCount === "number" && badgeCount > previous.badgeCount) {
 setToast({
 id: `badge-${badgeCount}`,
 kind: "badge",
 title: labels.badgeTitle,
 body: labels.badgeBody,
 });
 }
 }, [studentId, level, points, badgeCount, labels]);

 useEffect(() => {
 if (!toast) return;
 const timer = window.setTimeout(() => setToast(null), 7000);
 return () => window.clearTimeout(timer);
 }, [toast]);

 const pieces = reduced
 ? []
 : Array.from({ length: 22 }, (_, index) => ({
 id: index,
 left: 6 + Math.random() * 88,
 drift: Math.random() * 90 - 45,
 delay: Math.random() * 0.5,
 duration: 1.4 + Math.random() * 1.1,
 color: COLORS[index % COLORS.length],
 rotate: Math.random() * 180,
 }));

 return (
 <AnimatePresence>
 {toast ? (
 <motion.div
 key={toast.id}
 initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 12, scale: 0.98 }}
 transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
 className="fixed bottom-24 end-4 z-[60] w-[min(21rem,calc(100vw-2rem))] sm:bottom-6"
 role="status"
 aria-live="polite"
 >
 <div className="glass-card shimmer-border relative overflow-hidden rounded-2xl p-4">
 <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
 {pieces.map((piece) => (
 <span
 key={piece.id}
 className="confetti-piece"
 style={
 {
 left: `${piece.left}%`,
 background: piece.color,
 "--drift": `${piece.drift}px`,
 "--fall-delay": `${piece.delay}s`,
 "--fall-duration": `${piece.duration}s`,
 transform: `rotate(${piece.rotate}deg)`,
 } as CSSProperties
 }
 />
 ))}
 </div>

 <div className="relative flex items-start gap-3">
 <span
 className={cn(
 "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
 toast.kind === "level"
 ? "bg-bronze-500/15 text-bronze-600 ring-bronze-400/30 dark:text-bronze-300"
 : "bg-amber-500/15 text-amber-600 ring-amber-400/30 dark:text-amber-300",
 )}
 >
 {toast.kind === "level" ? (
 <Trophy className="size-5" aria-hidden="true" />
 ) : (
 <Sparkles className="size-5" aria-hidden="true" />
 )}
 </span>
 <div className="min-w-0 flex-1">
 <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bronze-600 dark:text-bronze-300">
 {toast.kind === "level" ? `// level_up` : `// badge_unlocked`}
 </p>
 <p className="mt-1 text-sm font-bold text-[var(--ink)]">{toast.title}</p>
 <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
 {toast.body}
 </p>
 </div>
 <button
 type="button"
 onClick={() => setToast(null)}
 className="rounded-lg p-1 text-[var(--ink-muted)] transition hover:bg-[var(--glass-inset)] hover:text-[var(--ink)]"
 aria-label={labels.dismiss}
 >
 <X className="size-4" aria-hidden="true" />
 </button>
 </div>
 </div>
 </motion.div>
 ) : null}
 </AnimatePresence>
 );
}
