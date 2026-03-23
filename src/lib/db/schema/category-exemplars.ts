import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { vector } from '../vector';
import { buckets } from './buckets';

export const categoryExemplars = pgTable(
  'category_exemplars',
  {
    id: serial('id').primaryKey(),
    bucketId: integer('bucket_id')
      .notNull()
      .references(() => buckets.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
    source: text('source').notNull(), // 'synthetic' | 'confirmed' | 'user_correction'
    weight: real('weight').notNull().default(0.5),
    sourceThreadId: text('source_thread_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    bucketIdIdx: index('category_exemplars_bucket_id_idx').on(t.bucketId),
  }),
);

export type CategoryExemplar = typeof categoryExemplars.$inferSelect;
export type NewCategoryExemplar = typeof categoryExemplars.$inferInsert;
