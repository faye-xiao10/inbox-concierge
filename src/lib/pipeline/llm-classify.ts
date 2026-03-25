import Anthropic from '@anthropic-ai/sdk';
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
  type FunctionDeclarationSchema,
} from '@google/generative-ai';
import { db } from '@/lib/db';
import { aiUsage } from '@/lib/db/schema';
import { withRetry } from '@/lib/utils/retry';

export interface EmailBatchItem {
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  securityFlags: string[];
}

export interface BucketContext {
  id: number;
  name: string;
  description: string | null;
  enrichedDescription: string | null;
}

export interface LLMClassification {
  threadId: string;
  bucketId: number;
  confidence: number;
  reasoning: string;
}

const classifyTool = {
  name: 'classify_emails',
  description: 'Classify each email into exactly one bucket.',
  input_schema: {
    type: 'object' as const,
    properties: {
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            threadId: { type: 'string' },
            bucketId: { type: 'integer' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
          },
          required: ['threadId', 'bucketId', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['classifications'],
  },
};

function buildSystemPrompt(buckets: BucketContext[], prefix?: string): string {
  const bucketList = buckets
    .map((b) => `ID ${b.id}: ${b.name} — ${b.enrichedDescription ?? b.description ?? b.name}`)
    .join('\n');
  return (
    (prefix ? prefix.trim() + '\n\n' : '') +
    `You are an email classifier. Classify each email into exactly one of the provided buckets.\n\n` +
    `Buckets:\n${bucketList}\n\n` +
    `If an email has security flags (phishing, suspicious_url, etc.), note them in reasoning but still assign the most appropriate bucket.\n` +
    `The "Direct" bucket is reserved for emails requiring personal action or a direct reply. It is sticky — only classify an email as Direct if you are highly confident it belongs there. Do not move emails away from Direct unless clearly wrong.\n` +
    `Confidence should reflect genuine certainty: 0.5-0.6 for ambiguous cases, 0.8-0.95 for clear ones.`
  );
}

function buildUserPrompt(batch: EmailBatchItem[]): string {
  return batch
    .map((e) => {
      const flags =
        e.securityFlags.length > 0
          ? ` | ⚠️ Security flags: ${e.securityFlags.join(', ')}`
          : '';
      return `[${e.threadId}] From: ${e.senderName} <${e.senderEmail}> | Subject: ${e.subject} | Preview: ${e.snippet}${flags}`;
    })
    .join('\n');
}

function validateResults(
  results: LLMClassification[],
  batch: EmailBatchItem[],
  buckets: BucketContext[],
): LLMClassification[] {
  const validThreadIds = new Set(batch.map((e) => e.threadId));
  const validBucketIds = new Set(buckets.map((b) => b.id));
  return results
    .filter((r) => validThreadIds.has(r.threadId) && validBucketIds.has(r.bucketId))
    .map((r) => ({ ...r, confidence: Math.max(0, Math.min(1, r.confidence)) }));
}

async function logUsage(userId: number, model: string, inputTokens: number, outputTokens: number | null, costPerMInput: number, costPerMOutput: number): Promise<void> {
  const cost = (inputTokens / 1_000_000) * costPerMInput + ((outputTokens ?? 0) / 1_000_000) * costPerMOutput;
  try {
    await db.insert(aiUsage).values({ userId, model, operation: 'classify', inputTokens, outputTokens, estimatedCost: cost });
  } catch (err) {
    console.error('Failed to log aiUsage:', err);
  }
}

async function callClaude(
  batch: EmailBatchItem[],
  buckets: BucketContext[],
  userId: number,
  systemPromptPrefix?: string,
): Promise<LLMClassification[]> {
  const client = new Anthropic();
  const response = await withRetry(
    () =>
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: buildSystemPrompt(buckets, systemPromptPrefix),
        messages: [{ role: 'user', content: buildUserPrompt(batch) }],
        tools: [classifyTool],
        tool_choice: { type: 'tool', name: 'classify_emails' },
      }),
    2,
  );

  await logUsage(userId, 'claude-sonnet-4-6', response.usage.input_tokens, response.usage.output_tokens, 3, 15);

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') throw new Error('Claude returned no tool_use block');
  const input = toolBlock.input as Record<string, unknown>;
  if (!input || !Array.isArray(input.classifications)) {
    console.error('Claude unexpected tool input shape:', JSON.stringify(input));
    return [];
  }
  return validateResults(input.classifications as LLMClassification[], batch, buckets);
}

async function callGemini(
  batch: EmailBatchItem[],
  buckets: BucketContext[],
  userId: number,
  systemPromptPrefix?: string,
): Promise<LLMClassification[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const parameters: FunctionDeclarationSchema = {
    type: SchemaType.OBJECT,
    properties: {
      classifications: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            threadId: { type: SchemaType.STRING },
            bucketId: { type: SchemaType.INTEGER },
            confidence: { type: SchemaType.NUMBER },
            reasoning: { type: SchemaType.STRING },
          },
          required: ['threadId', 'bucketId', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['classifications'],
  };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ functionDeclarations: [{ name: 'classify_emails', description: 'Classify each email into exactly one bucket.', parameters }] }],
  });

  const prompt = `${buildSystemPrompt(buckets, systemPromptPrefix)}\n\n${buildUserPrompt(batch)}`;
  const result = await withRetry(
    () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ['classify_emails'] } } }),
    2,
  );

  const usage = result.response.usageMetadata;
  await logUsage(userId, 'gemini-2.5-flash', usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? null, 0.10, 0.40);

  const calls = result.response.functionCalls();
  if (!calls || calls.length === 0) throw new Error('Gemini returned no function calls');
  const args = calls[0].args as { classifications: LLMClassification[] };
  if (!Array.isArray(args.classifications)) throw new Error('Gemini function call missing classifications array');
  return validateResults(args.classifications, batch, buckets);
}

export async function classifyBatchWithFallback(
  batch: EmailBatchItem[],
  buckets: BucketContext[],
  userId: number,
  systemPromptPrefix?: string,
): Promise<LLMClassification[]> {
  try {
    return await callClaude(batch, buckets, userId, systemPromptPrefix);
  } catch (claudeError) {
    console.error('Claude classification failed, trying Gemini:', claudeError);
    try {
      return await callGemini(batch, buckets, userId, systemPromptPrefix);
    } catch (geminiError) {
      console.error('Gemini classification failed, returning empty:', geminiError);
      return [];
    }
  }
}
