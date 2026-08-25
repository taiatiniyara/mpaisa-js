export { parseRedirect, type ParsedRedirect } from "./redirect.js";

export {
  ResponseCode,
  responseCodeLabel,
  isTerminalCode,
  SUCCESS_CODES,
  CANCELLED_CODES,
  PENDING_CODES,
  type ResponseCodeValue,
} from "./codes.js";

import { SUCCESS_CODES, CANCELLED_CODES, PENDING_CODES } from "./codes.js";
import type { RedirectOutcome } from "./redirect.js";

export type { RedirectOutcome } from "./redirect.js";

export function redirectOutcome(
  rCode: number,
  parsed?: { tID: string; rID: string; phone?: string },
): RedirectOutcome {
  const ids = parsed ?? { tID: "", rID: "" };
  if (SUCCESS_CODES.has(rCode)) {
    return {
      status: "success",
      tID: ids.tID,
      rID: ids.rID,
      ...(ids.phone !== undefined ? { phone: ids.phone } : {}),
    };
  }
  if (CANCELLED_CODES.has(rCode)) {
    return { status: "cancelled", tID: ids.tID, rID: ids.rID };
  }
  if (PENDING_CODES.has(rCode)) {
    return { status: "pending", tID: ids.tID, rID: ids.rID };
  }
  throw new Error(`Unknown response code ${rCode}`);
}
