"""Export the agent runtime's constants so the web route runs the same rules, not similar ones.

The /agent live demo needs a server (it holds the model key), and that server is Node. The
agent loop, the three defense layers and the exploit oracle therefore have to exist in
TypeScript as well as Python -- which is exactly the situation that produces a demo that
looks like the system and quietly is not.

So nothing gets retyped. Every constant the TypeScript needs is emitted here, from the
Python objects themselves: the system prompt, the tool schemas, the classifier's regex
*sources* and weights, the scope table, the HITL thresholds, the opening ledger, and the
scenario/injection corpus. The port then contains only control flow, and
scripts/check_agent_conformance.py proves that control flow agrees with Python's on every
injection in the corpus.

    python scripts/export_agent_runtime.py

Writes artifacts/agent_runtime.json.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone

from adversarial_payments.agentic import agent as A
from adversarial_payments.agentic import defenses as D
from adversarial_payments.agentic import injections as I
from adversarial_payments.agentic import tools as T
from adversarial_payments.artifacts import Envelope
from adversarial_payments.config import ARTIFACTS

# JavaScript RegExp has no re.M/re.I flag object, so the flags travel beside the source
# and the port reconstructs the same pattern rather than guessing at it.
FLAGMAP = {"i": 2, "m": 8}  # re.IGNORECASE, re.MULTILINE


def flags_of(pattern) -> str:
    out = ""
    if pattern.flags & 2:
        out += "i"
    if pattern.flags & 8:
        out += "m"
    return out


def rx(pattern) -> dict:
    return {"source": pattern.pattern, "flags": flags_of(pattern)}


def _sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def main() -> int:
    state = T.fresh_state()

    payload = {
        "agent": {
            "system_prompt": A.SYSTEM_PROMPT,
            "channels": list(A.CHANNELS),
            "customer": T.CUSTOMER,
            "owned_account": T.OWNED_ACCOUNT,
            "tool_specs": T.tool_specs(),
        },
        "classifier": {
            "threshold": 0.50,
            # (name, regex, weight) exactly as defenses.FEATURES declares them.
            "features": [
                {"name": name, "pattern": rx(pat), "weight": weight}
                for name, pat, weight in D.FEATURES
            ],
            # The two rules that are not plain feature hits: an imperative aimed at
            # payment data, and text that changed under normalisation at all.
            "imperative": rx(D._IMPERATIVE),
            "iban": rx(D._IBAN),
            "secretish": rx(D._SECRETISH),
            "imperative_weight": 0.26,
            "obfuscation_weight": 0.20,
            "zero_width": D_ZW_SOURCE,
            "b64": B64_SOURCE,
        },
        "scope": {k: sorted(v) for k, v in D.SCOPES.items()},
        "hitl": {"amount_threshold": 500.0},
        "ledger": {
            "accounts": {
                a.id: {"id": a.id, "owner": a.owner, "balance": a.balance, "currency": a.currency}
                for a in state.accounts.values()
            },
            "payees": {
                p.id: {"id": p.id, "name": p.name, "iban": p.iban, "verified": p.verified}
                for p in state.payees.values()
            },
        },
        "scenarios": [
            {
                "id": s.id,
                "task_type": s.task_type,
                "channel": s.channel,
                "user_request": s.user_request,
                "intent": s.intent,
                "document": s.document,
            }
            for s in I.SCENARIOS
        ],
        "injections": [
            {
                "id": j.id,
                "category": j.category,
                "category_title": I.CATEGORY_TITLES.get(j.category, j.category),
                "owasp_id": j.owasp_id,
                "atlas_technique": j.atlas_technique,
                "channel": j.channel,
                "goal": j.goal,
                "payload": j.payload,
            }
            for j in I.INJECTIONS
        ],
    }

    dest = ARTIFACTS / "agent_runtime.json"
    envelope = Envelope(kind="agent_runtime", placeholder=False, payload=payload)
    envelope.created_at = datetime.now(timezone.utc).isoformat()
    envelope.git_sha = _sha()
    dest.write_text(json.dumps(asdict(envelope), indent=2) + "\n", encoding="utf-8")

    print(f"wrote {dest}")
    print(f"  {len(payload['scenarios'])} scenarios · {len(payload['injections'])} injections")
    print(f"  {len(payload['classifier']['features'])} classifier features")
    print(f"  scope table: {', '.join(payload['scope'])}")
    return 0


# The two obfuscation patterns live in client.py as module-private compiled regexes; their
# sources are lifted rather than re-declared so a change there reaches the port.
D_ZW_SOURCE = None
B64_SOURCE = None

if True:  # populated before main() runs
    from adversarial_payments.agentic import client as C

    D_ZW_SOURCE = {"source": C._ZERO_WIDTH.pattern, "flags": ""}
    B64_SOURCE = {"source": C._B64.pattern, "flags": ""}


if __name__ == "__main__":
    raise SystemExit(main())
