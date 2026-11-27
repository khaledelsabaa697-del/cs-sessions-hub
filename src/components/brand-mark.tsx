import { cn } from "@/lib/utils";
import Image from "next/image";

export function BrandMark({ className, size = 9 }: { className?: string; size?: number }) {
  const sizeClass = `size-${size}`;

  return (
    <span className={cn("flex shrink-0", className)} aria-hidden="true">
      {/* Dark mode logo */}
      <Image
        src="/brand/logo-dark-trim.png"
        alt=""
        width={size * 4}
        height={size * 4}
        className={cn("hidden dark:block", sizeClass)}
        priority
      />
      {/* Light mode logo */}
      <Image
        src="/brand/logo-light-trim.png"
        alt=""
        width={size * 4}
        height={size * 4}
        className={cn("block dark:hidden", sizeClass)}
        priority
      />
    </span>
  );
}
