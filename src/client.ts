import { request, type FetchLike } from "./http.js";
import { AuthManager, type TokenCache } from "./auth.js";
import { Session } from "./session.js";
import { parseRedirect, redirectOutcome, verifyTokenV2 } from "./redirect.js";
import { SUCCESS_CODES, CANCELLED_CODES, PENDING_CODES, parseRCode } from "./codes.js";
import {
  GatewayError,
  PollTimeoutError,
  TokenMismatchError,
  ValidationError,
} from "./errors.js";
import { sleep, defaultFetch } from "./util.js";

export const STAGING_BASE_URL = "https://payments-staging.m-paisa.com";
// Provisional: the live host is not pinned by captured fixtures yet.
export const LIVE_BASE_URL = "https://payments.m-paisa.com";

export type Environment = "staging" | "live";

const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const MAX_IDET_LENGTH = 200;
const MAX_TID_LENGTH = 200;

export interface MpaisaOptions {
  clientId: string;
  clientSecret: string;
  environment?: Environment;
  baseUrl?: string;
  timeout?: number;
  fetch?: FetchLike;
  tokenCache?: TokenCache;
}

export interface HandshakeInput {
  merchantTid: string;
  amount: string;
  itemDetail: string;
  returnUrl: string;
}

interface HandshakeResponse {
  requestID?: string;
  authdigestv2?: string;
  response?: number | string;
  paymentspage?: string;
  [key: string]: unknown;
}

export interface RedirectOrder {
  amount: string;
  itemDetail: string;
}

export type TransactionStatus = "success" | "cancelled" | "pending" | "unknown";

export interface TransactionRecord {
  status: TransactionStatus;
  tID: string;
  rID: string;
  amount?: string;
  phone?: string;
  completedate?: string;
}

interface StatusResponse {
  response?: number | string;
  rCode?: number | string;
  tID?: string;
  rID?: string;
  amt?: string;
  amount?: string;
  phone?: string;
  completedate?: string;
  [key: string]: unknown;
}

const POLL_MAX_INTERVAL_MS = 30_000;

export class Mpaisa {
  readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly timeout?: number;
  private readonly fetchFn: FetchLike;
  private readonly authManager: AuthManager;

  constructor(options: MpaisaOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    const envBase =
      options.environment === "live" ? LIVE_BASE_URL : STAGING_BASE_URL;
    this.baseUrl = (options.baseUrl ?? envBase).replace(/\/+$/, "");
    this.timeout = options.timeout;
    this.fetchFn = options.fetch ?? defaultFetch;
    this.authManager = new AuthManager({
      baseUrl: this.baseUrl,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      fetchFn: this.fetchFn,
      timeoutMs: this.timeout,
      tokenCache: options.tokenCache,
    });
  }

  async handshake(input: HandshakeInput): Promise<Session> {
    this.validateHandshakeInput(input);
    const token = await this.authManager.getToken();
    const url = this.buildHandshakeUrl(input, token);

    // Handshake creates a server-side session: never retried automatically.
    const result = await request(this.fetchFn, {
      url,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: this.timeout,
      retries: 0,
    });

    const body = result as HandshakeResponse;
    if (!body.requestID) {
      throw new GatewayError("Handshake response did not include a requestID", {
        response: body,
      });
    }

    return new Session({
      requestID: body.requestID,
      amount: input.amount,
      merchantTid: input.merchantTid,
      authDigestV2: body.authdigestv2 ?? "",
      itemDetail: input.itemDetail,
      responseCode: body.response ?? "",
      clientSecret: this.clientSecret,
      clientId: this.clientId,
      returnUrl: input.returnUrl,
      paymentsPageUrl: body.paymentspage ?? `${this.baseUrl}/live/`,
    });
  }

  async confirmRedirect(
    redirect: string | URLSearchParams,
    order: RedirectOrder,
  ): Promise<TransactionRecord> {
    return this.confirmPipeline(redirect, order);
  }

  async poll(
    target: { rId: string; tId: string; cId: string },
    options: { timeoutMs: number; intervalMs: number },
  ): Promise<TransactionRecord> {
    const deadline = Date.now() + options.timeoutMs;
    let intervalMs = options.intervalMs;
    for (;;) {
      const body = (await this.requestStatus({
        rId: target.rId,
        tId: target.tId,
        cId: target.cId,
      })) as StatusResponse;
      const rCode = parseRCode(body);
      if (!PENDING_CODES.has(rCode)) {
        return this.mapToRecord(body, { tID: target.tId, rID: target.rId });
      }
      if (Date.now() + intervalMs > deadline) {
        throw new PollTimeoutError(
          `Transaction ${target.tId} still pending after ${options.timeoutMs}ms`,
          options.timeoutMs,
        );
      }
      await sleep(intervalMs);
      intervalMs = Math.min(intervalMs * 2, POLL_MAX_INTERVAL_MS);
    }
  }

  private async requestStatus(target: {
    rId: string;
    tId: string;
    cId: string;
  }): Promise<unknown> {
    const token = await this.authManager.getToken();
    const params = new URLSearchParams({
      rID: target.rId,
      tID: target.tId,
      cID: target.cId,
    });
    // Status is a read: safe to auto-retry with backoff.
    return request(this.fetchFn, {
      url: `${this.baseUrl}/live/API/requeststatus?${params.toString()}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: this.timeout,
    });
  }

  private validateHandshakeInput(input: HandshakeInput): void {
    if (!AMOUNT_PATTERN.test(input.amount)) {
      throw new ValidationError(
        `amount must be a decimal string matching ${AMOUNT_PATTERN.source}`,
        "amount",
        AMOUNT_PATTERN.source,
      );
    }
    if (input.itemDetail.length > MAX_IDET_LENGTH) {
      throw new ValidationError(
        `itemDetail must be at most ${MAX_IDET_LENGTH} characters`,
        "itemDetail",
        `length <= ${MAX_IDET_LENGTH}`,
      );
    }
    if (input.merchantTid.length > MAX_TID_LENGTH) {
      throw new ValidationError(
        `merchantTid must be at most ${MAX_TID_LENGTH} characters`,
        "merchantTid",
        `length <= ${MAX_TID_LENGTH}`,
      );
    }
  }

  private buildHandshakeUrl(input: HandshakeInput, token: string): string {
    const params = new URLSearchParams({
      url: input.returnUrl,
      tID: input.merchantTid,
      amt: input.amount,
      cID: this.clientId,
      iDet: input.itemDetail,
    });
    return `${this.baseUrl}/live/API/?${params.toString()}`;
  }

  private mapToRecord(
    body: StatusResponse,
    fallbacks: { tID: string; rID: string },
  ): TransactionRecord {
    const rCode = parseRCode(body);
    let status: TransactionStatus = "unknown";
    if (SUCCESS_CODES.has(rCode)) status = "success";
    else if (CANCELLED_CODES.has(rCode)) status = "cancelled";
    else if (PENDING_CODES.has(rCode)) status = "pending";
    return {
      status,
      tID: body.tID ?? fallbacks.tID,
      rID: body.rID ?? fallbacks.rID,
      amount: body.amt ?? body.amount,
      phone: body.phone,
      completedate: body.completedate,
    };
  }

  private async confirmPipeline(
    redirect: string | URLSearchParams,
    order: RedirectOrder,
  ): Promise<TransactionRecord> {
    const parsed = parseRedirect(redirect);
    const tokenOk = await verifyTokenV2({
      merchantTid: parsed.tID,
      amount: order.amount,
      itemDetail: order.itemDetail,
      clientSecret: this.clientSecret,
      responseCode: parsed.rCode,
      tokenv2: parsed.tokenv2,
    });
    // A failed hash check is a security incident, not a normal flow
    // (ADR-0002): throw rather than return a result.
    if (!tokenOk.ok) {
      throw new TokenMismatchError(
        `tokenv2 verification failed for tID ${parsed.tID}`,
      );
    }
    const body = (await this.requestStatus({
      rId: parsed.rID,
      tId: parsed.tID,
      cId: this.clientId,
    })) as StatusResponse;
    // Only trust the outcome the status API reports.
    redirectOutcome(parseRCode(body));
    return this.mapToRecord(body, { tID: parsed.tID, rID: parsed.rID });
  }
}
