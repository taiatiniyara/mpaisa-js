# mpaisa-js

TypeScript SDK for the M-PAiSA Payments Gateway (Vodafone Fiji): initiate wallet payments, verify redirect authenticity, and confirm transaction status.

## Language

Full glossary: [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md).

**Integrator**:
A developer who builds against mpaisa-js on behalf of a business merchant. "Client" never refers to a person. _Avoid_: client, client dev, partner

**Merchant**:
The business that owns the M-PAiSA wallet account and receives the funds. _Avoid_: business merchant, vendor

**Customer**:
The person who pays via the M-PAiSA wallet on the Payments Page. _Avoid_: payer, user, end-user

**Handshake**:
The first gateway call that exchanges a bearer token for a Request ID and Auth Digest, establishing the transaction session. _Avoid_: session init, auth call

**Request ID (`rID`)**:
The gateway-assigned identifier for one transaction session, returned by the Handshake and attached to every subsequent call and redirect.

**Merchant TID (`tID`)**:
The merchant's own transaction identifier, chosen by the merchant and echoed back by the gateway. Distinct from the Request ID. _Avoid_: transaction ID (ambiguous with gateway transaction id)

**Auth Digest (`authdigestv2`)**:
A SHA-256 hash returned by the Handshake that the merchant recomputes locally to prove the session details were not tampered with before redirecting the customer. _Avoid_: auth token, signature

**Redirect Token (`tokenv2`)**:
A SHA-256 hash appended by the gateway to the success/cancel redirect URL; merchants must recompute and compare it before fulfilling any order. _Avoid_: callback token

**Amount**:
The transaction amount as a decimal string with exactly two places (e.g. `"10.50"`), used byte-for-byte in digest computation and redirect verification. _Avoid_: passing numbers; floats

**Response Code (`rCode`)**:
The gateway's numeric status for a transaction attempt (100 PENDING through 155 too-many-attempts).

**Client ID (`clientId`)**:
The Vodafone-issued credential that serves double duty: identity in `generateAuth` authentication and business-account reference (`cID`) on transaction calls. One value, two roles. _Avoid_: conflating with a separate business ID

**Client Secret (`clientSecret`)**:
The Vodafone-issued secret used by the server-side SDK for authenticated gateway calls; never present in the Client Package or any browser context. _Avoid_: API key, password

**Session**:
The SDK object returned by the Handshake, carrying the Request ID, exact Amount bytes, checkout URL, and digest verification behavior. Lives from Handshake until redirect outcome. _Avoid_: token, context

**Confirmation**:
Verifying the Redirect Token and then fetching authoritative status via the status API before fulfilling an order. The redirect proves integrity; only the status API is ground truth. _Avoid_: trusting the redirect alone

**Payments Page**:
The gateway-hosted web page where the customer enters M-PAiSA wallet credentials and completes 2FA. The merchant redirects the customer there; it is never embedded or proxied.

**Client Package**:
The browser-safe subset of mpaisa-js, imported from `"mpaisa-js/client"`. Exports `parseRedirect`, `ResponseCode` constants, and a lightweight `redirectOutcome` — all pure functions with no secrets. Runs in React, React Native, or any browser context. The Integrator's frontend uses it for preliminary redirect interpretation; authoritative Confirmation remains server-side. "Client" survives only in this fixed name and **Client ID** — never for a person (that is the Integrator). _Avoid_: client SDK, frontend SDK
