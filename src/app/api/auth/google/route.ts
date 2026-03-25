import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google/auth';

export async function GET(req: Request): Promise<Response> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET is not set');

    // Generate random nonce and sign it to create CSRF state
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = Buffer.from(nonceBytes).toString('base64url');

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonce));
    const sig = Buffer.from(sigBuf).toString('base64url');
    const state = `${nonce}.${sig}`;

    const origin = new URL(req.url).origin;
    const redirectUrl = buildAuthUrl(state);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('Google OAuth init failed:', error);
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(new URL('/?error=auth_failed', origin));
  }
}
