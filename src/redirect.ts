import { computeAuthDigest, hashesEqual } from "./digest.js";
import { GatewayError } from "./errors.js";
import { SUCCESS_CODES, CANCELLED_CODES, PENDING_CODES } from "./codes.js";

export interface ParsedRedirect {
  rCode: number;
  tID: string;
  rID: string;
  phone?: string;
  tokenv2?: string;
}

export function parseRedirect(
  input: string | URLSearchParams,
): ParsedRedirect {
  const params =
    typeof input === "string" ? new URL(input).searchParams : input;
  const get = (key: string): string | undefined => {
    const value = params.get(key);
    return value === null || value === "" ? undefined : value;
  };
  return {
    rCode: Number.parseInt(get("rCode") ?? "", 10),
    tID: get("tID") ?? "",
    rID: get("rID") ?? "",
    phone: get("phone"),
    tokenv2: get("tokenv2")?.toUpperCase(),
  };
}

export interface TokenV2Input {
  merchantTid: string;
  amount: string;
  itemDetail: string;
  clientSecret: string;
  responseCode: string | number;
  tokenv2?: string;
}

export interface TokenV2Result {
  ok: boolean;
}

export async function verifyTokenV2(input: TokenV2Input): Promise<TokenV2Result> {
  if (!input.tokenv2) return { ok: false };
  const computed = await computeAuthDigest({
    merchantTid: input.merchantTid,
    amount: input.amount,
    itemDetail: input.itemDetail,
    clientSecret: input.clientSecret,
    responseCode: input.responseCode,
  });
  return { ok: hashesEqual(computed, input.tokenv2) };
}

export type RedirectOutcome =
  | { status: "success"; tID: string; rID: string; phone?: string }
  | { status: "cancelled"; tID: string; rID: string }
  | { status: "pending"; tID: string; rID: string };

export function redirectOutcome(
  rCode: number,
  parsed?: Pick<ParsedRedirect, "tID" | "rID" | "phone">,
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
  throw new GatewayError(`Unknown redirect response code ${rCode}`, {
    rCode,
  });
}
