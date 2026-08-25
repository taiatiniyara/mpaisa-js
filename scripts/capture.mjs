#!/usr/bin/env node
// Capture harness: runs generateAuth + handshake against M-PAiSA staging,
// prints the checkout URL to open in a browser, and pre-computes both
// candidate authdigestv2 formulas for empirical comparison.
// Usage: node scripts/capture.mjs [tid] [amt] [idet]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "https://payments-staging.m-paisa.com";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    console.error("Missing .env — copy .env.example and fill in your staging credentials.");
    process.exit(1);
  }
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

loadEnv();

const clientId = process.env.MPAISA_CLIENT_ID;
const clientSecret = process.env.MPAISA_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("MPAISA_CLIENT_ID / MPAISA_CLIENT_SECRET not set in .env");
  process.exit(1);
}

const merchantTid = process.argv[2] ?? `capture${Date.now()}`;
const amt = process.argv[3] ?? "0.01";
const iDet = process.argv[4] ?? "callback capture";
const returnUrl = process.env.CAPTURE_RETURN_URL ?? "https://example.com/callback";

console.log(`tID:     ${merchantTid}`);
console.log(`amount:  ${amt}`);
console.log(`iDet:    ${iDet}\n`);

// 1. generateAuth
const authRes = await fetch(`${BASE}/live/API/generateAuth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ clientId, clientSecret }),
});
if (!authRes.ok) {
  console.error(`generateAuth failed: HTTP ${authRes.status}`);
  console.error(await authRes.text());
  process.exit(1);
}
const auth = await authRes.json();
if (!auth.success || !auth.token) {
  console.error("generateAuth returned no token:", JSON.stringify(auth, null, 2));
  process.exit(1);
}
console.log("auth:    OK (token expires at", new Date(auth.expiresAt).toISOString(), ")\n");

// 2. handshake
const qs = new URLSearchParams({ url: returnUrl, tID: merchantTid, amt, cID: clientId, iDet });
const hsRes = await fetch(`${BASE}/live/API/?${qs}`, {
  headers: { Authorization: `Bearer ${auth.token}` },
});
const raw = await hsRes.text();
let hs;
try {
  hs = JSON.parse(raw);
} catch {
  console.error(`handshake returned non-JSON (HTTP ${hsRes.status}):\n${raw}`);
  process.exit(1);
}
console.log("handshake response:");
console.log(JSON.stringify(hs, null, 2));

if (hs.requestID == null) {
  console.error("\nNo requestID — cannot build checkout URL. See response above.");
  process.exit(1);
}

// 3. candidate digests (ADR-0003 empirical check)
const rCode = String(hs.response ?? "");
if (hs.authdigestv2) {
  const f1 = sha256(`${merchantTid}${amt}${iDet}${clientSecret}${rCode}`);
  const f2 = sha256(`${merchantTid}${amt}${iDet}${hs.requestID}${clientSecret}${rCode}`);
  const up = (s) => s.toUpperCase();
  console.log("\n--- digest comparison ---");
  console.log(`gateway authdigestv2: ${up(hs.authdigestv2)}`);
  console.log(`formula §4.3.1:       ${up(f1)}  ${up(f1) === up(hs.authdigestv2) ? "<== MATCH" : ""}`);
  console.log(`formula §4.3.3 (+rID):${up(f2)}  ${up(f2) === up(hs.authdigestv2) ? "<== MATCH" : ""}`);
}

// 4. checkout URL — open in browser, pay/cancel, then copy the final redirect URL
const page = new URL(hs.paymentspage ?? `${BASE}/live/`);
for (const [k, v] of qs) page.searchParams.set(k, v);
page.searchParams.set("rID", hs.requestID);
console.log(`\n=== CHECKOUT URL ===\n${page}\n`);
console.log("Open it, complete (or cancel) the payment, then paste the FULL");
console.log("redirect-back URL from the address bar into the conversation.");
