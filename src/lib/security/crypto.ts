import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSensitive(value: string) {
  const { CONFIG_ENCRYPTION_KEY } = requireEnv("CONFIG_ENCRYPTION_KEY");
  return createHmac("sha256", CONFIG_ENCRYPTION_KEY).update(value).digest("hex");
}

export function verifyHmacSha256(payload: Buffer, signature: string, secret: string) {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function encryptionKey() {
  const { CONFIG_ENCRYPTION_KEY } = requireEnv("CONFIG_ENCRYPTION_KEY");
  const decoded = Buffer.from(CONFIG_ENCRYPTION_KEY, "base64");
  if (decoded.byteLength !== 32) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be 32 random bytes encoded as base64.");
  }
  return decoded;
}

export function encryptConfiguration(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]), iv, tag, ciphertext]).toString("base64");
}

export function decryptConfiguration<T>(encoded: string): T {
  const payload = Buffer.from(encoded, "base64");
  if (payload[0] !== 1 || payload.length < 30) throw new Error("Unsupported encrypted configuration.");
  const iv = payload.subarray(1, 13);
  const tag = payload.subarray(13, 29);
  const ciphertext = payload.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
