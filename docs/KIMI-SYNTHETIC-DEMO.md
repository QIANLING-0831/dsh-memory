# Kimi Memory Plus synthetic demo

> The records below are synthetic demonstration data. They are not benchmark
> results and were not captured from a real user's Kimi Code sessions.

Assume the workspace is `/demo/acme-shop` and two earlier sessions produced
these records:

| Layer | Synthetic record |
| --- | --- |
| core | `[convention] Use pnpm for dependency management.` |
| core | `[decision] Deploy the checkout service with a blue-green strategy.` |
| archive | `session_demo_1, seq 18: Payment retries use exponential backoff capped at 30 seconds.` |
| archive | `session_demo_2, seq 41, src/checkout.ts: Fixed idempotency-key reuse after HTTP 503.` |

A later Kimi session can make the following bounded recall call:

```json
{
  "workspace": "/demo/acme-shop",
  "query": "checkout 503 idempotency",
  "limit": 3,
  "max_chars": 500,
  "file": "src/checkout.ts"
}
```

Synthetic expected result shape:

```json
[
  {
    "type": "archive",
    "sessionId": "session_demo_2",
    "seq": 41,
    "kind": "tool.result",
    "file": "src/checkout.ts",
    "snippet": "Fixed idempotency-key reuse after HTTP 503."
  }
]
```

This demonstrates the intended interaction only: explicit workspace isolation,
model-invoked recall, file filtering, and a bounded result. Token savings and
retrieval quality still require a reproducible benchmark against real Kimi Code
workloads.
