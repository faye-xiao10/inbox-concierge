import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Encryption helpers (AES-GCM, key derived from SESSION_SECRET via PBKDF2)
// ---------------------------------------------------------------------------

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('inbox-concierge-oauth'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const ab = buf instanceof Uint8Array ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
  return Buffer.from(ab as ArrayBuffer).toString('base64url');
}

function fromBase64Url(str: string): ArrayBuffer {
  const buf = Buffer.from(str, 'base64url');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
}

async function decrypt(encoded: string): Promise<string> {
  const [ivPart, cipherPart] = encoded.split('.');
  if (!ivPart || !cipherPart) throw new Error('Invalid encrypted value format');

  const key = await getKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(ivPart) },
    key,
    fromBase64Url(cipherPart),
  );
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// OAuth URL builder
// ---------------------------------------------------------------------------

export function buildAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');

  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_URL is not set');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/callback`,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ---------------------------------------------------------------------------
// Code exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface UserInfoResponse {
  email: string;
  name: string;
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
  name: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error('Missing Google OAuth environment variables');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${baseUrl}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status}`);
  }

  const tokenData = (await tokenRes.json()) as TokenResponse;

  if (!tokenData.refresh_token) {
    throw new Error('No refresh token returned — ensure prompt=consent is set');
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error(`Userinfo fetch failed: ${userRes.status}`);
  }

  const userInfo = (await userRes.json()) as UserInfoResponse;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    email: userInfo.email,
    name: userInfo.name,
  };
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(userId: number): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth environment variables');
  }

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw new Error(`User ${userId} not found`);

  const refreshToken = await decrypt(user.googleRefreshToken);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  const encryptedAccess = await encrypt(data.access_token);
  await db
    .update(users)
    .set({ googleAccessToken: encryptedAccess, tokenExpiresAt: expiresAt })
    .where(eq(users.id, userId));

  return data.access_token;
}

// ---------------------------------------------------------------------------
// Valid token getter (the only function that returns plaintext)
// ---------------------------------------------------------------------------

export async function getValidAccessToken(userId: number): Promise<string> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw new Error(`User ${userId} not found`);

  const fiveMinutes = 5 * 60 * 1000;
  const isExpired =
    !user.tokenExpiresAt || user.tokenExpiresAt.getTime() - Date.now() < fiveMinutes;

  if (isExpired) {
    return refreshAccessToken(userId);
  }

  return decrypt(user.googleAccessToken);
}

// ---------------------------------------------------------------------------
// Encrypt helpers exported for use in auth routes
// ---------------------------------------------------------------------------

export { encrypt, decrypt };
