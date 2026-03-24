// dev endpoint — remove before prod
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { embedThreads } from '@/lib/pipeline/embed-threads';

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await embedThreads(session.userId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `Embedding pipeline failed: ${String(error)}` },
      { status: 500 },
    );
  }
}
