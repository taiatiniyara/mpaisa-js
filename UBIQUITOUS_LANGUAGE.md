# Ubiquitous Language

## Actors

| Term             | Definition                                                                                     | Aliases to avoid            |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| **Integrator**   | A developer who builds against mpaisa-js on behalf of a business merchant                      | Client, client dev, partner |
| **Merchant**     | The business that owns the M-PAiSA wallet account and receives the funds                       | Business merchant, vendor   |
| **Customer**     | The person who pays via the M-PAiSA wallet on the Payments Page                                | Payer, user, end-user       |

## Credentials

| Term                    | Definition                                                                                  | Aliases to avoid                     |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Client ID (`clientId`)** | The Vodafone-issued credential identifying the Merchant; doubles as the business ref (`cID`) | Business ID, app ID                  |
| **Client Secret (`clientSecret`)** | The Vodafone-issued secret used by the server-side SDK for authenticated gateway calls | API key, password                    |

## Artifacts

| Term                 | Definition                                                                                    | Aliases to avoid           |
| -------------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| **Server SDK**       | The full `mpaisa-js` entry point; holds secrets and makes gateway calls; server-only          | Main SDK, core SDK         |
| **Client Package**   | The browser-safe subset at `"mpaisa-js/client"`; pure functions, no secrets                   | Client SDK, frontend SDK   |

> Note: "Client" survives only inside fixed gateway/package names above (**Client ID**, **Client Package**). It never refers to a person — that is always the **Integrator**.

## Transaction lifecycle

| Term                          | Definition                                                                                        | Aliases to avoid              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Handshake**                 | First gateway call exchanging credentials for a Request ID + Auth Digest, opening the session      | Session init, auth call       |
| **Request ID (`rID`)**        | Gateway-assigned identifier for one transaction session                                           | Transaction ID                |
| **Merchant TID (`tID`)**      | Merchant-chosen transaction identifier echoed back by the gateway                                 | Transaction ID (ambiguous)    |
| **Auth Digest (`authdigestv2`)** | SHA-256 hash from the Handshake, recomputed locally before redirecting the Customer            | Auth token, signature         |
| **Redirect Token (`tokenv2`)**| SHA-256 hash the gateway appends to success/cancel redirect URLs                                  | Callback token                |
| **Amount**                    | Decimal string with exactly two places, byte-for-byte in digest computation                       | Number, float                 |
| **Response Code (`rCode`)**   | Gateway's numeric status for a transaction attempt (100–155)                                      | Status code, error code       |
| **Session**                   | SDK object from Handshake until redirect outcome                                                  | Token, context                |
| **Confirmation**              | Redirect Token verification followed by authoritative status-API check, before fulfilment         | Trusting the redirect alone   |
| **Payments Page**             | Gateway-hosted page where the Customer completes payment; redirect-only, never embedded           | Checkout iframe, proxy        |

## Relationships

- An **Integrator** builds on behalf of exactly one **Merchant**.
- A **Merchant** holds one **Client ID** / **Client Secret** pair issued by Vodafone.
- One **Handshake** opens one **Session**, carrying one **Request ID**.
- A **Session** ends in a redirect outcome; **Confirmation** requires both Redirect Token match and status-API ground truth.
- The **Integrator's** frontend may use only the **Client Package**; digest verification stays in the **Server SDK**.

## Example dialogue

> **Dev:** "Where does the Client ID go — frontend or backend?"
> **Domain expert:** "The **Client ID** identifies the **Merchant**, so it appears in the **Handshake**, which only the **Server SDK** performs. The **Client Package** in the browser never touches it."
> **Dev:** "So our React app — we're the Client there?"
> **Domain expert:** "You're the **Integrator**. 'Client' only ever refers to the **Client Package** or the **Client ID** credential — never a person."
> **Dev:** "And after the Customer pays, can we ship the order straight from the success redirect?"
> **Domain expert:** "No. **Confirmation** means recomputing the **Redirect Token** *and* checking the status API. Only the status API is ground truth."

## Flagged ambiguities

- **"client" was overloaded three ways**: (1) the developer integrating, (2) `clientId`, (3) `mpaisa-js/client`. Resolution: people are **Integrators**; "client" persists only inside the fixed names **Client ID** and **Client Package**, which are Vodafone/ADR 0005 terms not safe to rename.
- **"transaction ID"** could mean Request ID or Merchant TID — always say which.
- **"business merchant"** is redundant; the canonical term is **Merchant**.
