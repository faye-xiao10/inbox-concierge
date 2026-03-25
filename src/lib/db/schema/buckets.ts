import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { vector } from '../vector';
import { users } from './users';

export const buckets = pgTable(
  'buckets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    description: text('description'),
    enrichedDescription: text('enriched_description'),
    boundaryNotes: text('boundary_notes'),
    color: text('color').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull(),
    embedding: vector('embedding', { dimensions: 384 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userNameUnique: unique('buckets_user_name_unique').on(t.userId, t.name),
  }),
);

export type Bucket = typeof buckets.$inferSelect;
export type NewBucket = typeof buckets.$inferInsert;
