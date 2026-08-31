import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { exploited, runAgent, spliced, type ChatFn } from "@/lib/agent/run";
import type { AgentRuntime, DefenseConfig, Injection, Scenario } from "@/lib/agent/types";

/**
 * Run one live prompt-injection trial against a real model.
 *
 * This is the only part of the site that needs a server, and it needs one for exactly one
 * reason: the provider key must not reach the browser. Everything else -- the defense
 * stack, the tool execution, the exploit oracle -- is deterministic and runs here too,
 * using the port in lib/agent that scripts/check_agent_conformance.py proves agrees with
 * the Python control on every span of the corpus.
 *
 * The ledger is per-request and in-memory. Nothing here touches a real payment rail, and
 * the "accounts" are the fixture ledger every Python trial starts from.
 */

export const runtime = "nodejs";
// The model call is the whole point; there is nothing to cache and a cached answer would
// misrepresent a live demo.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cached: AgentRuntime | null = null;

async function loadRuntime(): Promise<AgentRuntime> {
  if (cached) return cached;
  const raw = await readFile(
    join(process.cwd(), "public", "data", "agent_runtime.json"),
    "utf8",
  );
  cached = JSON.parse(raw).payload as AgentRuntime;
  return cached;
}

/**
 * Groq, because that is the provider the committed redteam-groq.json was measured on --
 * a live demo answering from a different model than the reported table would be its own
 * small dishonesty.
 */
const BASE_URL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";

function chatWith(apiKey: string): ChatFn {
  return async (messages, tools) => {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, messages, tools, temperature: 0 }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`provider ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0]?.message ?? {};
    const toolCalls = (choice.tool_calls ?? []).map(
      (c: { function?: { name?: string; arguments?: string } }) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function?.arguments || "{}");
        } catch {
          // A model that emits unparseable arguments has still proposed the call, and the
          // defense layers must get to see it. Dropping it here would silently improve
          // the defended numbers.
          args = {};
        }
        return { name: c.function?.name ?? "", arguments: args };
      },
    );
    return { content: String(choice.content ?? ""), toolCalls };
  };
}

/**
 * Round-robin over a pooled credential, mirroring client.Provider.next_key.
 *
 * Free tiers cap per key rather than per account, so GROQ_API_KEY may hold several keys
 * separated by commas or whitespace -- which is exactly what the corpus runs use. Sending
 * the whole string as one bearer token is a 401, and rotating beats draining one key until
 * it 429s.
 */
let cursor = 0;
function nextKey(): string | null {
  const raw = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || "";
  const keys = raw.split(/[,\s]+/).filter(Boolean);
  if (keys.length === 0) return null;
  cursor = (cursor + 1) % keys.length;
  return keys[cursor];
}

export async function POST(request: Request) {
  const apiKey = nextKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No provider key configured. Set GROQ_API_KEY in the deployment environment; " +
          "the committed results on this page were measured with one.",
      },
      { status: 503 },
    );
  }

  let body: { scenarioId?: string; injectionId?: string; defenses?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const rt = await loadRuntime();
  const scenario: Scenario | undefined = rt.scenarios.find((s) => s.id === body.scenarioId);
  const injection: Injection | undefined = rt.injections.find((i) => i.id === body.injectionId);

  if (!scenario || !injection) {
    return NextResponse.json({ error: "unknown scenarioId or injectionId" }, { status: 400 });
  }
  if (scenario.channel !== injection.channel) {
    return NextResponse.json(
      { error: `injection targets ${injection.channel}, scenario reads ${scenario.channel}` },
      { status: 400 },
    );
  }

  const config: DefenseConfig = body.defenses
    ? { classifier: true, tool_scope: true, hitl: true }
    : { classifier: false, tool_scope: false, hitl: false };

  const document = spliced(scenario, injection);
  const started = Date.now();

  try {
    const run = await runAgent(rt, scenario, document, config, chatWith(apiKey));
    const wasExploited = exploited(injection.goal, run, scenario, rt);

    return NextResponse.json({
      model: MODEL,
      defenses: body.defenses ? "on" : "off",
      exploited: wasExploited,
      goal: injection.goal,
      owasp_id: injection.owasp_id,
      category: injection.category_title,
      content: run.content,
      proposed: run.proposed,
      calls: run.calls,
      events: run.events,
      documentRedacted: run.documentRedacted,
      cleanDocument: run.cleanDocument,
      document,
      defenseMs: run.defenseMs,
      totalMs: Date.now() - started,
      payeesBefore: run.before.payees,
      payeesAfter: run.after.payees,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
