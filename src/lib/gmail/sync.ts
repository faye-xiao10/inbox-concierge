import { db } from '@/lib/db';
import { classifications } from '@/lib/db/schema';
import { getThreadList, getThread } from '@/lib/gmail/client';
import type { GmailThread, GmailPart } from '@/lib/gmail/client';

const BATCH_SIZE = 10;

const GMAIL_CATEGORY_MAP: Record<string, string> = {
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_UPDATES: 'Updates',
  CATEGORY_FORUMS: 'Forums',
};

interface ExtractedThread {
  threadId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  snippet: string;
  timestamp: Date;
  messageCount: number;
  isParticipant: boolean;
  gmailCategory: string;
  isUnread: boolean;
  attachmentFilenames: string[];
}

function extractAttachments(parts: GmailPart[] | undefined): string[] {
  if (!parts) return [];
  const filenames: string[] = [];
  for (const part of parts) {
    if (part.filename && part.filename.length > 0) {
      filenames.push(part.filename);
    }
    if (part.parts) {
      filenames.push(...extractAttachments(part.parts));
    }
  }
  return filenames;
}

function parseFrom(header: string): { senderName: string; senderEmail: string } {
  const match = header.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      senderName: match[1].trim(),
      senderEmail: match[2].trim().toLowerCase(),
    };
  }
  return { senderName: '', senderEmail: header.trim().toLowerCase() };
}

function extractThreadData(thread: GmailThread, userEmail: string): ExtractedThread {
  const firstMsg = thread.messages[0];
  const lastMsg = thread.messages[thread.messages.length - 1];

  const getHeader = (msg: (typeof thread.messages)[0], name: string): string =>
    msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const subject = getHeader(firstMsg, 'Subject');
  const { senderName, senderEmail } = parseFrom(getHeader(lastMsg, 'From'));

  const snippet = lastMsg.snippet;
  const timestamp = new Date(parseInt(lastMsg.internalDate));
  const messageCount = thread.messages.length;

  const lowerEmail = userEmail.toLowerCase();
  const isParticipant = thread.messages.some((m) =>
    getHeader(m, 'From').toLowerCase().includes(lowerEmail),
  );

  const firstLabelIds = firstMsg.labelIds ?? [];
  let gmailCategory = 'Primary';
  for (const [label, category] of Object.entries(GMAIL_CATEGORY_MAP)) {
    if (firstLabelIds.includes(label)) {
      gmailCategory = category;
      break;
    }
  }

  const isUnread = thread.messages.some((m) => m.labelIds?.includes('UNREAD'));

  const attachmentFilenames = thread.messages.flatMap((m) =>
    extractAttachments(m.payload.parts),
  );

  return {
    threadId: thread.id,
    subject,
    senderName,
    senderEmail,
    snippet,
    timestamp,
    messageCount,
    isParticipant,
    gmailCategory,
    isUnread,
    attachmentFilenames,
  };
}

export async function syncGmailThreads(
  userId: number,
  userEmail: string,
  accessToken: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ synced: number; skipped: number }> {
  const page1 = await getThreadList(accessToken, { maxResults: 100 });
  const allThreadStubs = [...page1.threads];

  if (page1.nextPageToken) {
    const page2 = await getThreadList(accessToken, {
      maxResults: 100,
      pageToken: page1.nextPageToken,
    });
    allThreadStubs.push(...(page2.threads ?? []));
  }

  const threadIds = allThreadStubs.map((t) => t.id);
  let insertedCount = 0;

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);
    const threads = await Promise.all(batch.map((id) => getThread(accessToken, id)));

    for (const thread of threads) {
      const extracted = extractThreadData(thread, userEmail);
      const result = await db
        .insert(classifications)
        .values({
          userId,
          threadId: extracted.threadId,
          subject: extracted.subject,
          senderName: extracted.senderName,
          senderEmail: extracted.senderEmail,
          snippet: extracted.snippet,
          timestamp: extracted.timestamp,
          messageCount: extracted.messageCount,
          isParticipant: extracted.isParticipant,
          gmailCategory: extracted.gmailCategory,
          attachmentFilenames: extracted.attachmentFilenames,
          isUnread: extracted.isUnread,
          securityFlags: [],
        })
        .onConflictDoNothing()
        .returning({ id: classifications.id });

      if (result.length > 0) insertedCount++;
    }

    onProgress?.(Math.min(i + BATCH_SIZE, threadIds.length), threadIds.length);
  }

  return { synced: insertedCount, skipped: threadIds.length - insertedCount };
}
