import { request, type FetchLike } from "./http.js";
import { GatewayError, registerSecrets } from "./errors.js";
import { defaultFetch } from "./util.js";

const REFRESH_MARGIN_MS = 60_000;
export const TOKEN_CACHE_PREFIX = "mpaisa:token:";

export interface TokenCache {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string, ttlMs: number): void | Promise<void>;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

class InMemoryTokenCache implements TokenCache {
  private store: CachedToken | null = null;

  async get(_key: string): Promise<string | null> {
    if (!this.store) return null;
    return JSON.stringify(this.store);
  }

  async set(_key: string, value: string, _ttlMs: number): Promise<void> {
    try {
      this.store = JSON.parse(value) as CachedToken;
    } catch {
      this.store = null;
    }
  }
}

export interface AuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  tokenCache?: TokenCache;
}

export class AuthManager {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeoutMs?: number;
  private readonly tokenCache: TokenCache;
  private readonly fetchFn: FetchLike;

  private inflight: Promise<string> | null = null;

  constructor(config: AuthConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.timeoutMs = config.timeoutMs;
    this.tokenCache = config.tokenCache ?? new InMemoryTokenCache();
    this.fetchFn = config.fetchFn ?? defaultFetch;
    registerSecrets(this.clientId, this.clientSecret);
  }

  async getToken(): Promise<string> {
    if (this.inflight) return this.inflight;

    // Build the shared promise synchronously so concurrent callers in the
    // same tick join it instead of starting their own generateAuth.
    const promise = (async () => {
      const cached = await this.readCached();
      if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
        return cached.token;
      }
      return this.refresh();
    })();
    this.inflight = promise;
    try {
      return await promise;
    } finally {
      if (this.inflight === promise) this.inflight = null;
    }
  }

  private async readCached(): Promise<CachedToken | null> {
    const raw = await this.tokenCache.get(TOKEN_CACHE_PREFIX + this.clientId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<CachedToken>;
      if (typeof parsed.token === "string" && typeof parsed.expiresAt === "number") {
        return { token: parsed.token, expiresAt: parsed.expiresAt };
      }
    } catch {
      // Corrupt cache entries are treated as a miss.
    }
    return null;
  }

  private async refresh(): Promise<string> {
    const body = JSON.stringify({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    const result = await request(this.fetchFn, {
      url: `${this.baseUrl}/live/API/generateAuth`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: this.timeoutMs,
    });

    const payload = result as {
      success?: boolean;
      token?: string;
      expiresAt?: number;
    };
    if (!payload || payload.success !== true || typeof payload.token !== "string") {
      throw new GatewayError("generateAuth did not return a usable token", {
        response: result,
        url: `${this.baseUrl}/live/API/generateAuth`,
      });
    }

    // The gateway reports an absolute expiry epoch; default generously if absent.
    const expiresAt =
      typeof payload.expiresAt === "number"
        ? payload.expiresAt
        : Date.now() + 30 * 60_000;

    const entry: CachedToken = { token: payload.token, expiresAt };
    // Bearer tokens are secrets too: any error constructed after this point
    // redacts them (ADR-0004).
    registerSecrets(payload.token);
    const serialized = JSON.stringify(entry);
    await this.tokenCache.set(
      TOKEN_CACHE_PREFIX + this.clientId,
      serialized,
      Math.max(expiresAt - Date.now(), 0),
    );
    return entry.token;
  }
}
