# mpaisa-js

TypeScript SDK for the M-PAiSA Payments Gateway (Vodafone Fiji).

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

## Quick Start

```typescript
import { Mpaisa } from "mpaisa-js";

const client = new Mpaisa({
  clientId: process.env.MPAISA_CLIENT_ID!,
  clientSecret: process.env.MPAISA_CLIENT_SECRET!,
  environment: "staging",
});

// 1. Handshake
const session = await client.handshake({
  merchantTid: "ORDER-123",
  amount: "10.50",
  itemDetail: "Coffee",
  returnUrl: "https://example.com/callback",
});

// 2. Redirect customer to session.checkoutUrl

// 3. Verify redirect callback + confirm
const result = await client.confirmRedirect(queryParams);
```

## Response Codes

| Code | Label |
|------|-------|
| 100 | PENDING |
| 101 | SUCCESS |
| 112 | CANCELLED |
| 113 | SUCCESS |
| 150 | INVALID_REQUEST |
| 151 | INVALID_MERCHANT |
| 152 | INVALID_CREDENTIALS |
| 153 | INVALID_AMOUNT |
| 154 | DUPLICATE_TID |
| 155 | TOO_MANY_ATTEMPTS |

## License

Apache-2.0
