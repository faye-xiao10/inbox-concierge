import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens'),
    estimatedCost: real('estimated_cost').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userCreatedAtIdx: index('ai_usage_user_created_at_idx').on(
      t.userId,
      t.createdAt,
    ),
  }),
);

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
