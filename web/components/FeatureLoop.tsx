import Link from "next/link";

import { Reveal } from "@/components/Reveal";

/**
 * A heading beside the product moving. Silent, autoplaying, looping — the pattern the
 * reference site (gr-connect.org) uses for each feature, because a fifteen-second clip of
 * the thing working says more than a card of text about it. playsInline is what lets iOS
 * autoplay; preload="metadata" keeps three clips from downloading before the hero paints.
 */
export function FeatureLoop({
  eyebrow,
  title,
  blurb,
  href,
  cta,
  src,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  src: string;
  flip?: boolean;
}) {
  return (
    <Reveal as="section" className="wrap py-10">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <div className={flip ? "lg:order-2" : ""}>
          <p data-stagger="0" className="mono-label text-[0.75rem] text-attack">
            {eyebrow}
          </p>
          <h2 data-stagger="1" className="display mt-3 text-[1.75rem] md:text-[2rem]">
            {title}
          </h2>
          <p data-stagger="2" className="prose col mt-3">
            {blurb}
          </p>
          <Link
            href={href}
            data-stagger="3"
            className="mt-5 inline-block text-[0.8125rem] font-medium text-defend"
          >
            {cta}{" "}
            <span aria-hidden="true" className="nudge">
              →
            </span>
          </Link>
        </div>
        <div
          data-stagger="1"
          className={`overflow-hidden rounded-[8px] border border-rule bg-black ${flip ? "lg:order-1" : ""}`}
        >
          <video
            src={src}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={title}
            className="block h-auto w-full"
          />
        </div>
      </div>
    </Reveal>
  );
}
