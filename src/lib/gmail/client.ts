const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_ATTEMPTS = 4;
const RETRY_JITTER_MS = 100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(label: string, fn: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const response = await fn();

    if (response.ok) return response;

    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${label} failed: ${response.status}`);
    }

    if (attempt === RETRY_MAX_ATTEMPTS - 1) {
      throw new Error(`${label} failed after ${RETRY_MAX_ATTEMPTS} attempts: ${response.status}`);
    }

    const retryAfter = response.headers.get('Retry-After');
    let delayMs =
      retryAfter && !isNaN(parseInt(retryAfter))
        ? parseInt(retryAfter) * 1000
        : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

    delayMs += Math.random() * RETRY_JITTER_MS * 2 - RETRY_JITTER_MS;

    await sleep(delayMs);
  }

  throw new Error(`${label} failed after ${RETRY_MAX_ATTEMPTS} attempts`);
}

export interface GmailPart {
  filename?: string;
  mimeType: string;
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: GmailPart[];
  };
  internalDate: string;
}

export interface GmailThread {
  id: string;
  messages: GmailMessage[];
}

export async function getThreadList(
  accessToken: string,
  options: { maxResults: number; pageToken?: string },
): Promise<{ threads: { id: string }[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: String(options.maxResults) });
  if (options.pageToken) params.set('pageToken', options.pageToken);

  const res = await withRetry('getThreadList', () =>
    fetch(`${GMAIL_BASE}/threads?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  const data = (await res.json()) as { threads?: { id: string }[]; nextPageToken?: string };
  return {
    threads: data.threads ?? [],
    nextPageToken: data.nextPageToken,
  };
}

export async function getThread(accessToken: string, threadId: string): Promise<GmailThread> {
  const params = new URLSearchParams({
    format: 'metadata',
    metadataHeaders: 'Subject',
  });
  params.append('metadataHeaders', 'From');
  params.append('metadataHeaders', 'Date');

  const res = await withRetry(`getThread ${threadId}`, () =>
    fetch(`${GMAIL_BASE}/threads/${threadId}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );

  return (await res.json()) as GmailThread;
}
