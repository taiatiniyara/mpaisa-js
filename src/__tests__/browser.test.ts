import { describe, expect, it } from "vitest";
import {
  parseRedirect,
  ResponseCode,
  responseCodeLabel,
  isTerminalCode,
  redirectOutcome,
} from "../browser.js";

function makeRedirect(rCode: string): string {
  const params = new URLSearchParams({
    rCode,
    tID: "order-9",
    rID: "rID-77",
    phone: "6790001234",
  });
  return `https://shop.test/callback?${params.toString()}`;
}

describe("parseRedirect()", () => {
  it("parses from a full URL", () => {
    const parsed = parseRedirect(makeRedirect("101"));
    expect(parsed).toEqual({
      rCode: 101,
      tID: "order-9",
      rID: "rID-77",
      phone: "6790001234",
      tokenv2: undefined,
    });
  });

  it("parses from URLSearchParams", () => {
    const params = new URLSearchParams({
      rCode: "101",
      tID: "order-9",
      rID: "rID-77",
    });
    const parsed = parseRedirect(params);
    expect(parsed.rCode).toBe(101);
    expect(parsed.tID).toBe("order-9");
  });

  it("treats missing phone and tokenv2 as undefined", () => {
    const parsed = parseRedirect(
      "https://shop.test/cb?rCode=100&tID=a&rID=b",
    );
    expect(parsed.phone).toBeUndefined();
    expect(parsed.tokenv2).toBeUndefined();
  });

  it("uppercases tokenv2", () => {
    const params = new URLSearchParams({
      rCode: "101",
      tID: "x",
      rID: "y",
      tokenv2: "abcdef123456",
    });
    const parsed = parseRedirect(params);
    expect(parsed.tokenv2).toBe("ABCDEF123456");
  });
});

describe("ResponseCode", () => {
  it("has correct numeric values", () => {
    expect(ResponseCode.PENDING).toBe(100);
    expect(ResponseCode.SUCCESS).toBe(101);
    expect(ResponseCode.FAILED).toBe(102);
    expect(ResponseCode.DECLINED_BY_CUSTOMER).toBe(103);
    expect(ResponseCode.CANCELLED).toBe(112);
    expect(ResponseCode.TOO_MANY_ATTEMPTS).toBe(155);
  });
});

describe("responseCodeLabel()", () => {
  it("returns labels for known codes", () => {
    expect(responseCodeLabel(100)).toBe("PENDING");
    expect(responseCodeLabel(101)).toBe("SUCCESS");
    expect(responseCodeLabel(112)).toBe("CANCELLED");
  });

  it("returns UNKNOWN for unknown codes", () => {
    expect(responseCodeLabel(999)).toBe("UNKNOWN");
  });
});

describe("isTerminalCode()", () => {
  it("PENDING is not terminal", () => {
    expect(isTerminalCode(100)).toBe(false);
  });

  it("all other known codes are terminal", () => {
    expect(isTerminalCode(101)).toBe(true);
    expect(isTerminalCode(102)).toBe(true);
    expect(isTerminalCode(112)).toBe(true);
    expect(isTerminalCode(155)).toBe(true);
  });
});

describe("client redirectOutcome()", () => {
  it("maps success codes to success", () => {
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

  it("omits phone when not provided", () => {
    const outcome = redirectOutcome(101, {
      tID: "order-9",
      rID: "rID-77",
    });
    expect(outcome).toEqual({
      status: "success",
      tID: "order-9",
      rID: "rID-77",
    });
    expect("phone" in outcome).toBe(false);
  });

  it("defaults tID/rID to empty strings when no parsed input", () => {
    const outcome = redirectOutcome(101);
    expect(outcome).toMatchObject({ tID: "", rID: "" });
  });

  it("throws plain Error for unknown response codes", () => {
    try {
      redirectOutcome(142);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Unknown response code 142");
    }
  });

  it("throws plain Error, not GatewayError", () => {
    try {
      redirectOutcome(999);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.constructor.name).toBe("Error");
    }
  });
});
