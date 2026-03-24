import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { exchangeCode, encrypt } from '@/lib/google/auth';
import { seedDefaultBuckets } from '@/lib/db/seed-buckets';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    // Validate state: check HMAC signature
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET is not set');

    const [nonce, sig] = state.split('.');
    if (!nonce || !sig) throw new Error('Malformed state parameter');

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      Buffer.from(sig, 'base64url'),
      new TextEncoder().encode(nonce),
    );

    if (!isValid) throw new Error('State signature invalid');

    // Verify state matches cookie
    const cookieHeader = req.headers.get('cookie') ?? '';
    const cookieState = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('oauth_state='))
      ?.slice('oauth_state='.length);

    if (!cookieState || cookieState !== state) {
      throw new Error('State cookie mismatch');
    }

    // Exchange code for tokens
    const { accessToken, refreshToken, expiresAt, email, name } = await exchangeCode(code);

    // Encrypt tokens before storing
    const [encryptedAccess, encryptedRefresh] = await Promise.all([
      encrypt(accessToken),
      encrypt(refreshToken),
    ]);

    // Upsert user
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

    let userId: number;
    let isNewUser = false;

    if (existing[0]) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({
          name,
          googleAccessToken: encryptedAccess,
          googleRefreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
        })
        .where(eq(users.id, userId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          email,
          name,
          googleAccessToken: encryptedAccess,
          googleRefreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          isDemo: false,
        })
        .returning();
      userId = inserted[0].id;
      isNewUser = true;
    }

    // Seed default buckets for new users
    if (isNewUser) {
      await seedDefaultBuckets(userId);
    }

    // Issue session
    const token = await signSession({ userId, email, isDemo: false });

    const response = NextResponse.redirect(new URL('/inbox', origin));

    // Clear oauth_state cookie
    response.cookies.set('oauth_state', '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', origin));
  }
}
