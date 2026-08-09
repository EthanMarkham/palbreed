const PUBLIC_PREFIX = "palpath-source-v1:";

/**
 * Produces a domain-separated pseudonym for local platform account folder IDs.
 * Raw Xbox XUID/SCID and Steam account folder names must never leave the device.
 */
export async function pseudonymizeSourceAccountId(
  platform: "xbox" | "steam",
  sourceAccountId: string | undefined,
) {
  if (!sourceAccountId) return undefined;
  if (sourceAccountId.startsWith(PUBLIC_PREFIX)) return sourceAccountId;
  if (!globalThis.crypto?.subtle) return undefined;

  const input = new TextEncoder().encode(
    `palpath/local-save-account/v1\0${platform}\0${sourceAccountId}`,
  );
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input));
  return `${PUBLIC_PREFIX}${Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
