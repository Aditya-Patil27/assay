"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Site chrome: a persistent header and footer across real routes.
 *
 * This replaced a single page that scrolled for six sections. A scroll is not navigation:
 * a judge who wants the agentic result should not have to travel through the tabular one
 * to reach it, and nothing about the old page could be linked to, bookmarked, or opened
 * in a second tab beside the first.
 */
export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/live", label: "Live demo" },
  { href: "/results", label: "Results" },
  { href: "/attack", label: "Tabular attack" },
  { href: "/agent", label: "Agent attack" },
  { href: "/audit", label: "Audit" },
  { href: "/lineage", label: "Lineage" },
  { href: "/system", label: "System" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="wrap flex h-14 items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="display text-[0.9375rem] text-ink">Assay</span>
        </Link>

        <nav aria-label="Sections" className="ml-auto flex items-center gap-0.5 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-[5px] px-2.5 py-1.5 text-[0.8125rem] transition-colors ${
                  active
                    ? "bg-figure-2 font-medium text-ink"
                    : "text-muted hover:bg-figure-2 hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/**
 * The mark: a 3x3 of cells with one cell escaping.
 *
 * The whole project is one evasion out of a grid the detector thought it had covered, so
 * the logo is that rather than a shield or a padlock.
 */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="18" height="18" rx="4" fill="var(--color-ink)" />
      {[
        [5, 5],
        [9.5, 5],
        [5, 9.5],
        [9.5, 9.5],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="2.5" height="2.5" rx="0.6" fill="#8f99a8" />
      ))}
      <rect x="14" y="14" width="2.5" height="2.5" rx="0.6" fill="var(--color-attack-fill)" />
    </svg>
  );
}

export function SiteFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="mt-20 border-t border-rule py-10">
      <div className="wrap">
        <div className="flex flex-wrap items-start gap-x-12 gap-y-6">
          <div className="max-w-[34ch]">
            <div className="flex items-center gap-2.5">
              <Mark />
              <span className="display text-[0.9375rem]">Assay</span>
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
              Assay tests whether an adversarial security number means anything, by holding the
              attacker to constraints a real one would face. Razorpay AI Buildathon 2026, Open Track.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-[0.8125rem] text-muted transition-colors hover:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        {children}
      </div>
    </footer>
  );
}
