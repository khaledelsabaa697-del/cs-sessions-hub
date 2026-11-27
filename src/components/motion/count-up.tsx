"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Animates a number from 0 to `value`. Latin digits and tabular figures are
 * used everywhere so scores read the same in English and Arabic.
 */
export function CountUp({
 value,
 duration = 900,
 decimals = 0,
 suffix = "",
 prefix = "",
 className,
}: {
 value: number;
 duration?: number;
 decimals?: number;
 suffix?: string;
 prefix?: string;
 className?: string;
}) {
 const reduced = useReducedMotion();
 const [display, setDisplay] = useState(value);
 const frame = useRef<number | null>(null);

 useEffect(() => {
 if (reduced) {
 setDisplay(value);
 return;
 }
 const start = performance.now();
 const from = 0;
 const tick = (now: number) => {
 const t = Math.min(1, (now - start) / duration);
 const eased = 1 - Math.pow(1 - t, 3);
 setDisplay(from + (value - from) * eased);
 if (t < 1) frame.current = requestAnimationFrame(tick);
 };
 frame.current = requestAnimationFrame(tick);
 return () => {
 if (frame.current !== null) cancelAnimationFrame(frame.current);
 };
 }, [value, duration, reduced]);

 const formatted = new Intl.NumberFormat("en-US", {
 minimumFractionDigits: decimals,
 maximumFractionDigits: decimals,
 }).format(display);

 return (
 <span className={className} data-latin-digits>
 {prefix}
 {formatted}
 {suffix}
 </span>
 );
}
