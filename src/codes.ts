export const ResponseCode = {
  PENDING: 100,
  SUCCESS: 101,
  FAILED: 102,
  DECLINED_BY_CUSTOMER: 103,
  EXPIRED: 104,
  SYSTEM_ERROR: 105,
  INSUFFICIENT_BALANCE: 106,
  DUPLICATE_TRANSACTION: 107,
  INVALID_MERCHANT: 108,
  INVALID_AMOUNT: 109,
  LIMIT_EXCEEDED: 110,
  TIMEOUT: 111,
  CANCELLED: 112,
  SUCCESS_CONFIRMED: 113,
  REVERSED: 114,
  TOO_MANY_ATTEMPTS: 155,
} as const;

export type ResponseCodeValue =
  (typeof ResponseCode)[keyof typeof ResponseCode];

const LABELS: Record<ResponseCodeValue, string> = {
  [ResponseCode.PENDING]: "PENDING",
  [ResponseCode.SUCCESS]: "SUCCESS",
  [ResponseCode.FAILED]: "FAILED",
  [ResponseCode.DECLINED_BY_CUSTOMER]: "DECLINED BY CUSTOMER",
  [ResponseCode.EXPIRED]: "EXPIRED",
  [ResponseCode.SYSTEM_ERROR]: "SYSTEM ERROR",
  [ResponseCode.INSUFFICIENT_BALANCE]: "INSUFFICIENT BALANCE",
  [ResponseCode.DUPLICATE_TRANSACTION]: "DUPLICATE TRANSACTION",
  [ResponseCode.INVALID_MERCHANT]: "INVALID MERCHANT",
  [ResponseCode.INVALID_AMOUNT]: "INVALID AMOUNT",
  [ResponseCode.LIMIT_EXCEEDED]: "LIMIT EXCEEDED",
  [ResponseCode.TIMEOUT]: "TIMEOUT",
  [ResponseCode.CANCELLED]: "CANCELLED",
  [ResponseCode.SUCCESS_CONFIRMED]: "SUCCESS CONFIRMED",
  [ResponseCode.REVERSED]: "REVERSED",
  [ResponseCode.TOO_MANY_ATTEMPTS]: "TOO MANY ATTEMPTS",
};

export function responseCodeLabel(code: number): string {
  return LABELS[code as ResponseCodeValue] ?? "UNKNOWN";
}

export function isTerminalCode(code: number): boolean {
  return code !== ResponseCode.PENDING;
}

export const SUCCESS_CODES: Set<number> = new Set([
  ResponseCode.SUCCESS,
  ResponseCode.SUCCESS_CONFIRMED,
]);
export const CANCELLED_CODES: Set<number> = new Set([ResponseCode.CANCELLED]);
export const PENDING_CODES: Set<number> = new Set([ResponseCode.PENDING]);

export function parseRCode(body: {
  response?: number | string;
  rCode?: number | string;
}): number {
  return Number.parseInt(String(body.response ?? body.rCode ?? ""), 10);
}
