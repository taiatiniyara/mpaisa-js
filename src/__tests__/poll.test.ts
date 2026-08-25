import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mpaisa } from "../client.js";
import { PollTimeoutError } from "../errors.js";

const CLIENT_ID = "cid-poll";
const CLIENT_SECRET = "poll-test-client-secret";

function statusBody(rCode: number) {
  return {
    response: rCode,
    tID: "order-11",
    rID: "rID-11",
    amt: "1.00",
    phone: "6790009999",
    completedate: "2026-08-25 09:30:00",
  };
}

function makeClientWithQueue(codes: number[]) {
  const fetchMock = vi.fn((url: string | URL | Request) => {
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
    if (u.includes("requeststatus")) {
      const next = codes.length > 0 ? codes.shift()! : 100;
      return Promise.resolve(Response.json(statusBody(next)));
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

describe("Mpaisa.poll()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the SUCCESS record after PENDING responses", async () => {
    const { client, fetchMock } = makeClientWithQueue([100, 100, 101]);
    const promise = client.poll(
      { rId: "rID-11", tId: "order-11", cId: CLIENT_ID },
      { timeoutMs: 60_000, intervalMs: 1_000 },
    );
    await vi.runAllTimersAsync();
    const record = await promise;
    expect(record.status).toBe("success");
    expect(record.rID).toBe("rID-11");
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("requeststatus"))).toHaveLength(3);
  });

  it("resolves immediately on a terminal CANCELLED status", async () => {
    const { client, fetchMock } = makeClientWithQueue([112]);
    const promise = client.poll(
      { rId: "rID-11", tId: "order-11", cId: CLIENT_ID },
      { timeoutMs: 60_000, intervalMs: 1_000 },
    );
    await vi.runAllTimersAsync();
    const record = await promise;
    expect(record.status).toBe("cancelled");
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("requeststatus"))).toHaveLength(1);
  });

  it("throws PollTimeoutError at the deadline while still PENDING", async () => {
    const { client } = makeClientWithQueue([100]);
    const settled = client
      .poll(
        { rId: "rID-11", tId: "order-11", cId: CLIENT_ID },
        { timeoutMs: 10_000, intervalMs: 1_000 },
      )
      .catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(PollTimeoutError);
  });
});
