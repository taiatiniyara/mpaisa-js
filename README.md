# mpaisa-js

[![CI](https://github.com/taiatiniyara/mpaisa-js/actions/workflows/ci.yml/badge.svg)](https://github.com/taiatiniyara/mpaisa-js/actions/workflows/ci.yml)

TypeScript SDK for the M-PAiSA Payments Gateway (Vodafone Fiji): initiate wallet payments via the Handshake, verify redirect authenticity with `tokenv2`, and confirm transaction status against the authoritative status API.

Docs & playground: **https://taiatiniyara.github.io/mpaisa-js**

## Install

```bash
npm install mpaisa-js
```

```bash
yarn add mpaisa-js
```

```bash
pnpm add mpaisa-js
```

Requires Node.js >= 20.

## Quickstart

The full payment flow is **Handshake → Redirect → Confirm**:

```typescript
import { Mpaisa } from "mpaisa-js";

const mpaisa = new Mpaisa({
  clientId: process.env.MPAISA_CLIENT_ID!,
  clientSecret: process.env.MPAISA_CLIENT_SECRET!,
  environment: "staging",
});
```

**1. Handshake** — exchange your bearer credentials for a Request ID (`rID`) and Auth Digest (`authdigestv2`). Amounts are decimal strings with exactly two places; they are used byte-for-byte in hash computation, so never pass numbers.

```typescript
const session = await mpaisa.handshake({
  merchantTid: "ORDER-123",
  amount: "10.50",
  itemDetail: "1x Flat White",
  returnUrl: "https://shop.example.com/mpaisa/callback",
});
```

Optionally verify the digest locally before sending the customer anywhere — this proves the gateway returned untampered session details:

```typescript
const digest = await session.verifyDigest();
if (!digest.ok) throw new Error(`Handshake digest mismatch for ${session.merchantTid}`);
```

**2. Redirect** the customer to the Payments Page — a gateway-hosted page where they enter wallet credentials and complete 2FA. Never embed or proxy it.

```typescript
redirect(session.checkoutUrl); // 302 the browser here
```

**3. Confirm** on the return URL. `confirmRedirect()` verifies the redirect's `tokenv2` hash and, on match, immediately calls the status API and returns the authoritative transaction record:

```typescript
// GET /mpaisa/callback?rCode=101&tID=ORDER-123&rID=...&phone=...&tokenv2=...
app.get("/mpaisa/callback", async (req, res) => {
  const record = await mpaisa.confirmRedirect(
    new URL(req.url, "https://shop.example.com").searchParams,
    { amount: "10.50", itemDetail: "1x Flat White" }, // exact bytes used in the handshake
  );
  if (record.status === "success") {
    await fulfillOrder(record.tID);
  }
  res.json(record);
});
```

A failed hash check throws `TokenMismatchError` — it does not return a result. Treat it as a security incident (see [ADR-0002](docs/adr)).

### Handling the PENDING limbo

If the customer's browser closed mid-redirect, no callback ever arrives. Poll the status API until a terminal response code or your deadline:

```typescript
const record = await mpaisa.poll(
  { rId: session.requestID, tId: "ORDER-123", cId: process.env.MPAISA_CLIENT_ID! },
  { timeoutMs: 120_000, intervalMs: 2_000 }, // exponential backoff, capped at 30s
);
// Throws PollTimeoutError if still PENDING after timeoutMs.
```

## The two-step fulfillment pattern

The SDK enforces two independent checks before you ship an order:

1. **Redirect verification (`tokenv2`)** — the gateway appends a SHA-256 hash to the success/cancel redirect URL. Recomputing it over `{ tID, amount, iDet, clientSecret, rCode }` proves the redirect was not forged or tampered with in transit.
2. **Status confirmation (`requeststatus`)** — only the status API is ground truth. A redirect alone can be replayed, stale, or truncated.

`confirmRedirect()` chains both in one call: verify the hash, then fetch the authoritative record. Never fulfill an order from the redirect query string alone.

## Environment configuration

```typescript
const mpaisa = new Mpaisa({
  clientId: "...",
  clientSecret: "...",

  // "staging" (default) or "live"
  environment: "staging",

  // Optional: override the base URL entirely (e.g. a proxy or captured fixtures).
  // Takes precedence over `environment`.
  baseUrl: "https://payments-staging.m-paisa.com",

  // Optional: per-request timeout in milliseconds.
  timeout: 15_000,

  // Optional: inject a custom fetch implementation (tests, proxies).
  fetch: myFetch,
});
```

## Token caching for serverless

The bearer token from `generateAuth` is cached in memory per client instance, which dies with every serverless invocation. Pass a `tokenCache` hook to persist it across invocations and avoid burning through the gateway's auth rate limits:

```typescript
import Redis from "ioredis";
import { Mpaisa } from "mpaisa-js";

const redis = new Redis(process.env.REDIS_URL!);

const mpaisa = new Mpaisa({
  clientId: process.env.MPAISA_CLIENT_ID!,
  clientSecret: process.env.MPAISA_CLIENT_SECRET!,
  tokenCache: {
    get: (key) => redis.get(key),
    set: (key, value, ttlMs) => redis.set(key, value, "PX", ttlMs),
  },
});
```

The cache key is prefixed with `mpaisa:token:<clientId>`, values are JSON `{ token, expiresAt }`, and the SDK refreshes tokens 60 seconds before expiry. Any async store works (Redis, KV, Durable Objects, DynamoDB).

## Response codes

All 16 gateway response codes (`rCode`), exported as the `ResponseCode` enum with helpers `responseCodeLabel()` and `isTerminalCode()`:

| Code | Label |
|------|-------|
| 100 | PENDING |
| 101 | SUCCESS |
| 102 | FAILED |
| 103 | DECLINED BY CUSTOMER |
| 104 | EXPIRED |
| 105 | SYSTEM ERROR |
| 106 | INSUFFICIENT BALANCE |
| 107 | DUPLICATE TRANSACTION |
| 108 | INVALID MERCHANT |
| 109 | INVALID AMOUNT |
| 110 | LIMIT EXCEEDED |
| 111 | TIMEOUT |
| 112 | CANCELLED |
| 113 | SUCCESS CONFIRMED |
| 114 | REVERSED |
| 155 | TOO MANY ATTEMPTS |

Only `100` is non-terminal — `poll()` keeps going until anything else arrives.

## Errors

All errors extend `MpaisaError` and redact registered secrets (client secret, bearer tokens) from messages and details:

| Error | When |
|-------|------|
| `ValidationError` | Bad input before any network call (e.g. malformed amount) |
| `NetworkError` | Fetch failed / timed out after retries |
| `GatewayError` | Gateway returned an unusable or error response |
| `RateLimitError` | HTTP 429 from the gateway |
| `TokenMismatchError` | `tokenv2` hash mismatch — security incident |
| `PollTimeoutError` | Still PENDING when the poll deadline passed |
| `ResponseCodeError` | Response code outside the known table |

## Links

- Landing page: <https://taiatiniyara.github.io/mpaisa-js>
- Repository: <https://github.com/taiatiniyara/mpaisa-js>
- Issue tracker: <https://github.com/taiatiniyara/mpaisa-js/issues>
- Changelog: [GitHub Releases](https://github.com/taiatiniyara/mpaisa-js/releases)

## Contributing

PRs should declare release intent with a changeset (`npx changeset`), choosing patch for bugfixes, minor for features, major for breaking changes. Releases are automated via [changesets](.changeset/config.json) with npm provenance.

## License

Apache-2.0
