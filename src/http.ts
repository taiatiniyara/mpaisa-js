import {
  GatewayError,
  MpaisaError,
  NetworkError,
  RateLimitError,
} from "./errors.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_BASE_MS = 100;

export interface RequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

function defaultRetries(method: string): number {
  return method === "GET" ? 3 : 0;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchLike = typeof fetch;

export async function request(
  fetchFn: FetchLike,
  options: RequestOptions,
): Promise<unknown> {
  const method = options.method ?? "GET";
  const maxRetries = options.retries ?? defaultRetries(method);
  const canRetry = method === "GET";

  let attempt = 0;
  // The loop always throws or returns on success; this keeps TypeScript happy
  // about control flow across the retry path.
  for (;;) {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetchFn(options.url, {
        method,
        headers: options.headers,
        body: options.body,
        signal,
      });
    } catch (cause) {
      if (options.signal?.aborted) {
        throw new NetworkError("Request aborted", { url: options.url });
      }
      if (cause instanceof Error && cause.name === "TimeoutError") {
        throw new NetworkError(`Request to ${options.url} timed out`, {
          url: options.url,
        });
      }
      if (cause instanceof Error && cause.name === "AbortError") {
        throw new NetworkError(`Request to ${options.url} timed out`, {
          url: options.url,
        });
      }
      const message =
        cause instanceof Error ? cause.message : "Unknown network failure";
      if (canRetry && attempt < maxRetries) {
        await sleep(RETRY_BACKOFF_BASE_MS * 2 ** attempt);
        attempt++;
        continue;
      }
      throw new NetworkError(message, { url: options.url });
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds =
        retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader.trim())
          ? Number.parseInt(retryAfterHeader.trim(), 10)
          : null;
      throw new RateLimitError(
        `Request to ${options.url} was rate limited (429)`,
        retryAfterSeconds,
      );
    }

    if (!response.ok) {
      const body = await safeJson(response);
      if (
        canRetry &&
        isRetryableStatus(response.status) &&
        attempt < maxRetries
      ) {
        await sleep(RETRY_BACKOFF_BASE_MS * 2 ** attempt);
        attempt++;
        continue;
      }
      throw new GatewayError(
        `Gateway returned HTTP ${response.status} ${response.statusText}`,
        { status: response.status, response: body, url: options.url },
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new MpaisaError(
        "PARSE_ERROR",
        `Gateway returned a non-JSON response from ${options.url}`,
        { url: options.url, cause: String(cause) },
      );
    }
  }
}
