import { eq } from 'drizzle-orm';
import { GoogleGenerativeAI, SchemaType, FunctionCallingMode, type FunctionDeclarationSchema } from '@google/generative-ai';
import { db } from '@/lib/db';
import { buckets, categoryExemplars, aiUsage } from '@/lib/db/schema';
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

export interface EnrichResult {
  enrichedDescription: string;
  boundaryNotes: string;
  exemplarVectors: number[][];
  exemplarTexts: string[];
  // Overlap is a warning only — exemplars are always returned regardless.
  overlapping: boolean;
  conflictingBucketName?: string;
  similarity?: number;
}

export async function enrichBucket(
  name: string,
  description: string,
  userId: number,
  skipOverlapCheck = false,
): Promise<EnrichResult> {
  console.log(`[enrichBucket] starting for bucket: "${name}" userId=${userId} skipOverlapCheck=${skipOverlapCheck}`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const parameters: FunctionDeclarationSchema = {
    type: SchemaType.OBJECT,
    properties: {
      enrichedDescription: { type: SchemaType.STRING },
      boundaryNotes: { type: SchemaType.STRING },
      exemplarTexts: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    },
    required: ['enrichedDescription', 'boundaryNotes', 'exemplarTexts'],
  };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ functionDeclarations: [{ name: 'enrich_bucket', description: 'Generate enriched description, boundary notes, and exemplar emails for a bucket.', parameters }] }],
  });

  const prompt =
    `You are helping configure an AI email classifier. Given a bucket name and short description, generate:
(1) an enriched description that is semantically detailed enough to embed accurately
(2) boundary notes explaining what belongs vs what doesn't
(3) 3-5 realistic example emails that would clearly belong in this bucket

Each example email MUST follow this exact format:
[SUBJECT] {subject line} [FROM] {sender name} <{sender email}> [PREVIEW] {1-2 sentence preview}

Make the examples specific and realistic — use real-sounding sender names, email addresses, and preview text.

Bucket name: ${name}
Description: ${description}`;

  console.log('[enrichBucket] calling Gemini...');
  const result = await withRetry(
    () => model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ['enrich_bucket'] } },
    }),
    2,
  );
  console.log('[enrichBucket] Gemini response received');

  const usage = result.response.usageMetadata;
  const cost = ((usage?.promptTokenCount ?? 0) / 1_000_000) * 0.10 + ((usage?.candidatesTokenCount ?? 0) / 1_000_000) * 0.40;
  await db.insert(aiUsage).values({
    userId,
    model: 'gemini-2.5-flash',
    operation: 'enrich_bucket',
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? null,
    estimatedCost: cost,
  }).catch((err) => console.error('[enrichBucket] Failed to log aiUsage:', err));

  const calls = result.response.functionCalls();
  if (!calls || calls.length === 0) throw new Error('Gemini enrichment failed: no function call returned');
  const { enrichedDescription, boundaryNotes, exemplarTexts } = calls[0].args as {
    enrichedDescription: string;
    boundaryNotes: string;
    exemplarTexts: string[];
  };

  console.log('[enrichBucket] embedding exemplars...');
  const exemplarVectors = await batchEmbed(exemplarTexts, userId);
  console.log('[enrichBucket] embedding complete:', exemplarVectors.length, 'vectors');
  const newCentroid = centroid(exemplarVectors);

  let overlapResult: { conflictingBucketName: string; similarity: number } | null = null;

  console.log('[enrichBucket] running overlap check...');
  if (!skipOverlapCheck) {
    const existingBuckets = await db
      .select({ id: buckets.id, name: buckets.name })
      .from(buckets)
      .where(eq(buckets.userId, userId));

    console.log(`[enrichBucket] checking overlap against ${existingBuckets.length} existing buckets`);

    for (const bucket of existingBuckets) {
      const exemplarRows = await db
        .select({ embedding: categoryExemplars.embedding })
        .from(categoryExemplars)
        .where(eq(categoryExemplars.bucketId, bucket.id));

      const validVectors = exemplarRows
        .map((r) => r.embedding)
        .filter((e): e is number[] => Array.isArray(e) && e.length > 0);

      if (validVectors.length === 0) continue;
      const bucketCentroid = centroid(validVectors);
      if (bucketCentroid.length === 0) continue;
      const similarity = cosine(newCentroid, bucketCentroid);
      console.log(`[enrichBucket] similarity with "${bucket.name}": ${similarity.toFixed(4)}`);
      if (similarity > 0.88) {
        overlapResult = { conflictingBucketName: bucket.name, similarity };
        break;
      }
    }
  }
  console.log('[enrichBucket] overlap check complete');

  console.log('[enrichBucket] returning result');
  return {
    overlapping: !!overlapResult,
    conflictingBucketName: overlapResult?.conflictingBucketName,
    similarity: overlapResult?.similarity,
    enrichedDescription,
    boundaryNotes,
    exemplarVectors,
    exemplarTexts,
  };
}
