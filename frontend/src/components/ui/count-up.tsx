"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  target: number;
  /** Text appended after the number once counting finishes, e.g. "+" or "%". */
  suffix?: string;
  duration?: number;
  className?: string;
  /** Optional formatter for the in-progress and final value, e.g. a currency formatter. Defaults to plain rounded integer. */
  format?: (value: number) => string;
}

/**
 * Counts up from 0 to `target` once the element scrolls into view, using
 * an ease-out cubic curve. Runs once — re-mount the component (e.g. with a
 * changing `key`) to replay it.
 */
export function CountUp({ target, suffix = "", duration = 1200, className, format }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setValue(target);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        observer.unobserve(el);

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(Math.round(eased * target));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref} className={className}>
      {format ? format(value) : value}
      {suffix}
    </span>
  );
}
