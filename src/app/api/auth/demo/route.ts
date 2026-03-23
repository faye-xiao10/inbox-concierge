import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { seedDefaultBuckets } from '@/lib/db/seed-buckets';
import { seedDemoUser } from '@/lib/db/seed-demo';
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/session';

const DEMO_EMAIL = 'demo@inboxconcierge.app';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const origin = new URL(request.url).origin;

    // Find or create demo user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, DEMO_EMAIL))
      .limit(1);

    let user = existing[0];

    if (!user) {
      const inserted = await db
        .insert(users)
        .values({
          email: DEMO_EMAIL,
          name: 'Demo User',
          isDemo: true,
          googleAccessToken: '',
          googleRefreshToken: '',
        })
        .returning();
      user = inserted[0];
    }

    // Seed buckets then threads
    const bucketRows = await seedDefaultBuckets(user.id);
    await seedDemoUser(user.id, bucketRows);

    // Issue session cookie
    const token = await signSession({
      userId: user.id,
      email: user.email,
      isDemo: true,
    });

    const response = NextResponse.redirect(new URL('/inbox', origin));
    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error('Demo setup failed:', error);
    return NextResponse.json(
      { error: 'Demo setup failed' },
      { status: 500 },
    );
  }
}
