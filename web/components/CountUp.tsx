"use client";

import { useEffect, useRef } from "react";

/**
 * A statistic that counts up to itself, once, the first time it is looked at.
 *
 * The rule this obeys is that the number on screen at rest must be byte-for-byte the string
 * the server rendered. So the final frame writes `value` back verbatim rather than
 * re-formatting it, the animation only runs on a string that parses cleanly as a number
 * (with an optional `%` or `ms` suffix), and everything else -- "7/20", a word -- simply
 * fades in. Nothing on this site is allowed to invent a digit, including its own animation.
 *
 * The tween is written straight to the DOM node instead of through state: React renders the
 * final string on the server and never re-renders, so there is no hydration mismatch to
 * reconcile and no per-frame render cost.
 */
const NUMERIC = /^(-?\d[\d,]*(?:\.\d+)?)(\s*%|\s*ms)?$/;

const DURATION = 900;

export function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const match = NUMERIC.exec(value.trim());
    const digits = match ? match[1] : null;
    const suffix = match?.[2] ?? "";
    const target = digits ? Number(digits.replace(/,/g, "")) : Number.NaN;
    const decimals = digits ? (digits.split(".")[1] ?? "").length : 0;
    const grouped = Boolean(digits?.includes(","));

    const render = (n: number) =>
      (grouped
        ? n.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : n.toFixed(decimals)) + suffix;

    // Hidden from JavaScript, never from CSS: a reader without scripts sees the number.
    el.style.opacity = "0";
    el.style.transition = "opacity 380ms ease-out";
    if (Number.isFinite(target)) el.textContent = render(0);

    let frame = 0;
    const run = () => {
      el.style.opacity = "1";
      if (!Number.isFinite(target)) return;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / DURATION, 1);
        if (p < 1) {
          el.textContent = render(target * (1 - Math.pow(1 - p, 3)));
          frame = requestAnimationFrame(tick);
        } else {
          el.textContent = value; // the exact string the server rendered
        }
      };
      frame = requestAnimationFrame(tick);
    };

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined") {
      run();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer?.disconnect();
              run();
            }
          }
        },
        { threshold: 0.3 },
      );
      observer.observe(el);
    }

    // Long stop: if the observer never fires at all, the number is still there to read.
    // Thirty seconds is well past any scroll a reader was going to make.
    const fallback = window.setTimeout(() => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      el.style.opacity = "1";
      el.textContent = value;
    }, 30000);

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
