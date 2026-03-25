import { getSession } from '@/lib/session';
import { getGraphData } from '@/lib/inbox/get-graph-data';

export async function GET(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const nodes = await getGraphData(session.userId);
  return new Response(JSON.stringify(nodes), {
    headers: { 'Content-Type': 'application/json' },
  });
}
