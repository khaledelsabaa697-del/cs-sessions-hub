"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const containerVariants: Variants = {
 hidden: {},
 visible: {
 transition: { staggerChildren: 0.055, delayChildren: 0.04 },
 },
};

const itemVariants: Variants = {
 hidden: { opacity: 0, y: 14, scale: 0.99 },
 visible: {
 opacity: 1,
 y: 0,
 scale: 1,
 transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
 },
};

export function Stagger({
 children,
 className,
}: {
 children: ReactNode;
 className?: string;
}) {
 const reduced = useReducedMotion();
 if (reduced) return <div className={className}>{children}</div>;
 return (
 <motion.div
 className={className}
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 >
 {children}
 </motion.div>
 );
}

export function StaggerItem({
 children,
 className,
}: {
 children: ReactNode;
 className?: string;
}) {
 const reduced = useReducedMotion();
 if (reduced) return <div className={className}>{children}</div>;
 return (
 <motion.div className={cn(className)} variants={itemVariants}>
 {children}
 </motion.div>
 );
}
