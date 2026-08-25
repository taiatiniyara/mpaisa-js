import { describe, expect, it } from "vitest";
import { parseRedirect, verifyTokenV2, redirectOutcome } from "../redirect.js";
import { computeAuthDigest } from "../digest.js";
import { GatewayError } from "../errors.js";

const SECRET = "redirect-test-client-secret";

// Synthetic fixtures in the parameter shape the capture harness documents
// (rCode, tID, rID, tokenv2, phone). Ground-truth staging fixtures land
// with #8; these pin behavior until then.
function makeRedirect(rCode: string): string {
  const params = new URLSearchParams({
    rCode,
    tID: "order-9",
    rID: "rID-77",
    phone: "6790001234",
  });
  return `https://shop.test/callback?${params.toString()}`;
}

async function validTokenv2(rCode: string): Promise<string> {
  return computeAuthDigest({
    merchantTid: "order-9",
    amount: "5.00",
    itemDetail: "Widget",
    clientSecret: SECRET,
    responseCode: rCode,
  });
}

describe("parseRedirect()", () => {
  it("parses from a full URL", async () => {
    const token = await validTokenv2("101");
    const parsed = parseRedirect(`${makeRedirect("101")}&tokenv2=${token}`);
    expect(parsed).toEqual({
      rCode: 101,
      tID: "order-9",
      rID: "rID-77",
      phone: "6790001234",
      tokenv2: token.toUpperCase(),
    });
  });

  it("parses from URLSearchParams", async () => {
    const token = await validTokenv2("101");
    const params = new URLSearchParams({
      rCode: "101",
      tID: "order-9",
      rID: "rID-77",
      phone: "6790001234",
      tokenv2: token,
    });
    const parsed = parseRedirect(params);
    expect(parsed.rCode).toBe(101);
    expect(parsed.tokenv2).toBe(token.toUpperCase());
  });

  it("treats missing phone and tokenv2 as undefined", () => {
    const parsed = parseRedirect(
      "https://shop.test/cb?rCode=100&tID=a&rID=b",
    );
    expect(parsed.phone).toBeUndefined();
    expect(parsed.tokenv2).toBeUndefined();
  });
});

describe("verifyTokenV2()", () => {
  it("returns ok:true for an untampered redirect", async () => {
    const token = await validTokenv2("101");
    const result = await verifyTokenV2({
      merchantTid: "order-9",
      amount: "5.00",
      itemDetail: "Widget",
      clientSecret: SECRET,
      responseCode: "101",
      tokenv2: token.toLowerCase(),
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok:false for a tampered tokenv2", async () => {
    const token = await validTokenv2("101");
    const tampered = (token.slice(0, -1) === "0" ? "1" : "0") + token.slice(1);
    const result = await verifyTokenV2({
      merchantTid: "order-9",
      amount: "5.00",
      itemDetail: "Widget",
      clientSecret: SECRET,
      responseCode: "101",
      tokenv2: tampered,
    });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when the amount was altered after the fact", async () => {
    const token = await validTokenv2("101");
    const result = await verifyTokenV2({
      merchantTid: "order-9",
      amount: "6.00",
      itemDetail: "Widget",
      clientSecret: SECRET,
      responseCode: "101",
      tokenv2: token,
    });
    expect(result.ok).toBe(false);
  });
});

describe("redirectOutcome()", () => {
  it("maps success codes 101/113 to success", () => {
    expect(redirectOutcome(101)).toMatchObject({ status: "success" });
    expect(redirectOutcome(113)).toMatchObject({ status: "success" });
  });

  it("maps 112 to cancelled and 100 to pending", () => {
    expect(redirectOutcome(112)).toMatchObject({ status: "cancelled" });
    expect(redirectOutcome(100)).toMatchObject({ status: "pending" });
  });

  it("carries tID/rID/phone on success", () => {
    const outcome = redirectOutcome(101, {
      tID: "order-9",
      rID: "rID-77",
      phone: "6790001234",
    });
    expect(outcome).toEqual({
      status: "success",
      tID: "order-9",
      rID: "rID-77",
      phone: "6790001234",
    });
  });

  it("throws GatewayError for unknown response codes", () => {
    try {
      redirectOutcome(142);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect((err as GatewayError).rCode).toBe(142);
    }
  });
});
