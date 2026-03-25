import { db } from '@/lib/db';
import { aiUsage } from '@/lib/db/schema';
import { withRetry } from '@/lib/utils/retry';

const EMBEDDING_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents';
const EXPECTED_DIMS = 384;

export interface EmbedThreadInput {
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  messageCount: number;
}

export function buildEmbeddingInput(thread: EmbedThreadInput): string {
  return (
    `[SUBJECT] ${thread.subject} ` +
    `[FROM] ${thread.senderName} <${thread.senderEmail}> ` +
    `[PREVIEW] ${thread.snippet} ` +
    `[MESSAGES] ${thread.messageCount} messages`
  );
}

interface EmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const body = {
    requests: texts.map((text) => ({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      outputDimensionality: EXPECTED_DIMS,
      taskType: 'RETRIEVAL_DOCUMENT',
    })),
  };

  const response = await fetch(`${EMBEDDING_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = new Error(`Gemini API error: ${response.status} ${response.statusText}`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  const data = (await response.json()) as EmbedResponse;

  if (!data.embeddings || !Array.isArray(data.embeddings)) {
    throw new Error('Gemini response missing embeddings array');
  }
  if (data.embeddings.length !== texts.length) {
    throw new Error(
      `Gemini returned ${data.embeddings.length} embeddings, expected ${texts.length}`,
    );
  }

  return data.embeddings.map((emb, i) => {
    if (!emb.values || !Array.isArray(emb.values)) {
      throw new Error(`Gemini embedding[${i}] has no values array`);
    }
    if (emb.values.length !== EXPECTED_DIMS) {
      throw new Error(
        `Gemini embedding[${i}] has ${emb.values.length} dims, expected ${EXPECTED_DIMS}`,
      );
    }
    const hasInvalid = emb.values.some((v) => typeof v !== 'number' || isNaN(v));
    if (hasInvalid) {
      throw new Error(`Gemini embedding[${i}] contains non-numeric or NaN values`);
    }
    return emb.values;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function batchEmbed(
  texts: string[],
  userId: number,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 100) {
    throw new Error(`batchEmbed accepts up to 100 texts, got ${texts.length}`);
  }

  const vectors = await withRetry(() => fetchEmbeddings(texts), 4, 5000);

  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  try {
    await db.insert(aiUsage).values({
      userId,
      model: 'gemini-embedding-001',
      operation: 'embed',
      inputTokens: Math.ceil(totalChars / 4),
      outputTokens: null,
      estimatedCost: 0,
    });
  } catch (logError) {
    console.error('Failed to log aiUsage for embedding:', logError);
  }

  return vectors;
}
