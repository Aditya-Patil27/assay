"use client";

import { useEffect, useRef } from "react";

/**
 * A section that arrives when it is scrolled to.
 *
 * The element is emitted server-side with `reveal-group`; this adds `is-in` the first time
 * an IntersectionObserver reports it on screen, and CSS does the rest (globals.css, Motion).
 * Children marked `data-stagger` are given an incremental transition delay in document
 * order, so a heading, its standfirst and its figure land 60ms apart rather than together.
 *
 * Three deliberate safeties, because a reveal that never fires is a blank page:
 *
 *   - the hidden state is scoped to `@media (scripting: enabled)`, so no JavaScript means
 *     no animation rather than no content;
 *   - a section already on screen at mount fires immediately (the observer reports an
 *     intersecting element on its first callback), and `immediate` skips the observer
 *     entirely for anything above the fold;
 *   - a timeout reveals the section regardless after 2.5s, in case the observer is never
 *     served a callback at all.
 *
 * The delay is set on the DOM node rather than passed as an inline style so that a server
 * component can hand this arbitrary children without knowing their order.
 */
export function Reveal({
  as = "div",
  className = "",
  immediate = false,
  step = 60,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "header" | "aside";
  /** Above the fold: reveal at mount instead of waiting for a scroll. */
  immediate?: boolean;
  /** Milliseconds between successive `data-stagger` children. */
  step?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.querySelectorAll<HTMLElement>("[data-stagger]").forEach((child, i) => {
      // An explicit data-stagger="3" pins a child to a slot, so a two-column section can
      // interleave its sides instead of running one column and then the other.
      const pinned = Number(child.dataset.stagger);
      const slot = Number.isFinite(pinned) && child.dataset.stagger !== "" ? pinned : i;
      child.style.transitionDelay = `${slot * step}ms`;
    });

    const show = () => el.classList.add("is-in");

    if (immediate || typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
    );
    observer.observe(el);

    const fallback = window.setTimeout(show, 2500);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [immediate, step]);

  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={`reveal-group ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
