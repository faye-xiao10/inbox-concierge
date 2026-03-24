import { eq, isNull, isNotNull, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';

const BUCKET_BASE: Record<string, number> = {
  Important: 0.7,
  'Can Wait': 0.3,
  Newsletters: 0.1,
  Promotions: 0.1,
  'Auto-Archive': 0.0,
};

const DEADLINE_REGEX = /urgent|asap|by end of day|due|deadline|expires/i;

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

function computeScore(
  bucketName: string,
  subject: string,
  snippet: string,
  isUnread: boolean,
  messageCount: number,
  isParticipant: boolean,
  timestamp: Date,
): number {
  let score = BUCKET_BASE[bucketName] ?? 0.3;
  const text = `${subject} ${snippet}`;
  if (DEADLINE_REGEX.test(text)) score += 0.2;
  if (text.includes('?')) score += 0.1;
  if (isUnread) score += 0.1;
  if (isToday(timestamp)) score += 0.1;
  if (messageCount > 5) score += 0.1;
  if (isParticipant) score += 0.15;
  return Math.min(1.0, score);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function runTriage(userId: number): Promise<{ scored: number }> {
  const rows = await db
    .select({
      id: classifications.id,
      subject: classifications.subject,
      snippet: classifications.snippet,
      isUnread: classifications.isUnread,
      messageCount: classifications.messageCount,
      isParticipant: classifications.isParticipant,
      timestamp: classifications.timestamp,
      bucketName: buckets.name,
    })
    .from(classifications)
    .innerJoin(buckets, eq(classifications.bucketId, buckets.id))
    .where(
      and(
        eq(classifications.userId, userId),
        isNotNull(classifications.bucketId),
        isNull(classifications.urgencyScore),
      ),
    );

  let scored = 0;

  for (const batch of chunk(rows, 50)) {
    await Promise.allSettled(
      batch.map((row) => {
        const urgencyScore = computeScore(
          row.bucketName,
          row.subject,
          row.snippet,
          row.isUnread,
          row.messageCount,
          row.isParticipant,
          row.timestamp,
        );
        scored++;
        return db
          .update(classifications)
          .set({ urgencyScore })
          .where(eq(classifications.id, row.id));
      }),
    );
  }

  return { scored };
}
