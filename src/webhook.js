// Campfire webhook signature check.
// Campfire signs `${timestamp}:${rawBody}` with HMAC-SHA256 (hex) using the
// webhook's secret token, sent in Campfire-Webhook-Signature-v1.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 5 * 60;

export function verifySignature({ secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (!secret || !timestamp || !signature) return { ok: false, reason: 'missing signature headers or secret' };

  const ts = Number(timestamp);
  // Accept seconds or milliseconds.
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (!Number.isFinite(ts) || Math.abs(now - tsMs) > TOLERANCE_SECONDS * 1000) {
    return { ok: false, reason: 'timestamp outside 5-minute window' };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}
