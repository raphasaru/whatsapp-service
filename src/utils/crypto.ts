import { createCipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypt a value using AES-256-GCM with the server ENCRYPTION_KEY.
 * Output format: base64(IV + ciphertext + authTag) — compatible with Web Crypto API decryption.
 */
export function encryptField(value: string, base64Key: string): string {
  const key = Buffer.from(base64Key, "base64");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Web Crypto API AES-GCM appends authTag to ciphertext, so we match that format:
  // IV (12) + ciphertext + authTag (16)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Encrypt known financial fields of a transaction before inserting into Supabase.
 */
export function encryptTransactionFields<T extends Record<string, unknown>>(
  row: T,
  base64Key: string
): T {
  const fields: Record<string, "number" | "string"> = {
    amount: "number",
    description: "string",
    notes: "string",
  };

  const result = { ...row };
  for (const field of Object.keys(fields)) {
    const value = result[field];
    if (value == null) continue;
    (result as Record<string, unknown>)[field] = encryptField(
      String(value),
      base64Key
    );
  }
  return result;
}
