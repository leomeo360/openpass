import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateVirtualKey, keyIdentity, sha256 } from "./crypto";
import { weightedCredentialOrder } from "../services";

describe("credential and virtual-key security primitives", () => {
  it("generates a URL-safe virtual key with an identifiable masked form", () => {
    const key = generateVirtualKey();
    expect(key).toMatch(/^pk_live_[A-Za-z0-9_-]{20,}$/);
    expect(keyIdentity(key)).toEqual({ prefix: key.slice(0, 12), last4: key.slice(-4) });
  });

  it("hashes the same virtual key deterministically", async () => {
    await expect(sha256("pk_live_test_key")).resolves.toBe(await sha256("pk_live_test_key"));
  });

  it("round-trips credentials with AES-GCM without retaining plaintext in ciphertext", async () => {
    const secret = "provider-secret-value";
    const encryptionKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const encrypted = await encryptSecret(secret, encryptionKey);
    expect(encrypted).not.toContain(secret);
    await expect(decryptSecret(encrypted, encryptionKey)).resolves.toBe(secret);
  });
});

describe("provider credential routing", () => {
  it("uses weights within a priority before falling back to lower priority credentials", () => {
    const credentials = [
      { id: "high", priority: 0, weight: 9 }, { id: "low", priority: 0, weight: 1 }, { id: "backup", priority: 10, weight: 1 },
    ] as Parameters<typeof weightedCredentialOrder>[0];
    expect(weightedCredentialOrder(credentials, () => 0.8).map((credential) => credential.id)).toEqual(["high", "low", "backup"]);
  });
});
