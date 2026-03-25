import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export interface InboxThread {
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  timestamp: Date;
  isUnread: boolean;
  messageCount: number;
  bucketId: number | null;
  bucketName: string | null;
  bucketColor: string | null;
  classificationTier: number | null;
  confidence: number | null;
  securityFlags: string[];
  urgencyScore: number | null;
}

export async function getInboxThreads(userId: number): Promise<InboxThread[]> {
  try {
    const rows = await db
      .select({
        threadId: classifications.threadId,
        subject: classifications.subject,
        senderName: classifications.senderName,
        senderEmail: classifications.senderEmail,
        snippet: classifications.snippet,
        timestamp: classifications.timestamp,
        isUnread: classifications.isUnread,
        messageCount: classifications.messageCount,
        bucketId: classifications.bucketId,
        bucketName: buckets.name,
        bucketColor: buckets.color,
        classificationTier: classifications.classificationTier,
        confidence: classifications.confidence,
        securityFlags: classifications.securityFlags,
        urgencyScore: classifications.urgencyScore,
      })
      .from(classifications)
      .leftJoin(buckets, eq(classifications.bucketId, buckets.id))
      .where(eq(classifications.userId, userId))
      .orderBy(desc(classifications.timestamp));

    return rows.map((row) => ({
      threadId: row.threadId,
      subject: row.subject,
      senderName: row.senderName,
      senderEmail: row.senderEmail,
      snippet: row.snippet,
      timestamp: row.timestamp,
      isUnread: row.isUnread,
      messageCount: row.messageCount,
      bucketId: row.bucketId ?? null,
      bucketName: row.bucketName ?? null,
      bucketColor: row.bucketColor ?? null,
      classificationTier: row.classificationTier ?? null,
      confidence: row.confidence ?? null,
      securityFlags: row.securityFlags ?? [],
      urgencyScore: row.urgencyScore ?? null,
    }));
  } catch (error) {
    console.error('getInboxThreads failed:', error);
    return [];
  }
}
