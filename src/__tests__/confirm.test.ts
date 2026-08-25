import { describe, expect, it, vi } from "vitest";
import { Mpaisa } from "../client.js";
import { TokenMismatchError, GatewayError } from "../errors.js";
import { computeAuthDigest } from "../digest.js";

const CLIENT_ID = "cid-confirm";
const CLIENT_SECRET = "confirm-test-client-secret";

function authResponse() {
  return Response.json({
    success: true,
    token: "tok-1",
    expiresAt: Date.now() + 600_000,
  });
}

async function redirectUrl(rCode: string, tamper = false): Promise<string> {
  const token = await computeAuthDigest({
    merchantTid: "order-10",
    amount: "7.25",
    itemDetail: "Gadget",
    clientSecret: CLIENT_SECRET,
    responseCode: rCode,
  });
  const finalToken = tamper ? `0${token.slice(1)}` : token;
  const params = new URLSearchParams({
    rCode,
    tID: "order-10",
    rID: "rID-10",
    phone: "6790005678",
    tokenv2: finalToken,
  });
  return `https://shop.test/callback?${params.toString()}`;
}

const ORDER = { amount: "7.25", itemDetail: "Gadget" };

const STATUS_BODY = {
  response: 101,
  tID: "order-10",
  rID: "rID-10",
  amt: "7.25",
  phone: "6790005678",
  completedate: "2026-08-25 12:00:00",
};

function makeClient(
  statusBody: unknown = STATUS_BODY,
): { client: Mpaisa; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("generateAuth")) return Promise.resolve(authResponse());
    if (u.includes("requeststatus")) {
      return Promise.resolve(Response.json(statusBody));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  });
  const client = new Mpaisa({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    baseUrl: "https://gw.test",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("Mpaisa.confirmRedirect()", () => {
  it("verifies tokenv2 then returns the authoritative transaction record", async () => {
    const url = await redirectUrl("101");
    const { client, fetchMock } = makeClient();
    const record = await client.confirmRedirect(url, ORDER);
    expect(record).toEqual({
      status: "success",
      tID: "order-10",
      rID: "rID-10",
      amount: "7.25",
      phone: "6790005678",
      completedate: "2026-08-25 12:00:00",
    });
    // The status call must carry bearer auth and the session identifiers.
    const statusCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("requeststatus"),
    );
    expect(statusCall).toBeTruthy();
    const statusUrl = new URL(String(statusCall![0]));
    expect(statusUrl.searchParams.get("rID")).toBe("rID-10");
    expect(statusUrl.searchParams.get("tID")).toBe("order-10");
    expect(statusUrl.searchParams.get("cID")).toBe(CLIENT_ID);
    expect(
      (statusCall![1] as RequestInit).headers &&
        ((statusCall![1] as RequestInit).headers as Record<string, string>)
          .Authorization,
    ).toBe("Bearer tok-1");
  });

  it("throws TokenMismatchError before any status call on hash mismatch", async () => {
    const url = await redirectUrl("101", true);
    const { client, fetchMock } = makeClient();
    await expect(client.confirmRedirect(url, ORDER)).rejects.toBeInstanceOf(
      TokenMismatchError,
    );
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("requeststatus"))).toBe(
      false,
    );
  });

  it("throws GatewayError when the gateway rejects the status call", async () => {
    const url = await redirectUrl("101");
    const { client } = makeClient({ error: "session unknown" });
    // Replace the status response with an HTTP error via a custom client.
    const fetchMock = vi.fn((url2: string | URL | Request) => {
      const u = String(url2);
      if (u.includes("generateAuth")) return Promise.resolve(authResponse());
      if (u.includes("requeststatus")) {
        return Promise.resolve(Response.json({ error: "boom" }, { status: 500 }));
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    void client;
    const client2 = new Mpaisa({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      baseUrl: "https://gw.test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const settled = client2.confirmRedirect(url, ORDER).catch((e) => e);
    const err = (await settled) as unknown;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).not.toBeInstanceOf(TokenMismatchError);
  });

  it("maps cancelled redirects to a cancelled record", async () => {
    const url = await redirectUrl("112");
    const { client } = makeClient({ ...STATUS_BODY, response: 112 });
    const record = await client.confirmRedirect(url, ORDER);
    expect(record.status).toBe("cancelled");
  });
});
