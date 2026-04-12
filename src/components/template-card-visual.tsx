"use client";

import { cn } from "@/lib/utils";
import type { TemplateAccent } from "@/lib/template-visuals";
import {
  DEFAULT_TEMPLATE_ICON,
  templateAccentClass,
  TEMPLATE_CATEGORY_ICONS,
} from "@/lib/template-visuals";

export function TemplateCardVisual({
  accent,
  category,
  className,
  size = "sm",
}: {
  accent: TemplateAccent;
  category: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = TEMPLATE_CATEGORY_ICONS[category] ?? DEFAULT_TEMPLATE_ICON;
  const iconClass =
    size === "lg"
      ? "size-14 text-white/[0.16]"
      : size === "md"
        ? "size-10 text-white/[0.2]"
        : "size-7 text-white/[0.22]";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        templateAccentClass(accent),
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_18%_12%,rgba(255,255,255,0.06),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.11)_1px,transparent_1px)] [background-size:13px_13px]"
        aria-hidden
      />
      <Icon className={cn("relative shrink-0 stroke-[1.2]", iconClass)} aria-hidden />
    </div>
  );
}
