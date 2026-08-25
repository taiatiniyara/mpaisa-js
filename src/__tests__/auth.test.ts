import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthManager, type TokenCache } from "../auth.js";
import { GatewayError } from "../errors.js";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "auth-test-client-secret-value";

function authResponse(token: string, expiresInMs: number, start = Date.now()) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, token, expiresAt: start + expiresInMs }),
    headers: new Headers(),
  } as unknown as Response;
}

function makeFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  const fn = vi.fn(impl as never);
  return fn as unknown as ReturnType<typeof vi.fn> & typeof fetch;
}

describe("AuthManager", () => {
  let base: ConstructorParameters<typeof AuthManager>[0];

  beforeEach(() => {
    base = {
      baseUrl: "https://gw.test",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches a token lazily on first getToken()", async () => {
    const fetchMock = makeFetch(() => authResponse("tok-1", 600_000));
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    expect(await auth.getToken()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://gw.test/live/API/generateAuth");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
  });

  it("reuses the cached token until near expiry", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const fetchMock = makeFetch(() => authResponse("tok-1", 600_000, start));
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    expect(await auth.getToken()).toBe("tok-1");
    vi.advanceTimersByTime(300_000); // well before expiry margin
    expect(await auth.getToken()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes when the token is within 60s of expiry", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const responses = ["tok-1", "tok-2"];
    const fetchMock = makeFetch(() => authResponse(responses.shift()!, 120_000, start));
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    expect(await auth.getToken()).toBe("tok-1");
    vi.advanceTimersByTime(30_000); // >60s left: still cached
    expect(await auth.getToken()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(31_000); // <60s left: refresh
    expect(await auth.getToken()).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight generateAuth across concurrent calls", async () => {
    const fetchMock = makeFetch(() => authResponse("tok-1", 600_000));
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    const [a, b, c] = await Promise.all([
      auth.getToken(),
      auth.getToken(),
      auth.getToken(),
    ]);
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(c).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stores and retrieves tokens through an external cache hook", async () => {
    const store = new Map<string, string>();
    const calls: string[] = [];
    const hook: TokenCache = {
      get(key) {
        calls.push(`get:${key}`);
        return store.get(key) ?? null;
      },
      set(key, value) {
        calls.push(`set:${key}`);
        store.set(key, value);
      },
    };
    const fetchMock = makeFetch(() => authResponse("tok-1", 600_000));
    const auth = new AuthManager({
      ...base,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenCache: hook,
    });
    expect(await auth.getToken()).toBe("tok-1");
    expect(calls).toContain("get:mpaisa:token:test-client-id");
    expect(calls).toContain("set:mpaisa:token:test-client-id");

    // A fresh manager sharing the same hook must not re-fetch.
    const auth2 = new AuthManager({
      ...base,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenCache: hook,
    });
    expect(await auth2.getToken()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats expired tokens from an external cache as stale and refetches", async () => {
    const start = Date.now();
    const stale = JSON.stringify({ token: "old", expiresAt: start - 1000 });
    const hook: TokenCache = { get: () => stale, set: () => undefined };
    const fetchMock = makeFetch(() => authResponse("fresh", 600_000, start));
    const auth = new AuthManager({
      ...base,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenCache: hook,
    });
    expect(await auth.getToken()).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws GatewayError when generateAuth fails, without leaking secrets", async () => {
    const fetchMock = makeFetch(
      () =>
        ({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          headers: new Headers(),
          url: "https://gw.test/live/API/generateAuth",
          json: async () => ({ error: `bad credentials ${CLIENT_SECRET}` }),
        }) as unknown as Response,
    );
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    try {
      await auth.getToken();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect(String(err)).not.toContain(CLIENT_SECRET);
      expect(JSON.stringify((err as GatewayError).details ?? {})).not.toContain(
        CLIENT_SECRET,
      );
    }
  });

  it("throws GatewayError when generateAuth returns success=false", async () => {
    const fetchMock = makeFetch(
      () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ success: false, message: "denied" }),
        }) as unknown as Response,
    );
    const auth = new AuthManager({ ...base, fetchFn: fetchMock as unknown as typeof fetch });
    await expect(auth.getToken()).rejects.toBeInstanceOf(GatewayError);
  });
});
