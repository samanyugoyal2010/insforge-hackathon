import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoWordmarkProps = {
  className?: string;
  /** Prefer true for above-the-fold brand marks (e.g. main nav). */
  priority?: boolean;
};

/** “Node” in sans + unambiguous “0” in mono so it never reads as “Nodeo”. */
export function LogoWordmark({ className, priority }: LogoWordmarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-sans font-semibold tracking-[-0.04em] text-inherit",
        className,
      )}
    >
      <Image
        src="/node0-logo.png"
        alt=""
        width={32}
        height={32}
        className="size-7 shrink-0 object-contain sm:size-8"
        priority={priority}
      />
      <span className="inline-flex items-baseline gap-0">
        <span>Node</span>
        <span className="font-mono text-[0.9em] font-semibold tracking-tight">
          0
        </span>
      </span>
    </span>
  );
}
