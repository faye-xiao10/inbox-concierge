// DEV ONLY — replaced by /api/classify SSE orchestrator in Step 11
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { syncGmailThreads } from '@/lib/gmail/sync';

export async function POST(req: Request): Promise<Response> {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { synced, skipped } = await syncGmailThreads(session.userId, session.email);
    return NextResponse.json({ synced, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
