// dev endpoint — remove before prod
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { bootstrapExemplars } from '@/lib/pipeline/bootstrap-exemplars';
import { runTier2 } from '@/lib/pipeline/tier2';

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { created: exemplarsCreated, skipped: exemplarsSkipped } =
      await bootstrapExemplars(session.userId);

    const { classified, flaggedForTier3 } = await runTier2(session.userId);

    return NextResponse.json({
      exemplarsCreated,
      exemplarsSkipped,
      classified,
      flaggedForTier3,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Tier 2 classification failed: ${String(error)}` },
      { status: 500 },
    );
  }
}
