import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, categoryExemplars, buckets, reclassificationLog } from '@/lib/db/schema';
import { classifyBatchWithFallback, type EmailBatchItem, type BucketContext } from './llm-classify';
import type { PipelineEvent } from './orchestrator';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function bestSim(embedding: number[], exemplarsByBucket: Map<number, number[][]>, bucketId: number): number {
  const exemplars = exemplarsByBucket.get(bucketId);
  if (!exemplars || exemplars.length === 0) return 0;
  let best = 0;
  for (const ex of exemplars) {
    const sim = cosineSimilarity(embedding, ex);
    if (sim > best) best = sim;
  }
  return best;
}

type EmailRow = {
  id: number;
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  securityFlags: string[];
  bucketId: number | null;
  embedding: unknown;
  confidence: number | null;
};

export async function runReclassification(
  userId: number,
  newBucketId: number,
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  const emails = await db
    .select({
      id: classifications.id,
      threadId: classifications.threadId,
      subject: classifications.subject,
      senderName: classifications.senderName,
      senderEmail: classifications.senderEmail,
      snippet: classifications.snippet,
      securityFlags: classifications.securityFlags,
      bucketId: classifications.bucketId,
      embedding: classifications.embedding,
      confidence: classifications.confidence,
    })
    .from(classifications)
    .where(and(eq(classifications.userId, userId), isNotNull(classifications.embedding)));

  const bucketRows = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  // Bulk-fetch all exemplars for this user once — no per-email DB calls
  const exemplarRows = await db
    .select({
      bucketId: categoryExemplars.bucketId,
      embedding: categoryExemplars.embedding,
    })
    .from(categoryExemplars)
    .innerJoin(buckets, eq(categoryExemplars.bucketId, buckets.id))
    .where(eq(buckets.userId, userId));

  // Build in-memory index: bucketId → list of embedding vectors
  const exemplarsByBucket = new Map<number, number[][]>();
  for (const row of exemplarRows) {
    if (!Array.isArray(row.embedding)) continue;
    const list = exemplarsByBucket.get(row.bucketId) ?? [];
    list.push(row.embedding as number[]);
    exemplarsByBucket.set(row.bucketId, list);
  }

  const bucketContexts: BucketContext[] = bucketRows;
  const directBucketId = bucketRows.find((b) => b.name === 'Direct')?.id ?? null;
  const newBucketRow = bucketRows.find((b) => b.id === newBucketId);
  const newBucketName = newBucketRow?.name ?? '';
  const newBucketDescription = newBucketRow?.enrichedDescription ?? newBucketRow?.description ?? '';
  const isNewBucketDirect = newBucketId === directBucketId;

  const bucketNameById = Object.fromEntries(bucketRows.map((b) => [b.id, b.name]));

  let movedCount = 0;
  let tier3Count = 0;
  const tier3Candidates: EmailRow[] = [];

  const t0 = Date.now();

  // Evaluate emails in batches of 20 using in-memory similarity — zero DB calls per email
  for (const batch of chunk(emails as EmailRow[], 20)) {
    const writeOps: Promise<unknown>[] = [];

    for (const email of batch) {
      if (!Array.isArray(email.embedding) || email.bucketId === newBucketId) continue;

      const newSim = bestSim(email.embedding as number[], exemplarsByBucket, newBucketId);
      const currentSim = email.bucketId !== null
        ? bestSim(email.embedding as number[], exemplarsByBucket, email.bucketId)
        : 0;
      const margin = newSim - currentSim;

      const currentBucketName = email.bucketId !== null ? (bucketNameById[email.bucketId] ?? null) : null;
      const isCurrentlyDirect = currentBucketName === 'Direct';

      const requiredConfidence = isCurrentlyDirect ? 0.80 : 0.65;
      const requiredMargin = isCurrentlyDirect ? 0.30 : 0.08;
      const tier3Threshold = isNewBucketDirect ? 0.80 : 0.55;

      if (newSim > requiredConfidence && margin > requiredMargin) {
        writeOps.push(
          db.update(classifications)
            .set({ bucketId: newBucketId, classificationTier: 2, confidence: newSim })
            .where(eq(classifications.id, email.id)),
        );
        if (email.bucketId) {
          writeOps.push(
            db.insert(reclassificationLog).values({
              classificationId: email.id,
              fromBucketId: email.bucketId,
              toBucketId: newBucketId,
              source: 'custom_bucket',
            }),
          );
        }
        onEvent({ type: 'classification_result', threadId: email.threadId, bucketId: newBucketId, tier: 2, confidence: newSim });
        movedCount++;
      } else if (margin > 0.05 && newSim > 0.50 && !isCurrentlyDirect) {
        tier3Candidates.push(email);
      }
    }

    await Promise.allSettled(writeOps);
  }

  console.log(`[reclassify] evaluated ${emails.length} emails in ${Date.now() - t0}ms`);
  console.log(`[reclassify] tier3 candidates: ${tier3Candidates.length} of ${emails.length}`);

  // Tier 3: sequential batches (LLM rate limits)
  const batches = chunk(tier3Candidates, 12);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onEvent({ type: 'tier3_progress', current: (i + 1) * batch.length, total: tier3Candidates.length, batchNumber: i + 1 });

    const batchItems: EmailBatchItem[] = batch.map((c) => ({
      threadId: c.threadId, subject: c.subject, senderName: c.senderName,
      senderEmail: c.senderEmail, snippet: c.snippet, securityFlags: c.securityFlags,
    }));

    const reclassifyContext = newBucketName
      ? `The user has just created a new bucket called "${newBucketName}" with this description:\n"${newBucketDescription}"\n\nYou are evaluating whether emails currently in other buckets should move to this new bucket. Be willing to move emails that clearly match the new bucket's purpose, even if they also loosely fit their current bucket. The user created this bucket specifically to organize these kinds of emails.`
      : undefined;

    const results = await classifyBatchWithFallback(batchItems, bucketContexts, userId, reclassifyContext);
    await Promise.allSettled(
      results
        .filter((r) => r.bucketId === newBucketId)
        .map((r) => {
          const candidate = batch.find((c) => c.threadId === r.threadId);
          if (!candidate) return Promise.resolve();
          movedCount++;
          tier3Count++;
          onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: newBucketId, tier: 3, confidence: r.confidence });
          return db.update(classifications)
            .set({ bucketId: newBucketId, classificationTier: 3, confidence: r.confidence, llmReasoning: r.reasoning })
            .where(eq(classifications.id, candidate.id));
        }),
    );
  }

  onEvent({ type: 'reclassify_complete', movedCount, tier3Count });
}

function bestBucketAcrossAll(
  embedding: number[],
  exemplarsByBucket: Map<number, number[][]>,
): { bucketId: number; sim: number; margin: number } | null {
  let bestBucketId: number | null = null;
  let best = 0;
  let secondBest = 0;

  for (const [bucketId, exemplars] of exemplarsByBucket) {
    let bucketBest = 0;
    for (const ex of exemplars) {
      const sim = cosineSimilarity(embedding, ex);
      if (sim > bucketBest) bucketBest = sim;
    }
    if (bucketBest > best) {
      secondBest = best;
      best = bucketBest;
      bestBucketId = bucketId;
    } else if (bucketBest > secondBest) {
      secondBest = bucketBest;
    }
  }

  if (bestBucketId === null) return null;
  return { bucketId: bestBucketId, sim: best, margin: best - secondBest };
}

export async function runReclassifyDisplaced(
  userId: number,
  threadIds: string[],
  onEvent: (event: PipelineEvent) => void,
): Promise<void> {
  if (threadIds.length === 0) { onEvent({ type: 'reclassify_complete', movedCount: 0, tier3Count: 0 }); return; }

  const threadIdSet = new Set(threadIds);

  const allEmails = await db
    .select({
      id: classifications.id,
      threadId: classifications.threadId,
      subject: classifications.subject,
      senderName: classifications.senderName,
      senderEmail: classifications.senderEmail,
      snippet: classifications.snippet,
      securityFlags: classifications.securityFlags,
      bucketId: classifications.bucketId,
      embedding: classifications.embedding,
      confidence: classifications.confidence,
    })
    .from(classifications)
    .where(and(eq(classifications.userId, userId), isNotNull(classifications.embedding)));

  const emails = (allEmails as EmailRow[]).filter(
    (e) => threadIdSet.has(e.threadId) && Array.isArray(e.embedding),
  );

  const bucketRows = await db
    .select({ id: buckets.id, name: buckets.name, description: buckets.description, enrichedDescription: buckets.enrichedDescription })
    .from(buckets)
    .where(eq(buckets.userId, userId));

  const exemplarRows = await db
    .select({ bucketId: categoryExemplars.bucketId, embedding: categoryExemplars.embedding })
    .from(categoryExemplars)
    .innerJoin(buckets, eq(categoryExemplars.bucketId, buckets.id))
    .where(eq(buckets.userId, userId));

  const exemplarsByBucket = new Map<number, number[][]>();
  for (const row of exemplarRows) {
    if (!Array.isArray(row.embedding)) continue;
    const list = exemplarsByBucket.get(row.bucketId) ?? [];
    list.push(row.embedding as number[]);
    exemplarsByBucket.set(row.bucketId, list);
  }

  const bucketContexts: BucketContext[] = bucketRows;
  let movedCount = 0;
  let tier3Count = 0;
  const tier3Candidates: EmailRow[] = [];

  const t0 = Date.now();

  for (const batch of chunk(emails, 20)) {
    const writeOps: Promise<unknown>[] = [];

    for (const email of batch) {
      const match = bestBucketAcrossAll(email.embedding as number[], exemplarsByBucket);
      if (!match) continue;

      if (match.sim > 0.70 && match.margin > 0.15) {
        writeOps.push(
          db.update(classifications)
            .set({ bucketId: match.bucketId, classificationTier: 2, confidence: match.sim })
            .where(eq(classifications.id, email.id)),
        );
        onEvent({ type: 'classification_result', threadId: email.threadId, bucketId: match.bucketId, tier: 2, confidence: match.sim });
        movedCount++;
      } else if (match.sim > 0.50) {
        tier3Candidates.push(email);
      }
      // else: leave uncategorized, confidence too low
    }

    await Promise.allSettled(writeOps);
  }

  console.log(`[reclassify-displaced] evaluated ${emails.length} emails in ${Date.now() - t0}ms`);
  console.log(`[reclassify-displaced] tier3 candidates: ${tier3Candidates.length} of ${emails.length}`);

  const batches = chunk(tier3Candidates, 12);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    onEvent({ type: 'tier3_progress', current: (i + 1) * batch.length, total: tier3Candidates.length, batchNumber: i + 1 });

    const batchItems: EmailBatchItem[] = batch.map((c) => ({
      threadId: c.threadId, subject: c.subject, senderName: c.senderName,
      senderEmail: c.senderEmail, snippet: c.snippet, securityFlags: c.securityFlags,
    }));

    const results = await classifyBatchWithFallback(batchItems, bucketContexts, userId);
    await Promise.allSettled(
      results.map((r) => {
        const candidate = batch.find((c) => c.threadId === r.threadId);
        if (!candidate) return Promise.resolve();
        movedCount++;
        tier3Count++;
        onEvent({ type: 'classification_result', threadId: r.threadId, bucketId: r.bucketId, tier: 3, confidence: r.confidence });
        return db.update(classifications)
          .set({ bucketId: r.bucketId, classificationTier: 3, confidence: r.confidence, llmReasoning: r.reasoning })
          .where(eq(classifications.id, candidate.id));
      }),
    );
  }

  onEvent({ type: 'reclassify_complete', movedCount, tier3Count });
}
