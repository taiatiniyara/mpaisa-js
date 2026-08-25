import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GatewayError,
  MpaisaError,
  NetworkError,
  PollTimeoutError,
  RateLimitError,
  ResponseCodeError,
  TokenMismatchError,
  ValidationError,
  clearSecrets,
  registerSecrets,
} from "../errors.js";
import { ResponseCode, responseCodeLabel } from "../codes.js";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-payload.signature";
const CLIENT_SECRET = "super-secret-client-secret-value";

describe("MpaisaError base", () => {
  beforeEach(() => registerSecrets(CLIENT_SECRET, TOKEN));
  afterEach(() => clearSecrets());

  it("is an Error with name, code, message, and details", () => {
    const err = new MpaisaError("TEST_CODE", "something broke", { rID: "abc" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MpaisaError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("something broke");
    expect(err.details).toEqual({ rID: "abc" });
  });

  it("defaults details to undefined", () => {
    const err = new MpaisaError("TEST_CODE", "no details");
    expect(err.details).toBeUndefined();
  });
});

describe("error hierarchy", () => {
  beforeEach(() => registerSecrets(CLIENT_SECRET));
  afterEach(() => clearSecrets());

  const cases: Array<[string, () => MpaisaError]> = [
    ["NetworkError", () => new NetworkError("fetch failed")],
    [
      "GatewayError",
      () => new GatewayError("gateway said no", { rCode: 102, response: { error: "declined" } }),
    ],
    ["TokenMismatchError", () => new TokenMismatchError("tokenv2 mismatch")],
    [
      "ValidationError",
      () => new ValidationError("bad amount", "amount", "must match /^\\d{1,7}(\\.\\d{1,2})?$/"),
    ],
    ["PollTimeoutError", () => new PollTimeoutError("deadline exceeded", 30_000)],
    [
      "RateLimitError",
      () => new RateLimitError("slow down", 2),
    ],
    [
      "ResponseCodeError",
      () => new ResponseCodeError(102),
    ],
  ];

  for (const [name, make] of cases) {
    it(`${name} extends MpaisaError and sets its name`, () => {
      const err = make();
      expect(err).toBeInstanceOf(MpaisaError);
      expect(err.name).toBe(name);
    });
  }
});

describe("GatewayError", () => {
  beforeEach(() => registerSecrets(CLIENT_SECRET));
  afterEach(() => clearSecrets());

  it("carries the gateway response code and safe response body", () => {
    const err = new GatewayError("gateway rejected request", {
      rCode: 155,
      response: { message: "too many attempts" },
      requestId: "rID-1",
    });
    expect(err.rCode).toBe(155);
    expect(err.response).toEqual({ message: "too many attempts" });
    expect(err.requestId).toBe("rID-1");
  });
});

describe("ResponseCodeError", () => {
  it("carries the code and its human-readable label", () => {
    const err = new ResponseCodeError(112);
    expect(err.rCode).toBe(112);
    expect(err.label).toBe(responseCodeLabel(112));
    expect(err.label).toMatch(/cancel/i);
  });
});

describe("ValidationError", () => {
  it("carries field name and violated rule", () => {
    const err = new ValidationError("invalid amount", "amount", "decimal string with 2 places");
    expect(err.field).toBe("amount");
    expect(err.rule).toBe("decimal string with 2 places");
  });
});

describe("RateLimitError", () => {
  it("carries Retry-After seconds when present", () => {
    const err = new RateLimitError("rate limited", 5);
    expect(err.retryAfterSeconds).toBe(5);
  });

  it("allows missing Retry-After", () => {
    const err = new RateLimitError("rate limited", null);
    expect(err.retryAfterSeconds).toBeNull();
  });
});

describe("PollTimeoutError", () => {
  it("carries the timeout duration", () => {
    const err = new PollTimeoutError("gave up", 1500);
    expect(err.timeoutMs).toBe(1500);
  });
});

describe("secret redaction (ADR-0004)", () => {
  beforeEach(() => registerSecrets(CLIENT_SECRET, TOKEN));
  afterEach(() => clearSecrets());

  // Each entry: [name, make] where `make` builds an error whose message
  // and structured details both embed the token and client secret.
  const constructors: Array<[string, () => MpaisaError]> = [
    [
      "MpaisaError",
      () =>
        new MpaisaError("X", `failed: Bearer ${TOKEN} secret=${CLIENT_SECRET}`, {
          url: `https://gw/?secret=${CLIENT_SECRET}`,
          nested: { deep: [TOKEN, CLIENT_SECRET] },
        }),
    ],
    [
      "NetworkError",
      () =>
        new NetworkError(`failed: Authorization: Bearer ${TOKEN}`, {
          headers: { authorization: `Bearer ${TOKEN}`, secret: CLIENT_SECRET },
        }),
    ],
    [
      "GatewayError",
      () =>
        new GatewayError(`rejected ${CLIENT_SECRET}`, {
          rCode: 100,
          response: { token: TOKEN, secret: CLIENT_SECRET },
          requestId: TOKEN,
        }),
    ],
    ["TokenMismatchError", () => new TokenMismatchError(`mismatch on ${TOKEN}`)],
    [
      "ValidationError",
      () =>
        new ValidationError(`amount ${CLIENT_SECRET} invalid`, "amount", TOKEN),
    ],
    ["PollTimeoutError", () => new PollTimeoutError(`timed out ${TOKEN}`, 1000)],
    ["RateLimitError", () => new RateLimitError(`429 for ${CLIENT_SECRET}`, null)],
  ];

  for (const [name, make] of constructors) {
    it(`${name}: message and details never contain the bearer token or client secret`, () => {
      const err = make();
      const serialized = `${err.message}|${JSON.stringify(err.details)}`;
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain(CLIENT_SECRET);
      expect(serialized).not.toContain("secret-payload");
    });

    it(`${name}: message contains [REDACTED] where secrets were`, () => {
      const err = make();
      expect(err.message).toContain("[REDACTED]");
    });
  }

  it("GatewayError details contain [REDACTED] in place of secrets", () => {
    const err = new GatewayError("rejected", {
      response: { token: TOKEN, secret: CLIENT_SECRET },
    });
    const serialized = JSON.stringify(err.details);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(CLIENT_SECRET);
  });

  it("redacts secrets registered after subclass construction sites too", () => {
    clearSecrets();
    const err = new MpaisaError("X", "plain");
    expect(err.message).toBe("plain");
    registerSecrets(CLIENT_SECRET);
    const err2 = new MpaisaError("X", `value ${CLIENT_SECRET}`);
    expect(err2.message).not.toContain(CLIENT_SECRET);
  });

  it("ignores short secrets that would cause useless redaction", () => {
    registerSecrets("ab", CLIENT_SECRET);
    const err = new MpaisaError("X", `contains ab and ${CLIENT_SECRET}`);
    expect(err.message).toContain("ab");
    expect(err.message).not.toContain(CLIENT_SECRET);
  });
});

describe("ResponseCode enum", () => {
  it("maps all 16 documented codes", () => {
    expect(Object.keys(ResponseCode)).toHaveLength(16);
  });

  it("pins the codes confirmed by tickets/fixtures", () => {
    expect(ResponseCode.PENDING).toBe(100);
    expect(ResponseCode.SUCCESS).toBe(101);
    expect(ResponseCode.CANCELLED).toBe(112);
    expect(responseCodeLabel(113)).toBeTruthy();
    expect(ResponseCode.TOO_MANY_ATTEMPTS).toBe(155);
  });

  it("labels every documented code with a non-empty string", () => {
    for (const value of Object.values(ResponseCode)) {
      expect(responseCodeLabel(value)).toMatch(/\S/);
    }
  });

  it("returns UNKNOWN label for undocumented codes", () => {
    expect(responseCodeLabel(999)).toBe("UNKNOWN");
  });
});
