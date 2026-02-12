// services/totpService.ts
// Real TOTP (RFC 6238) implementation using Web Crypto API
// Compatible with Google Authenticator, Microsoft Authenticator, Authy, etc.

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a cryptographically random Base32 secret (160-bit / 20 bytes)
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Generate an otpauth:// URI for QR code generation
 * User scans this QR code with their authenticator app
 */
export function generateTotpUri(
  secret: string,
  email: string,
  issuer: string = 'EU Intervention Logic'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate current TOTP code from a Base32 secret
 */
export async function generateTotpCode(secret: string): Promise<string> {
  const timeStep = Math.floor(Date.now() / 1000 / 30);
  return await computeHotpCode(secret, timeStep);
}

/**
 * Verify a TOTP code with a time window tolerance of ±1 step (90 seconds total)
 * Returns true if the code matches any of the 3 time windows
 */
export async function verifyTotpCode(
  secret: string,
  code: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000 / 30);

  // Check current step and ±1 step to handle clock drift
  for (let offset = -1; offset <= 1; offset++) {
    const expected = await computeHotpCode(secret, now + offset);
    if (timingSafeEqual(code, expected)) {
      return true;
    }
  }
  return false;
}

// ─── Internal helpers ────────────────────────────────────────────

/**
 * Compute a single HOTP code (RFC 4226) for a given counter value
 */
async function computeHotpCode(base32Secret: string, counter: number): Promise<string> {
  // 1. Decode Base32 secret to raw bytes
  const keyBytes = base32Decode(base32Secret);

  // 2. Import key for HMAC-SHA1
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // 3. Convert counter to 8-byte big-endian buffer
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(0, Math.floor(counter / 0x100000000), false);
  counterView.setUint32(4, counter & 0xffffffff, false);

  // 4. HMAC-SHA1
  const hmacResult = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmacBytes = new Uint8Array(hmacResult);

  // 5. Dynamic truncation (RFC 4226 Section 5.4)
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  // 6. Modulo 10^6 for 6-digit code
  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Base32 encode (RFC 4648)
 */
function base32Encode(bytes: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * Base32 decode (RFC 4648)
 */
function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(output);
}

/**
 * Constant-time string comparison to mitigate timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
