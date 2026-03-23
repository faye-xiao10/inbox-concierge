import { db } from '@/lib/db';
import { classifications } from '@/lib/db/schema';
import type { Bucket } from '@/lib/db/schema/buckets';
import fixtures from '@/fixtures/demo-threads.json';

type FixtureThread = (typeof fixtures)[number];

function buildBucketMap(bucketRows: Bucket[]): Map<string, number> {
  return new Map(bucketRows.map((b) => [b.name, b.id]));
}

function toInsertRow(
  thread: FixtureThread,
  userId: number,
  bucketMap: Map<string, number>,
) {
  // Destructure out the non-DB field
  const { bucketName, timestamp, ...rest } = thread;
  const bucketId = bucketMap.get(bucketName) ?? null;

  return {
    ...rest,
    userId,
    bucketId,
    timestamp: new Date(timestamp),
    embedding: null,
  };
}

export async function seedDemoUser(
  userId: number,
  bucketRows: Bucket[],
): Promise<void> {
  try {
    const bucketMap = buildBucketMap(bucketRows);
    const rows = fixtures.map((thread) =>
      toInsertRow(thread, userId, bucketMap),
    );

    await db.insert(classifications).values(rows).onConflictDoNothing();
  } catch (error) {
    throw new Error(`Failed to seed demo user: ${String(error)}`);
  }
}
