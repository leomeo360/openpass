const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(encodedKey: string): Promise<CryptoKey> {
  const material = base64ToBytes(encodedKey);
  if (material.byteLength !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", asArrayBuffer(material), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function generateVirtualKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `pk_live_${bytesToBase64(bytes).replace(/[+/=]/g, "").slice(0, 42)}`;
}

export async function encryptSecret(value: string, encodedKey: string): Promise<string> {
  const key = await importAesKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(value: string, encodedKey: string): Promise<string> {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) throw new Error("Malformed encrypted credential");
  const key = await importAesKey(encodedKey);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(ivValue)) },
    key,
    asArrayBuffer(base64ToBytes(cipherValue)),
  );
  return decoder.decode(plain);
}

export function keyIdentity(value: string): { prefix: string; last4: string } {
  return { prefix: value.slice(0, 12), last4: value.slice(-4) };
}
