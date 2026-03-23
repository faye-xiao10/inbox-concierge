import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/', origin));
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
