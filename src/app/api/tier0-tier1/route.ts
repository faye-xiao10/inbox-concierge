// dev endpoint — remove before prod
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { runTier0AndTier1 } from '@/lib/pipeline/tier0-tier1';

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // To re-run after a hotfix, manually reset via Neon console:
  // UPDATE classifications SET bucket_id = NULL, classification_tier = NULL, confidence = NULL
  // WHERE classification_tier IN (0, 1);
  try {
    const summary = await runTier0AndTier1(session.userId);
    console.warn('Tier 0/1 classification complete:', summary);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: `Tier 0/1 classification failed: ${String(error)}` },
      { status: 500 },
    );
  }
}
