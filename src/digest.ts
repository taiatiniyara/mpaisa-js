function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export interface DigestInput {
  merchantTid: string;
  amount: string;
  itemDetail: string;
  clientSecret: string;
  responseCode: string | number;
}

export async function computeAuthDigest(input: DigestInput): Promise<string> {
  const { merchantTid, amount, itemDetail, clientSecret, responseCode } = input;
  const concatenated = `${merchantTid}${amount}${itemDetail}${clientSecret}${responseCode}`;
  return (await sha256Hex(concatenated)).toUpperCase();
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function hashesEqual(
  computed: string,
  provided: string | undefined,
): boolean {
  if (!provided) return false;
  const received = provided.toUpperCase();
  return received.length === computed.length && constantTimeEqual(computed, received);
}
