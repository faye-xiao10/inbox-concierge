import { relations } from 'drizzle-orm';
import { users } from './users';
import { buckets } from './buckets';
import { categoryExemplars } from './category-exemplars';
import { classifications } from './classifications';
import { reclassificationLog } from './reclassification-log';
import { aiUsage } from './ai-usage';

export const usersRelations = relations(users, ({ many }) => ({
  buckets: many(buckets),
  classifications: many(classifications),
  aiUsage: many(aiUsage),
}));

export const bucketsRelations = relations(buckets, ({ one, many }) => ({
  user: one(users, { fields: [buckets.userId], references: [users.id] }),
  categoryExemplars: many(categoryExemplars),
  classifications: many(classifications),
}));

export const categoryExemplarsRelations = relations(
  categoryExemplars,
  ({ one }) => ({
    bucket: one(buckets, {
      fields: [categoryExemplars.bucketId],
      references: [buckets.id],
    }),
  }),
);

export const classificationsRelations = relations(
  classifications,
  ({ one, many }) => ({
    user: one(users, {
      fields: [classifications.userId],
      references: [users.id],
    }),
    bucket: one(buckets, {
      fields: [classifications.bucketId],
      references: [buckets.id],
    }),
    reclassificationLog: many(reclassificationLog),
  }),
);

export const reclassificationLogRelations = relations(
  reclassificationLog,
  ({ one }) => ({
    classification: one(classifications, {
      fields: [reclassificationLog.classificationId],
      references: [classifications.id],
    }),
    fromBucket: one(buckets, {
      fields: [reclassificationLog.fromBucketId],
      references: [buckets.id],
    }),
    toBucket: one(buckets, {
      fields: [reclassificationLog.toBucketId],
      references: [buckets.id],
    }),
  }),
);

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(users, { fields: [aiUsage.userId], references: [users.id] }),
}));
