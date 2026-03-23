import { customType } from 'drizzle-orm/pg-core';

/**
 * pgvector column type for Drizzle ORM.
 * Requires the vector extension: CREATE EXTENSION IF NOT EXISTS vector
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns "[1.0,2.0,3.0]"
    return value.slice(1, -1).split(',').map(Number);
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});
