# Client entry point — same-package subpath export for browser-safe code

Merchant React/React Native apps cannot run the full SDK because it holds `clientSecret` and makes authenticated gateway calls. Rather than a separate `@mpaisa-js/client` package (which would duplicate types, split the changeset flow, and require separate publish), we add `src/browser.ts` as a subpath export: `import { parseRedirect } from "mpaisa-js/client"`.

The client entry point re-exports only secret-free functions: `parseRedirect` (pure URL parsing), `ResponseCode` constants and helpers, and a client-specific `redirectOutcome` that throws plain `Error` for unknown codes instead of `GatewayError` (which carries secret-redaction logic irrelevant in the browser). Digest verification and `confirmRedirect` stay server-only — they require `clientSecret`.

Considered: a separate npm package (`@mpaisa-js/client`). Rejected because the surface area is ~80 lines of re-exports, the types are shared, and the changeset/release overhead is disproportionate. The subpath export gives the same import ergonomics (`mpaisa-js/client`) with zero maintenance split.
