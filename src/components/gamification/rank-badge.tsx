import { Crown, Gem, Medal, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_STYLES, type RankTierKey } from "@/lib/gamification";

const ICONS = {
 bronze: Shield,
 silver: Medal,
 gold: Crown,
 diamond: Gem,
} as const;

export function RankBadge({
 tier,
 label,
 size = "sm",
 className,
}: {
 tier: RankTierKey;
 label: string;
 size?: "sm" | "md";
 className?: string;
}) {
 const Icon = ICONS[tier];
 const style = TIER_STYLES[tier];
 return (
 <span
 className={cn(
 "inline-flex items-center gap-1.5 rounded-full border bg-gradient-to-r font-mono font-semibold uppercase tracking-[0.12em]",
 style.border,
 style.from,
 style.text,
 size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
 className,
 )}
 style={{ boxShadow: `0 0 22px -10px ${style.glow}` }}
 >
 <Icon className={size === "sm" ? "size-3" : "size-4"} aria-hidden="true" />
 {label}
 </span>
 );
}
