// dev endpoint — remove before prod
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { runTier3 } from '@/lib/pipeline/tier3';

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTier3(session.userId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `Tier 3 classification failed: ${String(error)}` },
      { status: 500 },
    );
  }
}
