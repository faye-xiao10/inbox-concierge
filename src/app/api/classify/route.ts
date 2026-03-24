import { getSession } from '@/lib/session';
import { getValidAccessToken } from '@/lib/google/auth';
import { runPipeline, type PipelineEvent, type PipelineMode } from '@/lib/pipeline/orchestrator';

// Rate limiting for sync stage only: userId → last sync timestamp
const lastSyncTime = new Map<number, number>();
const SYNC_RATE_LIMIT_MS = 60_000;

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const now = Date.now();
  const lastSync = lastSyncTime.get(session.userId) ?? 0;
  const skipSync = now - lastSync < SYNC_RATE_LIMIT_MS;
  if (!skipSync) lastSyncTime.set(session.userId, now);

  let accessToken = '';
  if (!session.isDemo) {
    try {
      accessToken = await getValidAccessToken(session.userId);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not refresh access token' }), { status: 401 });
    }
  }

  const mode: PipelineMode = 'full';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };

      try {
        await runPipeline(
          session.userId,
          session.email,
          accessToken,
          session.isDemo,
          mode,
          skipSync,
          emit,
          request.signal,
        );
      } catch (error) {
        emit({ type: 'error', message: String(error), stage: 'unknown' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
