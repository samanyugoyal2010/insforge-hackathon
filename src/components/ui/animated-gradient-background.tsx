"use client";

import React, { useEffect, useMemo, useRef } from "react";

function radialGradientCss(
  width: number,
  topOffset: number,
  gradientColors: string[],
  gradientStops: number[],
) {
  const stops = gradientStops
    .map((stop, index) => `${gradientColors[index]} ${stop}%`)
    .join(", ");
  return `radial-gradient(${width}% ${width + topOffset}% at 50% 20%, ${stops})`;
}

interface AnimatedGradientBackgroundProps {
  /**
   * Initial size of the radial gradient, defining the starting width.
   * @default 110
   */
  startingGap?: number;

  /**
   * Enables or disables the breathing animation effect.
   * @default true
   */
  Breathing?: boolean;

  /**
   * Array of colors to use in the radial gradient.
   * Each color corresponds to a stop percentage in `gradientStops`.
   * @default ["#0A0A0A", "#2979FF", "#FF80AB", "#FF6D00", "#FFD600", "#00E676", "#3D5AFE"]
   */
  gradientColors?: string[];

  /**
   * Array of percentage stops corresponding to each color in `gradientColors`.
   * The values should range between 0 and 100.
   * @default [35, 50, 60, 70, 80, 90, 100]
   */
  gradientStops?: number[];

  /**
   * Speed of the breathing animation.
   * Lower values result in slower animation.
   * @default 0.011
   */
  animationSpeed?: number;

  /**
   * Maximum range for the breathing animation in percentage points.
   * Determines how much the gradient "breathes" by expanding and contracting.
   * @default 3.5
   */
  breathingRange?: number;

  /**
   * Additional inline styles for the gradient container.
   * @default {}
   */
  containerStyle?: React.CSSProperties;

  /**
   * Additional class names for the gradient container.
   * @default ""
   */
  containerClassName?: string;

  /**
   * Additional top offset for the gradient container form the top to have a more flexible control over the gradient.
   * @default 0
   */
  topOffset?: number;

  /**
   * Halftone-style dot scrim: dark dots sit on top; gradient shows between dots (not chunky—tune spacing).
   * @default true
   */
  halftoneDots?: boolean;

  /** Pixel grid size for halftone repeat (smaller = finer mesh). @default 7 */
  halftoneSpacing?: number;

  /** Approximate dot radius in px. @default 1.15 */
  halftoneDotRadius?: number;

  /** How dark the dot overlay is (0–1). @default 0.62 */
  halftoneStrength?: number;

  /** Solid color behind the gradient (avoids flash before first paint). @default first gradient color or #06060a */
  baseColor?: string;

  /**
   * Extra size breathed into the radial (percentage points added to both ellipse axes).
   * Smoothly lerped each frame—use for UI transitions without CSS scale/zoom.
   * @default 0
   */
  breathOvershoot?: number;
}

/**
 * AnimatedGradientBackground
 *
 * Radial gradient with optional subtle breathing (requestAnimationFrame).
 * No entrance animation — gradient is correct on first paint.
 */
const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 125,
  Breathing = true,
  gradientColors = [
    "#0A0A0A",
    "#2979FF",
    "#FF80AB",
    "#FF6D00",
    "#FFD600",
    "#00E676",
    "#3D5AFE",
  ],
  gradientStops = [35, 50, 60, 70, 80, 90, 100],
  animationSpeed = 0.011,
  breathingRange = 3.5,
  containerStyle = {},
  topOffset = 0,
  containerClassName = "",
  halftoneDots = true,
  halftoneSpacing = 7,
  halftoneDotRadius = 1.15,
  halftoneStrength = 0.62,
  baseColor,
  breathOvershoot = 0,
}) => {
  if (gradientColors.length !== gradientStops.length) {
    throw new Error(
      `GradientColors and GradientStops must have the same length.
     Received gradientColors length: ${gradientColors.length},
     gradientStops length: ${gradientStops.length}`,
    );
  }

  const fallbackBg = baseColor ?? gradientColors[0] ?? "#06060a";

  const initialGradient = useMemo(
    () =>
      radialGradientCss(startingGap, topOffset, gradientColors, gradientStops),
    [startingGap, topOffset, gradientColors, gradientStops],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const breathTargetRef = useRef(breathOvershoot);
  const breathSmoothedRef = useRef(0);

  useEffect(() => {
    breathTargetRef.current = breathOvershoot;
  }, [breathOvershoot]);

  useEffect(() => {
    let animationFrame: number;
    let width = startingGap;
    let direction = 1 as 1 | -1;

    const animateGradient = () => {
      const target = breathTargetRef.current;
      breathSmoothedRef.current +=
        (target - breathSmoothedRef.current) * 0.15;
      const extra = breathSmoothedRef.current;

      if (Breathing) {
        if (width >= startingGap + breathingRange) direction = -1;
        if (width <= startingGap - breathingRange) direction = 1;
        width += direction * animationSpeed;
      } else {
        width = startingGap;
      }

      const effW = width + extra;
      const effTop = topOffset + extra * 0.14;

      const gradient = radialGradientCss(
        effW,
        effTop,
        gradientColors,
        gradientStops,
      );

      if (containerRef.current) {
        containerRef.current.style.backgroundImage = gradient;
      }

      animationFrame = requestAnimationFrame(animateGradient);
    };

    animationFrame = requestAnimationFrame(animateGradient);

    return () => cancelAnimationFrame(animationFrame);
  }, [
    startingGap,
    Breathing,
    gradientColors,
    gradientStops,
    animationSpeed,
    breathingRange,
    topOffset,
  ]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${containerClassName}`}
      style={{ backgroundColor: fallbackBg }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          ...containerStyle,
          backgroundColor: fallbackBg,
          backgroundImage: initialGradient,
          backgroundRepeat: "no-repeat",
        }}
      />
      {halftoneDots ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: `rgba(6, 6, 10, ${halftoneStrength})`,
            maskImage: `radial-gradient(circle at center, white ${halftoneDotRadius}px, transparent ${halftoneDotRadius + 0.35}px)`,
            maskSize: `${halftoneSpacing}px ${halftoneSpacing}px`,
            maskRepeat: "repeat",
            maskPosition: "center",
            WebkitMaskImage: `radial-gradient(circle at center, white ${halftoneDotRadius}px, transparent ${halftoneDotRadius + 0.35}px)`,
            WebkitMaskSize: `${halftoneSpacing}px ${halftoneSpacing}px`,
            WebkitMaskRepeat: "repeat",
            WebkitMaskPosition: "center",
          }}
        />
      ) : null}
    </div>
  );
};

export default AnimatedGradientBackground;
