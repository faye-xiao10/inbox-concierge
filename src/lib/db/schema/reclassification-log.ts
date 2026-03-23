import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { classifications } from './classifications';
import { buckets } from './buckets';

export const reclassificationLog = pgTable('reclassification_log', {
  id: serial('id').primaryKey(),
  classificationId: integer('classification_id')
    .notNull()
    .references(() => classifications.id),
  fromBucketId: integer('from_bucket_id')
    .notNull()
    .references(() => buckets.id),
  toBucketId: integer('to_bucket_id')
    .notNull()
    .references(() => buckets.id),
  source: text('source').notNull(), // 'user_drag' | 'custom_bucket' | 'reclassify_run'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ReclassificationLog = typeof reclassificationLog.$inferSelect;
export type NewReclassificationLog = typeof reclassificationLog.$inferInsert;
