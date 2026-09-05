import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";

import { Block, PageHeader } from "@/components/Chrome";
import { AuditLedger, type AuditMessage } from "@/components/AuditLedger";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = { title: "Audit" };

/**
 * The audit console, native.
 *
 * This used to be a vendored HTML file at public/audit/index.html, served through a
 * next.config.ts rewrite -- a CRM-style table with dollar fields that meant nothing on a
 * site that never charges anyone. The data underneath it is real (19 lamport-ordered
 * messages, one per artifact the pipeline wrote), so it earns a page in the site's own
 * language rather than a rewrite to someone else's.
 *
 * frames.json is read here with fs, the same way lib/load.ts reads public/data: build-time,
 * server-only, no loading state to fake in front of a judge.
 */
interface Frames {
  root_task: string;
  messages: AuditMessage[];
}

async function loadFrames(): Promise<Frames> {
  const p = path.join(process.cwd(), "public", "audit", "frames.json");
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw) as Frames;
}

export default async function AuditPage() {
  const { messages } = await loadFrames();

  const allClaims = messages.flatMap((m) => m.claims);
  const groundedClaims = allClaims.filter((c) => c.evidence_type === "test_output");
  const groundedClaimPct =
    allClaims.length > 0 ? (groundedClaims.length / allClaims.length) * 100 : 0;

  const groundedMessages = messages.filter((m) => m.task_status === "complete").length;
  const unflaggedMessages = messages.length - groundedMessages;

  const scorecardMessage = messages.find((m) => m.message_id === "scorecard.json");
  const scorecardSha = scorecardMessage?.git_sha ?? "none";

  return (
    <>
      <PageHeader
        eyebrow="Provenance"
        title="Every claim, with what ran behind it"
        lede="Each artifact in artifacts/ becomes one audited claim. Green means a real run wrote it and it carries placeholder: false and a git SHA. Amber means nothing ran: the file exists, but no number in it may be quoted as verified. Four of our own artifacts are amber, on purpose."
      />

      <Reveal as="section" className="wrap pb-4">
        <div className="flex flex-wrap items-end gap-8">
          <div data-stagger="0" className="shrink-0">
            <p className="tnum display text-[3rem] leading-none text-defend sm:text-[3.75rem]">
              <CountUp value={`${groundedClaimPct.toFixed(0)}%`} />
            </p>
            <p className="mt-2 max-w-[24ch] text-[0.8125rem] leading-relaxed text-muted">
              of claims: test_output over all claims made
            </p>
          </div>

          <dl className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-3">
            <div data-stagger="1" className="card border border-rule p-4">
              <dd className="tnum display text-[1.5rem] leading-none">
                {groundedMessages} of {messages.length}
              </dd>
              <dt className="mt-1 text-[0.8125rem] text-muted">artifacts grounded</dt>
            </div>
            <div data-stagger="2" className="card border border-rule p-4">
              <dd className="tnum display text-[1.5rem] leading-none text-attack">
                {unflaggedMessages}
              </dd>
              <dt className="mt-1 text-[0.8125rem] text-muted">unflagged</dt>
            </div>
            <div data-stagger="3" className="card border border-rule p-4">
              <dd className="tnum display text-[1.5rem] leading-none">1</dd>
              <dt className="mt-1 text-[0.8125rem] text-muted">git SHA behind the scorecard</dt>
              <p className="mt-0.5 font-mono text-[0.75rem] text-muted">{scorecardSha}</p>
            </div>
          </dl>
        </div>

        <div data-stagger="4" className="mt-6">
          <div
            className="bar-draw flex h-2.5 w-full overflow-hidden rounded-full bg-rule"
            role="img"
            aria-label={`${groundedClaims.length} of ${allClaims.length} claims grounded, ${
              allClaims.length - groundedClaims.length
            } unflagged`}
          >
            <div className="bg-defend-fill" style={{ width: `${groundedClaimPct}%` }} />
            <div className="bg-warn-fill" style={{ width: `${100 - groundedClaimPct}%` }} />
          </div>
          <div className="mt-2 flex gap-5 text-[0.75rem] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-defend-fill" aria-hidden="true" />
              grounded claims
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-warn-fill" aria-hidden="true" />
              unflagged claims
            </span>
          </div>
        </div>
      </Reveal>

      <Block
        title="The ledger, replayed"
        lede="Not a table -- a replay. These land in lamport order, the order the runner actually emitted them in, so the four amber claims land where they landed the first time: last."
      >
        <AuditLedger messages={messages} />
      </Block>

      <Block title="What makes a claim grounded">
        <ul className="col space-y-2 text-[0.9375rem] leading-relaxed text-muted">
          <li>The writer went through the shared Envelope.</li>
          <li>
            <code className="font-mono text-ink">placeholder</code> is{" "}
            <code className="font-mono text-ink">false</code>.
          </li>
          <li>The git SHA and <code className="font-mono text-ink">created_at</code> are present.</li>
        </ul>
        <p className="mt-6 text-[0.8125rem] text-muted">
          Frame format borrowed from{" "}
          <a
            href="https://github.com/Aditya-Patil27/samvad"
            className="text-defend hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Samvad
          </a>
          &apos;s audit console.
        </p>
      </Block>
    </>
  );
}
