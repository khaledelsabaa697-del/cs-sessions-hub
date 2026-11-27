export type RankTierKey = "bronze" | "silver" | "gold" | "diamond";

export type RankTier = {
  key: RankTierKey;
  min: number;
  nextMin: number | null;
  progress: number;
  pointsToNext: number | null;
};

export const RANK_TIERS: { key: RankTierKey; min: number }[] = [
  { key: "bronze", min: 0 },
  { key: "silver", min: 200 },
  { key: "gold", min: 500 },
  { key: "diamond", min: 1000 },
];

export const LEVEL_STEP = 100;

export function rankTierFor(points: number): RankTier {
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  let index = 0;
  for (let i = 0; i < RANK_TIERS.length; i += 1) {
    if (safe >= RANK_TIERS[i].min) index = i;
  }
  const tier = RANK_TIERS[index];
  const next = RANK_TIERS[index + 1] ?? null;
  const span = next ? next.min - tier.min : 0;
  const progress = next ? Math.min(1, Math.max(0, (safe - tier.min) / span)) : 1;

  return {
    key: tier.key,
    min: tier.min,
    nextMin: next?.min ?? null,
    progress: Number(progress.toFixed(4)),
    pointsToNext: next ? Math.max(0, Number((next.min - safe).toFixed(2))) : null,
  };
}

export type LevelInfo = {
  level: number;
  intoLevel: number;
  levelSize: number;
  progress: number;
  nextLevelAt: number;
};

export function levelFor(points: number): LevelInfo {
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  const level = Math.floor(safe / LEVEL_STEP) + 1;
  const intoLevel = Number((safe % LEVEL_STEP).toFixed(2));
  return {
    level,
    intoLevel,
    levelSize: LEVEL_STEP,
    progress: intoLevel / LEVEL_STEP,
    nextLevelAt: level * LEVEL_STEP,
  };
}

/** Visual accents per rank tier (static class names so Tailwind keeps them). */
export const TIER_STYLES: Record<
  RankTierKey,
  { text: string; border: string; from: string; glow: string; hex: string }
> = {
  bronze: {
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-600/30",
    from: "from-amber-700/25 to-amber-400/10",
    glow: "rgb(199 153 103 / 0.45)",
    hex: "#c79967",
  },
  silver: {
    text: "text-slate-600 dark:text-slate-200",
    border: "border-slate-400/35",
    from: "from-slate-400/25 to-slate-200/10",
    glow: "rgb(199 212 227 / 0.45)",
    hex: "#c7d4e3",
  },
  gold: {
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-500/35",
    from: "from-yellow-500/25 to-amber-300/10",
    glow: "rgb(246 196 83 / 0.45)",
    hex: "#f6c453",
  },
  diamond: {
    text: "text-cyan-700 dark:text-cyan-200",
    border: "border-cyan-400/35",
    from: "from-cyan-400/25 to-sky-300/10",
    glow: "rgb(125 211 252 / 0.45)",
    hex: "#7dd3fc",
  },
};
