import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  real,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { vector } from '../vector';
import { users } from './users';
import { buckets } from './buckets';

export const classifications = pgTable(
  'classifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    threadId: text('thread_id').notNull(),
    bucketId: integer('bucket_id').references(() => buckets.id),
    // Thread metadata
    subject: text('subject').notNull(),
    senderName: text('sender_name').notNull(),
    senderEmail: text('sender_email').notNull(),
    snippet: text('snippet').notNull(),
    timestamp: timestamp('timestamp').notNull(),
    messageCount: integer('message_count').notNull(),
    isParticipant: boolean('is_participant').notNull(),
    gmailCategory: text('gmail_category'),
    attachmentFilenames: jsonb('attachment_filenames')
      .notNull()
      .$type<string[]>()
      .default([]),
    isUnread: boolean('is_unread').notNull(),
    // Classification outputs
    embedding: vector('embedding', { dimensions: 384 }),
    umapX: real('umap_x'),
    umapY: real('umap_y'),
    classificationTier: integer('classification_tier'),
    confidence: real('confidence'),
    llmReasoning: text('llm_reasoning'),
    securityFlags: jsonb('security_flags')
      .notNull()
      .$type<string[]>()
      .default([]),
    urgencyScore: real('urgency_score'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userThreadUnique: unique('classifications_user_thread_unique').on(
      t.userId,
      t.threadId,
    ),
    // Note: HNSW vector index must be added via custom SQL migration:
    // CREATE INDEX ON classifications USING hnsw (embedding vector_cosine_ops);
    embeddingIdx: index('classifications_embedding_idx').on(t.embedding),
  }),
);

export type Classification = typeof classifications.$inferSelect;
export type NewClassification = typeof classifications.$inferInsert;
