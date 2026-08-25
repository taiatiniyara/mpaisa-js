import { describe, expect, it, vi } from "vitest";
import { Mpaisa } from "../client.js";
import { Session } from "../session.js";
import { ValidationError } from "../errors.js";
import { computeAuthDigest } from "../digest.js";

const CLIENT_ID = "cid-123";
const CLIENT_SECRET = "handshake-test-client-secret";

const HANDSHAKE_BODY = {
  requestID: "rID-abc",
  authdigestv2: "digest-from-gateway",
  response: 100,
  paymentspage: "https://gw.test/live/",
};

function makeFetch(handshakeBody: unknown = HANDSHAKE_BODY) {
  return vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("generateAuth")) {
      return Promise.resolve(
        Response.json({
          success: true,
          token: "tok-1",
          expiresAt: Date.now() + 600_000,
        }),
      );
    }
    if (u.includes("/live/API/?") || u.includes("/live/API?")) {
      return Promise.resolve(Response.json(handshakeBody));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as unknown as ReturnType<typeof vi.fn> & typeof fetch;
}

function makeClient(fetchMock: typeof fetch): Mpaisa {
  return new Mpaisa({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    baseUrl: "https://gw.test",
    fetch: fetchMock,
  });
}

const VALID_INPUT = {
  merchantTid: "order-1",
  amount: "10.50",
  itemDetail: "Test item",
  returnUrl: "https://shop.test/callback",
};

describe("Mpaisa.handshake()", () => {
  it("calls the handshake endpoint with a bearer token and query params", async () => {
    const fetchMock = makeFetch();
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await client.handshake(VALID_INPUT);
    const calls = fetchMock.mock.calls.map(
      (c) => [String(c[0]), c[1]] as [string, RequestInit],
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("/live/API/generateAuth");
    expect(calls[1][0]).toContain("/live/API/?");
    const hsUrl = new URL(calls[1][0]);
    expect(hsUrl.searchParams.get("tID")).toBe("order-1");
    expect(hsUrl.searchParams.get("amt")).toBe("10.50");
    expect(hsUrl.searchParams.get("cID")).toBe(CLIENT_ID);
    expect(hsUrl.searchParams.get("iDet")).toBe("Test item");
    expect(hsUrl.searchParams.get("url")).toBe("https://shop.test/callback");
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-1",
    );
  });

  it("returns a Session carrying the gateway response", async () => {
    const digest = await computeAuthDigest({
      merchantTid: "order-1",
      amount: "10.50",
      itemDetail: "Test item",
      clientSecret: CLIENT_SECRET,
      responseCode: "100",
    });
    const client = makeClient(
      makeFetch({ ...HANDSHAKE_BODY, authdigestv2: digest.toLowerCase() }) as unknown as typeof fetch,
    );
    const session = await client.handshake(VALID_INPUT);
    expect(session).toBeInstanceOf(Session);
    expect(session.requestID).toBe("rID-abc");
    expect(session.amount).toBe("10.50");
    expect(session.merchantTid).toBe("order-1");
    expect(session.authDigestV2.toUpperCase()).toBe(digest);
    expect(await session.verifyDigest()).toEqual({ ok: true });
  });

  it("verifyDigest() returns { ok: false, expected, received } on mismatch", async () => {
    const client = makeClient(makeFetch() as unknown as typeof fetch);
    const session = await client.handshake(VALID_INPUT);
    const result = await session.verifyDigest();
    if (result.ok) {
      expect.unreachable("expected digest mismatch with fixture digest");
    }
    expect(result.ok).toBe(false);
    expect(result.received).toBe(HANDSHAKE_BODY.authdigestv2.toUpperCase());
    expect(result.expected).toMatch(/^[0-9A-F]{64}$/);
  });

  it("exposes checkoutUrl with all query params", async () => {
    const client = makeClient(makeFetch() as unknown as typeof fetch);
    const session = await client.handshake(VALID_INPUT);
    const url = new URL(session.checkoutUrl);
    expect(url.origin + url.pathname).toBe("https://gw.test/live/");
    expect(url.searchParams.get("rID")).toBe("rID-abc");
    expect(url.searchParams.get("tID")).toBe("order-1");
    expect(url.searchParams.get("amt")).toBe("10.50");
    expect(url.searchParams.get("cID")).toBe(CLIENT_ID);
    expect(url.searchParams.get("iDet")).toBe("Test item");
    expect(url.searchParams.get("url")).toBe("https://shop.test/callback");
  });

  it("throws ValidationError for bad amount before any network call", async () => {
    const fetchMock = makeFetch();
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(
      client.handshake({ ...VALID_INPUT, amount: "10.5.1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client.handshake({ ...VALID_INPUT, amount: "10.501" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws ValidationError for over-length iDet and tID before any network call", async () => {
    const fetchMock = makeFetch();
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(
      client.handshake({ ...VALID_INPUT, itemDetail: "x".repeat(201) }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client.handshake({ ...VALID_INPUT, merchantTid: "y".repeat(201) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts boundary-valid inputs", async () => {
    const fetchMock = makeFetch();
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await client.handshake({
      merchantTid: "z".repeat(200),
      amount: "123456789.89",
      itemDetail: "w".repeat(200),
      returnUrl: "https://shop.test/callback",
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
