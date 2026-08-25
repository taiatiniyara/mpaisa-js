# Pure core SDK — no framework adapters in v1

mpaisa-js v1 is a pure core SDK: the four gateway endpoints, digest/tokenv2 verification, and checkout URL building. No framework adapters (Express/Hono/Next route handlers) and no framework opinions. The integration surface is small enough that a redirect callback handler is ~10 lines of merchant code; adapters would be boilerplate with real maintenance cost. Adapter packages (`@mpaisa-js/*`) remain an option later without breaking the core.
