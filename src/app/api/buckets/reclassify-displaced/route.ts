import { getSession } from '@/lib/session';
import { runReclassifyDisplaced } from '@/lib/pipeline/reclassify';
import type { PipelineEvent } from '@/lib/pipeline/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let threadIds: string[] = [];
  try { const body = await request.json() as { threadIds?: string[] }; threadIds = body.threadIds ?? []; } catch { /* empty */ }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };
      try {
        await runReclassifyDisplaced(session.userId, threadIds, emit);
      } catch (error) {
        emit({ type: 'error', message: String(error), stage: 'reclassify-displaced' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
