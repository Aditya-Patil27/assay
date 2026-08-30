import type { PlaceholderSource } from "@/lib/load";

/**
 * The document primitives.
 *
 * This page is a report, so the primitives are a report's: a numbered section, a numbered
 * figure with a caption, a key-result list. There is deliberately no card. The previous
 * version rendered six identical `eyebrow -> heading -> lede -> bordered rounded panel`
 * blocks, which gave every section the same visual weight and made the page read as a
 * dashboard of equals rather than as an argument with a shape.
 */

/**
 * A numbered section.
 *
 * The number lives in the margin on wide screens and inline on narrow ones. It is the
 * only thing that replaces the old uppercase-mono eyebrow, and it does the job better,
 * because it is also what the contents list and the figure captions refer back to.
 */
export function Section({
  id,
  n,
  title,
  lede,
  children,
}: {
  id: string;
  n: number;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-rule-strong py-12 md:py-16">
      <div className="wrap grid gap-x-8 gap-y-2 lg:grid-cols-[4.5rem_minmax(0,1fr)]">
        <p aria-hidden="true" className="font-mono text-sm text-muted lg:pt-2 lg:text-right">
          &sect;{n}
        </p>

        <div>
          <h2 className="col font-serif text-[1.75rem] leading-[1.15] tracking-[-0.015em] md:text-[2.25rem]">
            {title}
          </h2>
          {lede ? <p className="prose col mt-4 text-muted">{lede}</p> : null}
          <div className="mt-9">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * A numbered figure.
 *
 * The caption sits below the artwork and carries the reading, so the surrounding prose
 * never has to repeat what the chart shows. Figures are the only element allowed to break
 * out of the 68ch measure, which is what makes the break mean something.
 */
export function Figure({
  n,
  caption,
  children,
  className = "",
}: {
  n: number;
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={className}>
      <div className="border-y border-rule bg-figure px-3 py-5 sm:px-5">{children}</div>
      <figcaption className="mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
        <span className="font-medium text-ink">Figure {n}.</span> {caption}
      </figcaption>
    </figure>
  );
}

/**
 * A flat inset. Not a card: square corners, one hairline, paper-adjacent fill.
 *
 * Kept as a primitive because several panels genuinely are grouped sub-units of one
 * figure (one per round, one per OWASP category) rather than sections of their own.
 */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`border border-rule bg-paper p-4 sm:p-5 ${className}`}>{children}</div>;
}

/**
 * One headline number, as a row in a results list rather than a tile in a grid.
 *
 * A 4-up grid of bordered tiles says all four numbers matter equally. They do not: the
 * first two are the finding, the second two are what the finding cost. Rows in a
 * rule-separated list carry an order; tiles in a grid do not.
 */
export function KeyResult({
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
    tone === "attack" ? "text-attack" : tone === "defend" ? "text-defend" : "text-ink";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-t border-rule py-4 sm:grid-cols-[13rem_7rem_minmax(0,1fr)]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`tnum font-mono text-2xl sm:text-[1.75rem] ${toneClass}`}>{value}</dd>
      {sub ? (
        <p className="col-span-2 text-[0.8125rem] leading-relaxed text-muted sm:col-span-1">
          {sub}
        </p>
      ) : (
        <span className="hidden sm:block" />
      )}
    </div>
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
    <div role="alert" className="sticky top-0 z-50 bg-warn text-paper">
      <div className="wrap flex flex-col gap-2 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="shrink-0 font-mono text-sm font-semibold uppercase tracking-[0.08em]">
          <span aria-hidden="true">&#9650; </span>
          Placeholder data
        </p>
        <p className="text-[0.8125rem] leading-relaxed">
          {sources.length} of 6 artifacts are seeded fixtures, not pipeline output &mdash; every
          figure drawn from them is fabricated. Still placeholder:{" "}
          <span className="font-mono font-medium">{sources.map((s) => s.file).join(", ")}</span>.
          This banner clears when those writers emit{" "}
          <span className="font-mono font-medium">placeholder=false</span>.
        </p>
      </div>
    </div>
  );
}

/**
 * Colophon.
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
    <footer className="border-t border-rule-strong py-10">
      <div className="wrap">
        <p className="text-sm font-medium">Colophon</p>
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-[0.8125rem] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">commit</dt>
            <dd className="mt-1 break-all font-mono">
              {shas.join(" · ")}
              {shas.length > 1 ? (
                <span className="ml-2 text-warn">mixed &mdash; artifacts span commits</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">artifacts written</dt>
            <dd className="mt-1 font-mono">
              <time dateTime={newest}>{newest.replace("T", " ").slice(0, 19)} UTC</time>
            </dd>
          </div>
          <div>
            <dt className="text-muted">pipeline</dt>
            <dd className="mt-1">Sparkov &middot; XGBoost &middot; coordinate descent</dd>
          </div>
          <div>
            <dt className="text-muted">this page</dt>
            <dd className="mt-1">static export &middot; reads JSON, never trains</dd>
          </div>
        </dl>
        {children}
      </div>
    </footer>
  );
}

/** A legend entry that carries its meaning in a glyph as well as a colour. */
export function LegendKey({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.75rem] text-muted">
      {swatch}
      {label}
    </span>
  );
}
