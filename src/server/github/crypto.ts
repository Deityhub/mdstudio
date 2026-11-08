// Seals GitHub access tokens before they are stored. AES-GCM with a key the operator sets
// (GH_TOKEN_KEY, 32 random bytes in base64). The account id is bound in as authenticated data,
// so a sealed token copied into another account's row does not open. Never log what comes out of
// openToken.
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The key from its base64 setting, or null when it is missing or not 32 bytes. */
export async function importTokenKey(value: string | undefined): Promise<CryptoKey | null> {
  if (!value) return null;
  try {
    const bytes = unb64(value.trim());
    if (bytes.length !== 32) return null;
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

const aad = (userId: string) => new TextEncoder().encode(userId);

/** `v1.<iv>.<ciphertext>`, both base64. */
export async function sealToken(key: CryptoKey, token: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(userId) },
    key,
    new TextEncoder().encode(token),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(data))}`;
}

/** The token, or null when the key, the account or the text is not the one it was sealed with. */
export async function openToken(key: CryptoKey, sealed: string, userId: string) {
  try {
    const [version, iv, data] = sealed.split(".");
    if (version !== "v1" || !iv || !data) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv), additionalData: aad(userId) },
      key,
      unb64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
