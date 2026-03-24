import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface SessionPayload {
  userId: number;
  email: string;
  isDemo: boolean;
}

export const SESSION_COOKIE_NAME = 'session';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const { userId, email, isDemo } = payload as Record<string, unknown>;
    if (
      typeof userId !== 'number' ||
      typeof email !== 'string' ||
      typeof isDemo !== 'boolean'
    ) {
      return null;
    }
    return { userId, email, isDemo };
  } catch {
    return null;
  }
}

// For use in server components — reads from next/headers cookies()
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getSession(
  request: Request,
): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map((c) => {
      const eqIdx = c.indexOf('=');
      return [c.slice(0, eqIdx), c.slice(eqIdx + 1)];
    }),
  );

  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  return verifySession(token);
}
