import { responseCodeLabel } from "./codes.js";

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 8;

let registeredSecrets: string[] = [];

export function registerSecrets(
  ...secrets: Array<string | undefined | null>
): void {
  // Accumulates rather than replaces so multiple clients (or a later
  // bearer-token registration) never silently drop earlier secrets.
  const valid = secrets.filter(
    (s): s is string => typeof s === "string" && s.length >= MIN_SECRET_LENGTH,
  );
  registeredSecrets = [...new Set([...registeredSecrets, ...valid])];
}

export function clearSecrets(): void {
  registeredSecrets = [];
}

function redactText(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    while (out.includes(secret)) {
      out = out.replaceAll(secret, REDACTED);
    }
  }
  return out;
}

function redactDeep(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, secrets));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = redactDeep(val, secrets);
    }
    return out;
  }
  return value;
}

export interface MpaisaErrorDetails {
  [key: string]: unknown;
}

export class MpaisaError extends Error {
  override name = "MpaisaError";
  readonly code: string;
  readonly details?: MpaisaErrorDetails;

  constructor(
    code: string,
    message: string,
    details?: MpaisaErrorDetails,
    options?: { cause?: unknown },
  ) {
    const secrets = registeredSecrets;
    super(redactText(message, secrets), options);
    this.code = code;
    if (details !== undefined) {
      this.details = redactDeep(details, secrets) as MpaisaErrorDetails;
    }
  }
}

export class NetworkError extends MpaisaError {
  override name = "NetworkError";

  constructor(message: string, details?: MpaisaErrorDetails) {
    super("NETWORK_ERROR", message, details);
  }
}

export interface GatewayErrorDetails extends MpaisaErrorDetails {
  rCode?: number;
  response?: unknown;
  requestId?: string;
}

export class GatewayError extends MpaisaError {
  override name = "GatewayError";
  readonly rCode?: number;
  readonly response?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    details: GatewayErrorDetails & MpaisaErrorDetails = {},
  ) {
    const { rCode, response, requestId, ...rest } = details;
    super("GATEWAY_ERROR", message, { rCode, response, requestId, ...rest });
    this.rCode = rCode;
    this.response = response;
    this.requestId = requestId;
  }
}

export class TokenMismatchError extends MpaisaError {
  override name = "TokenMismatchError";

  constructor(message = "Redirect token verification failed") {
    super("TOKEN_MISMATCH", message);
  }
}

export class ValidationError extends MpaisaError {
  override name = "ValidationError";
  readonly field: string;
  readonly rule: string;

  constructor(message: string, field: string, rule: string) {
    super("VALIDATION_ERROR", message, { field, rule });
    this.field = field;
    this.rule = rule;
  }
}

export class PollTimeoutError extends MpaisaError {
  override name = "PollTimeoutError";
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super("POLL_TIMEOUT", message, { timeoutMs });
    this.timeoutMs = timeoutMs;
  }
}

export class RateLimitError extends MpaisaError {
  override name = "RateLimitError";
  readonly retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super("RATE_LIMITED", message, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ResponseCodeError extends MpaisaError {
  override name = "ResponseCodeError";
  readonly rCode: number;
  readonly label: string;

  constructor(rCode: number) {
    const label = responseCodeLabel(rCode);
    super("RESPONSE_CODE_ERROR", `Gateway returned ${rCode} (${label})`, {
      rCode,
      label,
    });
    this.rCode = rCode;
    this.label = label;
  }
}
