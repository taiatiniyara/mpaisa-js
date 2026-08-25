import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "../http.js";
import {
  GatewayError,
  MpaisaError,
  NetworkError,
  RateLimitError,
  registerSecrets,
} from "../errors.js";

const SECRET = "http-test-client-secret";
registerSecrets(SECRET);

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("request()", () => {
  it("returns parsed JSON on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const result = await request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "GET",
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("passes method, headers, and body through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    await request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "POST",
      headers: { "x-custom": "1" },
      body: JSON.stringify({ a: 1 }),
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gw.test/api");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-custom": "1" });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("maps HTTP 4xx/5xx to GatewayError with safe response attached", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "bad request" }, 400));
    const promise = request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "GET",
    });
    await expect(promise).rejects.toBeInstanceOf(GatewayError);
    try {
      await promise;
    } catch (err) {
      const gw = err as GatewayError;
      expect(gw.message).toContain("400");
      expect(gw.response).toEqual({ error: "bad request" });
      expect(gw.message).not.toContain(SECRET);
    }
  });

  it("maps network failures to NetworkError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const promise = request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "GET",
    });
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
  });

  it("maps timeout (abort) to NetworkError mentioning timeout", async () => {
    class AbortErr extends Error {
      name = "AbortError";
    }
    const fetchMock = vi.fn().mockRejectedValue(new AbortErr("This operation was aborted"));
    try {
      await request(fetchMock as unknown as typeof fetch, {
        url: "https://gw.test/api",
        method: "GET",
        timeoutMs: 10,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NetworkError);
      expect((err as MpaisaError).message.toLowerCase()).toContain("timed out");
    }
  });

  it("maps 429 to RateLimitError and parses Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "slow down" }, 429, { "retry-after": "7" }));
    const promise = request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "GET",
    });
    await expect(promise).rejects.toBeInstanceOf(RateLimitError);
    try {
      await promise;
    } catch (err) {
      expect((err as RateLimitError).retryAfterSeconds).toBe(7);
    }
  });

  it("wraps invalid JSON responses instead of throwing raw SyntaxError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const promise = request(fetchMock as unknown as typeof fetch, {
      url: "https://gw.test/api",
      method: "GET",
    });
    await expect(promise).rejects.toBeInstanceOf(MpaisaError);
    await expect(promise).rejects.not.toBeInstanceOf(SyntaxError);
  });

  describe("reads-only retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries GET on 5xx up to the retry count, then throws GatewayError", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ e: 1 }, 500));
      const settled = request(fetchMock as unknown as typeof fetch, {
        url: "https://gw.test/api",
        method: "GET",
        retries: 2,
      }).catch((err) => err);
      // Flushed through backoff delays: 100ms + 200ms.
      await vi.runAllTimersAsync();
      expect(await settled).toBeInstanceOf(GatewayError);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("never retries POST even when retries > 0", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ e: 1 }, 500));
      const promise = request(fetchMock as unknown as typeof fetch, {
        url: "https://gw.test/api",
        method: "POST",
        retries: 3,
      });
      await expect(promise).rejects.toBeInstanceOf(GatewayError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry 4xx client errors", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ e: 1 }, 404));
      const promise = request(fetchMock as unknown as typeof fetch, {
        url: "https://gw.test/api",
        method: "GET",
        retries: 3,
      });
      await expect(promise).rejects.toBeInstanceOf(GatewayError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("backs off exponentially: 100ms then 200ms before third attempt", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ e: 1 }, 503));
      const settled = request(fetchMock as unknown as typeof fetch, {
        url: "https://gw.test/api",
        method: "GET",
        retries: 2,
      }).catch(() => undefined);
      // Timeline: call1 @0ms, backoff 100ms, call2 @100ms, backoff 200ms, call3 @300ms.
      await vi.advanceTimersByTimeAsync(99);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await settled;
    });
  });
});
