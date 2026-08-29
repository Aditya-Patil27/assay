import type { PlaceholderSource } from "@/lib/load";

/** Small presentational primitives shared across the page. */

export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-line px-4 py-12 sm:px-6 md:px-10 md:py-16">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted sm:text-xs">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          {title}
        </h2>
        {lede ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted md:text-base">{lede}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "attack" | "defend";
}) {
  const toneClass =
    tone === "attack" ? "text-attack" : tone === "defend" ? "text-defend" : "text-text";
  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums md:text-4xl ${toneClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs leading-snug text-muted">{sub}</p> : null}
    </Panel>
  );
}

/**
 * The correctness feature, not decoration.
 *
 * Spec 4.3: seeded fixtures ship `placeholder: true` and the page must say so while any
 * remain. It is deliberately the loudest element on the page, sticks to the top through
 * the whole scroll, and names the exact files -- a judge should never have to wonder
 * which number on screen is real, and a teammate should be able to go straight to the
 * writer that still owes output. Colour is not load-bearing: the word PLACEHOLDER, the
 * warning glyph and the file list all carry the meaning on their own.
 */
export function PlaceholderBanner({ sources }: { sources: PlaceholderSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 border-b-4 border-ink bg-warn text-ink shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4 sm:px-6 md:px-10">
        <p className="shrink-0 font-mono text-sm font-bold uppercase tracking-[0.14em]">
          <span aria-hidden="true">▲ </span>
          Placeholder data
        </p>
        <p className="font-mono text-xs leading-relaxed sm:text-[13px]">
          {sources.length} of 6 artifacts are seeded fixtures, not pipeline output — every
          figure drawn from them is fabricated. Still placeholder:{" "}
          <span className="font-bold">{sources.map((s) => s.file).join(", ")}</span>. This banner
          clears when those writers emit <span className="font-bold">placeholder=false</span>.
        </p>
      </div>
    </div>
  );
}

/**
 * Provenance footer.
 *
 * `git_sha` + `created_at` off the envelope, so a judge can tie the numbers on screen to
 * exactly one run of the pipeline.
 */
export function Provenance({
  shas,
  newest,
  children,
}: {
  shas: string[];
  newest: string;
  children?: React.ReactNode;
}) {
  return (
    <footer className="border-t border-line px-4 py-10 sm:px-6 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Provenance</p>
        <dl className="mt-4 grid gap-x-8 gap-y-4 font-mono text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">commit</dt>
            <dd className="mt-1 break-all text-sm text-text">
              {shas.join(" · ")}
              {shas.length > 1 ? (
                <span className="ml-2 text-warn">mixed — artifacts span commits</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">artifacts written</dt>
            <dd className="mt-1 text-sm text-text">
              <time dateTime={newest}>{newest.replace("T", " ").slice(0, 19)} UTC</time>
            </dd>
          </div>
          <div>
            <dt className="text-muted">pipeline</dt>
            <dd className="mt-1 text-sm text-text">Sparkov · XGBoost · coordinate descent</dd>
          </div>
          <div>
            <dt className="text-muted">this page</dt>
            <dd className="mt-1 text-sm text-text">static export · reads JSON, never trains</dd>
          </div>
        </dl>
        {children}
      </div>
    </footer>
  );
}

/** A legend entry that carries its meaning in a glyph as well as a colour. */
export function LegendKey({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted">
      {swatch}
      {label}
    </span>
  );
}
