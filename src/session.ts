import { computeAuthDigest, hashesEqual } from "./digest.js";

export interface SessionConfig {
  requestID: string;
  amount: string;
  merchantTid: string;
  authDigestV2: string;
  itemDetail: string;
  responseCode: string | number;
  clientSecret: string;
  clientId: string;
  returnUrl: string;
  paymentsPageUrl: string;
}

export type DigestVerification =
  | { ok: true }
  | { ok: false; expected: string; received: string };

export class Session {
  readonly requestID: string;

  private readonly amount: string;
  private readonly merchantTid: string;
  private readonly authDigestV2: string;

  private readonly itemDetail: string;
  private readonly responseCode: string;
  private readonly clientSecret: string;
  private readonly clientId: string;
  private readonly returnUrl: string;
  private readonly paymentsPageUrl: string;

  constructor(config: SessionConfig) {
    this.requestID = config.requestID;
    this.amount = config.amount;
    this.merchantTid = config.merchantTid;
    this.authDigestV2 = config.authDigestV2.toUpperCase();
    this.itemDetail = config.itemDetail;
    this.responseCode = String(config.responseCode);
    this.clientSecret = config.clientSecret;
    this.clientId = config.clientId;
    this.returnUrl = config.returnUrl;
    this.paymentsPageUrl = config.paymentsPageUrl;
  }

  get checkoutUrl(): string {
    const page = new URL(this.paymentsPageUrl);
    page.searchParams.set("url", this.returnUrl);
    page.searchParams.set("tID", this.merchantTid);
    page.searchParams.set("amt", this.amount);
    page.searchParams.set("cID", this.clientId);
    page.searchParams.set("iDet", this.itemDetail);
    page.searchParams.set("rID", this.requestID);
    return page.toString();
  }

  async verifyDigest(): Promise<DigestVerification> {
    const expected = await computeAuthDigest({
      merchantTid: this.merchantTid,
      amount: this.amount,
      itemDetail: this.itemDetail,
      clientSecret: this.clientSecret,
      responseCode: this.responseCode,
    });
    if (hashesEqual(expected, this.authDigestV2)) {
      return { ok: true };
    }
    return { ok: false, expected, received: this.authDigestV2.toUpperCase() };
  }
}
