import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buckets, categoryExemplars } from '@/lib/db/schema';
import { batchEmbed } from '@/lib/embed/gemini-embed';
import { withRetry } from '@/lib/utils/retry';

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const n = vectors[0].length;
  const sum = new Array<number>(n).fill(0);
  for (const v of vectors) for (let i = 0; i < n; i++) sum[i] += v[i];
  return sum.map((s) => s / vectors.length);
}

export type EnrichResult =
  | { overlapping: false; enrichedDescription: string; boundaryNotes: string; exemplarVectors: number[][]; exemplarTexts: string[] }
  | { overlapping: true; conflictingBucketName: string; similarity: number };

export async function enrichBucket(
  name: string,
  description: string,
  userId: number,
  skipOverlapCheck = false,
): Promise<EnrichResult> {
  const client = new Anthropic();
  const response = await withRetry(() =>
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system:
        `You are helping configure an AI email classifier. Given a bucket name and short description, generate:
(1) an enriched description that is semantically detailed enough to embed accurately
(2) boundary notes explaining what belongs vs what doesn't
(3) 3-5 realistic example emails that would clearly belong in this bucket

Each example email MUST follow this exact format:
[SUBJECT] {subject line} [FROM] {sender name} <{sender email}> [PREVIEW] {1-2 sentence preview}

Make the examples specific and realistic — use real-sounding sender names, email addresses, and preview text. These will be embedded and used for semantic similarity matching, so they must be representative of actual emails that belong in this bucket.`,
      messages: [{ role: 'user', content: `Bucket name: ${name}\nDescription: ${description}` }],
      tools: [{
        name: 'enrich_bucket',
        input_schema: {
          type: 'object' as const,
          properties: {
            enrichedDescription: { type: 'string' },
            boundaryNotes: { type: 'string' },
            exemplarTexts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
          },
          required: ['enrichedDescription', 'boundaryNotes', 'exemplarTexts'],
        },
      }],
      tool_choice: { type: 'tool', name: 'enrich_bucket' },
    }),
  );

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') throw new Error('LLM enrichment failed: no tool_use block');
  const { enrichedDescription, boundaryNotes, exemplarTexts } = toolBlock.input as {
    enrichedDescription: string;
    boundaryNotes: string;
    exemplarTexts: string[];
  };

  const exemplarVectors = await batchEmbed(exemplarTexts, userId);
  const newCentroid = centroid(exemplarVectors);

  if (!skipOverlapCheck) {
    const existingBuckets = await db
      .select({ id: buckets.id, name: buckets.name })
      .from(buckets)
      .where(eq(buckets.userId, userId));

    for (const bucket of existingBuckets) {
      const exemplarRows = await db
        .select({ embedding: categoryExemplars.embedding })
        .from(categoryExemplars)
        .where(eq(categoryExemplars.bucketId, bucket.id));

      const validVectors = exemplarRows
        .map((r) => r.embedding)
        .filter((e): e is number[] => Array.isArray(e));

      if (validVectors.length === 0) continue;
      const similarity = cosine(newCentroid, centroid(validVectors));
      if (similarity > 0.8) return { overlapping: true, conflictingBucketName: bucket.name, similarity };
    }
  }

  return { overlapping: false, enrichedDescription, boundaryNotes, exemplarVectors, exemplarTexts };
}
