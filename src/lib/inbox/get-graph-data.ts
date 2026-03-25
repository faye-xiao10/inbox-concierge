import { db } from '@/lib/db';
import { classifications, buckets } from '@/lib/db/schema';
import { eq, isNotNull, desc, and } from 'drizzle-orm';

export interface EmailNode {
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  bucketId: number;
  bucketName: string;
  bucketColor: string;
  classificationTier: number;
  confidence: number;
  urgencyScore: number;
  timestamp: string;
  isUnread: boolean;
  securityFlags: string[];
  llmReasoning: string | null;
  umapX: number;
  umapY: number;
  cosineSimilarities: [];
}

export async function getGraphData(userId: number): Promise<EmailNode[]> {
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
        bucketId: classifications.bucketId,
        bucketName: buckets.name,
        bucketColor: buckets.color,
        classificationTier: classifications.classificationTier,
        confidence: classifications.confidence,
        urgencyScore: classifications.urgencyScore,
        llmReasoning: classifications.llmReasoning,
        securityFlags: classifications.securityFlags,
        umapX: classifications.umapX,
        umapY: classifications.umapY,
      })
      .from(classifications)
      .leftJoin(buckets, eq(classifications.bucketId, buckets.id))
      .where(
        and(
          eq(classifications.userId, userId),
          isNotNull(classifications.umapX),
        ),
      )
      .orderBy(desc(classifications.timestamp));

    const noUmap = rows.filter((r) => r.umapX === null).length;
    if (noUmap > 0) {
      console.log(`[graph-data] userId=${userId}: ${rows.length} emails returned, ${noUmap} missing UMAP coords (placed at origin)`);
    } else {
      console.log(`[graph-data] userId=${userId}: ${rows.length} emails returned, all have UMAP coords`);
    }

    return rows.map((row) => ({
      threadId: row.threadId,
      subject: row.subject ?? '',
      senderName: row.senderName ?? '',
      senderEmail: row.senderEmail ?? '',
      snippet: row.snippet ?? '',
      bucketId: row.bucketId ?? 0,
      bucketName: row.bucketName ?? 'Classifying...',
      bucketColor: row.bucketColor ?? '#888888',
      classificationTier: row.classificationTier ?? 0,
      confidence: row.confidence ?? 1.0,
      urgencyScore: row.urgencyScore ?? 0.5,
      timestamp: row.timestamp.toISOString(),
      isUnread: row.isUnread,
      securityFlags: row.securityFlags ?? [],
      llmReasoning: row.llmReasoning ?? null,
      umapX: row.umapX ?? 0,
      umapY: row.umapY ?? 0,
      cosineSimilarities: [],
    }));
  } catch (error) {
    console.error('getGraphData failed:', error);
    return [];
  }
}
