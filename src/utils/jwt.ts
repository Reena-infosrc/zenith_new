/**
 * Minimal JWT helpers (no signature validation).
 * Used only for client-side expiry checks to decide whether to refresh tokens.
 */
export function isJwtNearExpiry(rawJwt: string, bufferSeconds: number = 60): boolean {
  try {
    const payloadPart = rawJwt.split(".")[1];
    if (!payloadPart) return true;

    // base64url -> base64 (pad to length multiple of 4)
    const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);

    const payload = JSON.parse(atob(padded));
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return true;

    const now = Math.floor(Date.now() / 1000);
    return exp < now + bufferSeconds;
  } catch {
    return true;
  }
}

