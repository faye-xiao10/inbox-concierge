import { getSession } from '@/lib/session';
import { getValidAccessToken } from '@/lib/google/auth';
import { runPipeline, type PipelineEvent, type PipelineMode } from '@/lib/pipeline/orchestrator';

export async function POST(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

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
          false,
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
