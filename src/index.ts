export const VERSION = "0.0.1" as const;

export { Mpaisa } from "./client.js";
export type {
  MpaisaOptions,
  HandshakeInput,
  RedirectOrder,
  TransactionRecord,
  TransactionStatus,
  Environment,
} from "./client.js";
export { STAGING_BASE_URL, LIVE_BASE_URL } from "./client.js";

export { Session } from "./session.js";
export type { SessionConfig, DigestVerification } from "./session.js";

export {
  computeAuthDigest,
  constantTimeEqual,
  type DigestInput,
} from "./digest.js";

export {
  parseRedirect,
  verifyTokenV2,
  redirectOutcome,
  type ParsedRedirect,
  type TokenV2Input,
  type TokenV2Result,
  type RedirectOutcome,
} from "./redirect.js";

export {
  MpaisaError,
  NetworkError,
  GatewayError,
  TokenMismatchError,
  ValidationError,
  PollTimeoutError,
  RateLimitError,
  ResponseCodeError,
  registerSecrets,
  clearSecrets,
  type MpaisaErrorDetails,
  type GatewayErrorDetails,
} from "./errors.js";

export { ResponseCode, responseCodeLabel, isTerminalCode } from "./codes.js";
export type { ResponseCodeValue } from "./codes.js";

export { request, type RequestOptions, type FetchLike } from "./http.js";

export { AuthManager, TOKEN_CACHE_PREFIX } from "./auth.js";
export type { AuthConfig, TokenCache } from "./auth.js";
