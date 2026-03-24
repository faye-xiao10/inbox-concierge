import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classifications } from '@/lib/db/schema';

const PATTERNS: { flag: string; regex: RegExp }[] = [
  { flag: 'phishing', regex: /verify your account/i },
  { flag: 'phishing', regex: /account.*suspended/i },
  { flag: 'phishing', regex: /unusual activity/i },
  { flag: 'phishing', regex: /click here immediately/i },
  { flag: 'phishing', regex: /confirm your identity/i },
  { flag: 'financial_fraud', regex: /wire transfer.*urgent/i },
  { flag: 'financial_fraud', regex: /prize claim/i },
  { flag: 'financial_fraud', regex: /inheritance/i },
  { flag: 'financial_fraud', regex: /lottery winner/i },
  { flag: 'suspicious_url', regex: /bit\.ly/i },
  { flag: 'suspicious_url', regex: /t\.co\//i },
  { flag: 'suspicious_url', regex: /tinyurl\.com/i },
  { flag: 'suspicious_url', regex: /goo\.gl/i },
  { flag: 'pii', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { flag: 'pii', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
];

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.ps1', '.cmd', '.scr', '.zip', '.rar'];

function scanThread(subject: string, snippet: string, attachments: string[]): string[] {
  const text = `${subject} ${snippet}`;
  const flags = new Set<string>();

  for (const { flag, regex } of PATTERNS) {
    if (regex.test(text)) flags.add(flag);
  }

  for (const filename of attachments) {
    const lower = filename.toLowerCase();
    if (DANGEROUS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      flags.add('dangerous_attachment');
      break;
    }
  }

  return Array.from(flags);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function runSecurityScan(
  userId: number,
): Promise<{ scanned: number; flaggedCount: number }> {
  const threads = await db
    .select({
      id: classifications.id,
      subject: classifications.subject,
      snippet: classifications.snippet,
      attachmentFilenames: classifications.attachmentFilenames,
    })
    .from(classifications)
    .where(eq(classifications.userId, userId));

  let flaggedCount = 0;

  for (const batch of chunk(threads, 50)) {
    await Promise.allSettled(
      batch.map((thread) => {
        const flags = scanThread(thread.subject, thread.snippet, thread.attachmentFilenames);
        if (flags.length > 0) flaggedCount++;
        return db
          .update(classifications)
          .set({ securityFlags: flags })
          .where(eq(classifications.id, thread.id));
      }),
    );
  }

  return { scanned: threads.length, flaggedCount };
}
