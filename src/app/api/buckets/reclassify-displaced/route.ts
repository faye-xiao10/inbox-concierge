export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Gone' }), { status: 410 });
}
