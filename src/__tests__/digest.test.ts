import { describe, expect, it } from "vitest";
import { computeAuthDigest, constantTimeEqual } from "../digest.js";

// Well-known SHA-256 constants used in comparison tests below.
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const FIXTURE = {
  merchantTid: "capture123",
  amount: "10.50",
  itemDetail: "Test item",
  clientSecret: "mysecret",
  responseCode: "100",
};
// Precomputed externally: sha256("capture123" + "10.50" + "Test item" + "mysecret" + "100")
const FIXTURE_DIGEST = "F79B0096E13C9CDB802E1966B16E81B5BF6C8300C3B6E9C3535CE1E4CA4E813F";

describe("computeAuthDigest", () => {
  it("reproduces the §4.3.1 concatenation byte-for-byte", async () => {
    const digest = await computeAuthDigest(FIXTURE);
    expect(digest).toBe(FIXTURE_DIGEST);
  });

  it("returns uppercase hex", async () => {
    const digest = await computeAuthDigest(FIXTURE);
    expect(digest).toBe(digest.toUpperCase());
    expect(digest).toMatch(/^[0-9A-F]{64}$/);
  });

  it("changes when any component changes", async () => {
    const base = await computeAuthDigest(FIXTURE);
    expect(await computeAuthDigest({ ...FIXTURE, amount: "10.51" })).not.toBe(base);
    expect(
      await computeAuthDigest({ ...FIXTURE, merchantTid: "capture124" }),
    ).not.toBe(base);
    expect(
      await computeAuthDigest({ ...FIXTURE, itemDetail: "test item" }),
    ).not.toBe(base);
    expect(
      await computeAuthDigest({ ...FIXTURE, clientSecret: "othersecret" }),
    ).not.toBe(base);
    expect(await computeAuthDigest({ ...FIXTURE, responseCode: "101" })).not.toBe(
      base,
    );
  });

  it("uses the raw amount bytes with no normalization", async () => {
    // "10.50" vs "010.50" must produce different digests: no numeric coercion.
    const a = await computeAuthDigest({ ...FIXTURE, amount: "10.50" });
    const b = await computeAuthDigest({ ...FIXTURE, amount: "010.50" });
    expect(a).not.toBe(b);
  });
});

describe("constantTimeEqual", () => {
  it("accepts equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual(SHA256_EMPTY, SHA256_EMPTY)).toBe(true);
  });

  it("rejects unequal strings of equal length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual(SHA256_EMPTY, SHA256_ABC)).toBe(false);
  });

  it("throws when lengths differ", () => {
    expect(() => constantTimeEqual("abc", "ab")).toThrow();
    expect(() => constantTimeEqual("", "a")).toThrow();
  });

  it("is case-sensitive", () => {
    expect(constantTimeEqual("ABC", "abc")).toBe(false);
  });
});
