# Data Model

## Tables

### users
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| email | text | unique, from Google OAuth |
| name | text | from Google profile |
| googleAccessToken | text | encrypted |
| googleRefreshToken | text | encrypted |
| isDemo | boolean | default false |
| createdAt | timestamp | default now() |

### buckets
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | integer FK -> users.id | |
| name | text | "Important", "Can Wait", etc. |
| description | text | plain English description |
| enrichedDescription | text | LLM-generated rich description |
| boundaryNotes | text | what belongs vs doesn't |
| color | text | hex color code |
| isDefault | boolean | true for the 5 default buckets |
| sortOrder | integer | display order |
| createdAt | timestamp | default now() |

Unique constraint: (userId, name)

### categoryExemplars
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| bucketId | integer FK -> buckets.id | cascade delete |
| embedding | vector(384) | pgvector column |
| source | text | 'synthetic', 'confirmed', 'user_correction' |
| weight | real | 0.0-1.0, default 0.5 for synthetic, 0.8 for confirmed |
| sourceThreadId | text | nullable, threadId that generated this exemplar |
| createdAt | timestamp | default now() |

### classifications
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | integer FK -> users.id | |
| threadId | text | Gmail thread ID |
| bucketId | integer FK -> buckets.id | nullable until classified |
| subject | text | from FIRST message in thread (thread topic) |
| senderName | text | from MOST RECENT message |
| senderEmail | text | from MOST RECENT message |
| snippet | text | preview text, from MOST RECENT message |
| timestamp | timestamp | from MOST RECENT message |
| messageCount | integer | total messages in thread |
| isParticipant | boolean | user sent at least one message in thread |
| gmailCategory | text | nullable: Primary, Social, Promotions, Updates, Forums |
| attachmentFilenames | jsonb | string array, collected from ALL messages |
| isUnread | boolean | |
| embedding | vector(384) | nullable until embedded |
| umapX | real | nullable until UMAP runs |
| umapY | real | nullable until UMAP runs |
| classificationTier | integer | nullable: 0, 1, 2, 3 |
| confidence | real | nullable: 0.0-1.0 |
| llmReasoning | text | nullable, only for Tier 3 |
| securityFlags | jsonb | string array, e.g. ["phishing", "suspicious_url"] |
| urgencyScore | real | nullable: 0.0-1.0 |
| createdAt | timestamp | default now() |

Unique constraint: (userId, threadId)
Index: embedding column for pgvector similarity search

### reclassificationLog
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| classificationId | integer FK -> classifications.id | |
| fromBucketId | integer FK -> buckets.id | |
| toBucketId | integer FK -> buckets.id | |
| source | text | 'user_drag', 'custom_bucket', 'reclassify_run' |
| createdAt | timestamp | default now() |

### aiUsage
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| userId | integer FK -> users.id | |
| model | text | 'claude-sonnet-4', 'gemini-2.0-flash', 'gemini-embedding-001' |
| operation | text | 'classify', 'embed', 'bucket_enrich', 'triage' |
| inputTokens | integer | |
| outputTokens | integer | nullable (embeddings have no output tokens) |
| estimatedCost | real | in USD |
| createdAt | timestamp | default now() |

## Relationships

```
users
  |-- has many --> buckets
  |-- has many --> classifications
  |-- has many --> aiUsage

buckets
  |-- has many --> categoryExemplars
  |-- has many --> classifications

classifications
  |-- has many --> reclassificationLog
  |-- belongs to --> buckets (nullable)
  |-- belongs to --> users
```

## Default Buckets (seeded per user)

| Name | Color | Sort | Description |
|------|-------|------|-------------|
| Important | #3B82F6 (blue) | 1 | Person-to-person emails, urgent messages, emails requiring immediate action |
| Can Wait | #F59E0B (amber) | 2 | Non-urgent but relevant: FYIs, team updates, event invitations |
| Newsletters | #14B8A6 (teal) | 3 | Substack, Beehiiv, mailing lists, industry reports, content roundups |
| Promotions | #22C55E (green) | 4 | Marketing emails, deals, product launches, SaaS offers |
| Auto-Archive | #6B7280 (gray) | 5 | Receipts, shipping confirmations, 2FA codes, password resets, automated notifications |

## Indexes

- `classifications.embedding` -- pgvector IVFFlat or HNSW index for similarity search
- `classifications(userId, threadId)` -- unique, for idempotent upserts
- `categoryExemplars(bucketId)` -- for exemplar lookups per bucket
- `aiUsage(userId, createdAt)` -- for cost metrics queries
