import { eq, isNull, isNotNull, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, users } from '@/lib/db/schema';
import { buildEmbeddingInput, batchEmbed } from '@/lib/embed/gemini-embed';
import { runUmap } from '@/lib/embed/umap-runner';

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function embedThreads(
  userId: number,
  onProgress?: (current: number, total: number) => void,
): Promise<{ embedded: number; skipped: number; umapComplete: boolean }> {
  // Check demo mode — fixtures already have embeddings/UMAP coords
  const userRows = await db
    .select({ isDemo: users.isDemo })
    .from(users)
    .where(eq(users.id, userId));

  if (!userRows[0]) throw new Error(`User ${userId} not found`);
  if (userRows[0].isDemo) {
    return { embedded: 0, skipped: 0, umapComplete: true };
  }

  // Count already-embedded threads for skipped count
  const allThreads = await db
    .select({ threadId: classifications.threadId, embedding: classifications.embedding })
    .from(classifications)
    .where(eq(classifications.userId, userId));

  const skipped = allThreads.filter((t) => t.embedding !== null).length;

  // Fetch unembedded threads
  const unembedded = await db
    .select({
      threadId: classifications.threadId,
      subject: classifications.subject,
      senderName: classifications.senderName,
      senderEmail: classifications.senderEmail,
      snippet: classifications.snippet,
      messageCount: classifications.messageCount,
    })
    .from(classifications)
    .where(
      and(
        eq(classifications.userId, userId),
        isNull(classifications.embedding),
      ),
    );

  let embedded = 0;
  const totalToEmbed = unembedded.length;

  if (totalToEmbed > 0) {
    const batches = chunk(unembedded, 100);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      if (batchIdx > 0) await new Promise((resolve) => setTimeout(resolve, 5000));
      const inputs = batch.map((t) => buildEmbeddingInput(t));
      let vectors: number[][];

      try {
        vectors = await batchEmbed(inputs, userId);
      } catch (error) {
        throw new Error(`Embedding batch failed: ${String(error)}`);
      }

      const writeResults = await Promise.allSettled(
        batch.map((thread, i) =>
          db
            .update(classifications)
            .set({ embedding: vectors[i] })
            .where(
              and(
                eq(classifications.userId, userId),
                eq(classifications.threadId, thread.threadId),
              ),
            ),
        ),
      );

      for (const result of writeResults) {
        if (result.status === 'rejected') {
          console.error('Failed to write embedding:', result.reason);
        }
      }

      embedded += batch.length;
      onProgress?.(embedded, totalToEmbed);
    }
  }

  // UMAP: run on all embedded threads if any are missing coords
  let umapComplete = true;

  try {
    const embeddedRows = await db
      .select({
        threadId: classifications.threadId,
        embedding: classifications.embedding,
        umapX: classifications.umapX,
      })
      .from(classifications)
      .where(
        and(
          eq(classifications.userId, userId),
          isNotNull(classifications.embedding),
        ),
      );

    const needsUmap = embeddedRows.some((r) => r.umapX === null);
    if (!needsUmap) {
      return { embedded, skipped, umapComplete: true };
    }

    const vectors = embeddedRows
      .map((r) => r.embedding)
      .filter((e): e is number[] => e !== null);

    const coords = await runUmap(vectors);

    const allZeros = coords.every(([x, y]) => x === 0 && y === 0);
    if (allZeros && embeddedRows.length >= 4) {
      umapComplete = false;
    }

    const umapWriteResults = await Promise.allSettled(
      embeddedRows.map((row, i) => {
        const [x, y] = coords[i];
        return db
          .update(classifications)
          .set({ umapX: x, umapY: y })
          .where(
            and(
              eq(classifications.userId, userId),
              eq(classifications.threadId, row.threadId),
            ),
          );
      }),
    );

    const umapFailed = umapWriteResults.filter((r) => r.status === 'rejected');
    if (umapFailed.length > 0) {
      console.error(`Failed to write UMAP coords for ${umapFailed.length} rows`);
      umapComplete = false;
    }
  } catch (error) {
    console.error('UMAP step failed:', error);
    umapComplete = false;
  }

  return { embedded, skipped, umapComplete };
}
