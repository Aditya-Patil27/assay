import type { PlaceholderSource } from "@/lib/load";

/**
 * Page primitives.
 *
 * These were built for a single scrolling document and carried a section number in the
 * margin. They are now shared across real routes, so the numbering is gone: a reader who
 * lands on /agent from a link has no idea what "§6" is counting, and it was only ever
 * counting scroll position anyway. Figures are still numbered, but per page.
 */

/** The top of a route: title, standfirst, and the rule that starts the content. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="wrap pb-10 pt-12 md:pt-16">
      {eyebrow ? (
        <p className="text-[0.8125rem] font-medium text-defend">{eyebrow}</p>
      ) : null}
      <h1
        className={`display max-w-[22ch] text-[2rem] leading-[1.1] sm:text-[2.5rem] md:text-[3rem] ${eyebrow ? "mt-2" : ""}`}
      >
        {title}
      </h1>
      {lede ? <p className="prose col mt-5">{lede}</p> : null}
      {children}
    </header>
  );
}

/** A titled block within a page. */
export function Block({
  id,
  title,
  lede,
  children,
}: {
  id?: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="wrap scroll-mt-20 py-10 md:py-12">
      <h2 className="display col text-[1.5rem] leading-tight md:text-[1.75rem]">{title}</h2>
      {lede ? <p className="prose col mt-3">{lede}</p> : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}

/**
 * A numbered figure with its reading in the caption, so the surrounding prose never has
 * to repeat what the chart shows.
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
      <div className="card border border-rule px-3 py-5 sm:px-5">{children}</div>
      <figcaption className="mt-3 max-w-[64ch] text-[0.8125rem] leading-relaxed text-muted">
        <span className="font-medium text-ink">Fig. {n}</span> — {caption}
      </figcaption>
    </figure>
  );
}

/** Attio's card: white, 8px radius, two-layer shadow so faint it reads as a lift. */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card border border-rule p-4 sm:p-5 ${className}`}>{children}</div>;
}

/**
 * One headline number, as a row in a results list rather than a tile in a grid.
 *
 * A grid of tiles says every number matters equally. They do not: the finding comes
 * first, what it cost comes second. Rows carry that order; a grid cannot.
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
  // A word like "not measured" is not a measurement and must not be set at measurement
  // size -- at 1.75rem it wrapped and broke out of its column. Long values step down.
  const long = value.length > 8;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-t border-rule py-4 sm:grid-cols-[13rem_minmax(7rem,auto)_minmax(0,1fr)]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`tnum display whitespace-nowrap ${long ? "text-base sm:text-lg" : "text-2xl sm:text-[1.75rem]"} ${toneClass}`}
      >
        {value}
      </dd>
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
 * remain. It is deliberately the loudest element on the site, sits above the header on
 * every route, and names the exact files -- a judge should never have to wonder which
 * number on screen is real, and a teammate should be able to go straight to the writer
 * that still owes output. Colour is not load-bearing: the word, the glyph and the file
 * list all carry the meaning on their own.
 */
export function PlaceholderBanner({ sources }: { sources: PlaceholderSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div role="alert" className="bg-warn text-white">
      <div className="wrap flex flex-col gap-2 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="shrink-0 font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.06em]">
          <span aria-hidden="true">&#9650; </span>
          Placeholder data
        </p>
        <p className="text-[0.8125rem] leading-relaxed">
          {sources.length} of 6 artifacts are seeded fixtures, not pipeline output &mdash; every
          figure drawn from them is fabricated. Still placeholder:{" "}
          <span className="font-mono font-medium">{sources.map((s) => s.file).join(", ")}</span>.
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
export function Provenance({ shas, newest }: { shas: string[]; newest: string }) {
  return (
    <dl className="mt-10 grid gap-x-8 gap-y-4 border-t border-rule pt-6 text-[0.8125rem] sm:grid-cols-2 lg:grid-cols-4">
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
        <dt className="text-muted">this site</dt>
        <dd className="mt-1">reads committed JSON &middot; never trains</dd>
      </div>
    </dl>
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
