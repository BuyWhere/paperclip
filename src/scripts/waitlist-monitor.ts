#!/usr/bin/env npx tsx
/**
 * Waitlist Stats Monitor
 *
 * Polls /waitlist/stats, filters test rows, counts real signups.
 * Posts progress comments at 25+ and CSV at 50+.
 *
 * Usage: npx tsx src/scripts/waitlist-monitor.ts
 */

import { type WaitlistEntry, WaitlistClient, filterRealEntries } from '@/services/waitlist-client';

const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL;
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY;
const PAPERCLIP_TASK_ID = process.env.PAPERCLIP_TASK_ID;
const PAPERCLIP_RUN_ID = process.env.PAPERCLIP_RUN_ID;

const FALLBACK_PROGRESS_ISSUE = 'OS-3270';
const PROGRESS_ISSUE = PAPERCLIP_TASK_ID || FALLBACK_PROGRESS_ISSUE;

const POST_PATH = '/api/issues';
const ATTACH_PATH = '/api/companies/27f38d2c-bcdd-43c2-a022-89b0ee9ff548/issues';

const PAPERCLIP_HEADERS = {
  Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
  'X-Paperclip-Run-Id': PAPERCLIP_RUN_ID || '',
  'Content-Type': 'application/json',
};

function validateEnv() {
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY) {
    throw new Error('Missing PAPERCLIP_API_URL or PAPERCLIP_API_KEY');
  }
}

async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PAPERCLIP_API_URL}${path}`, {
    method,
    headers: PAPERCLIP_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Paperclip API ${method} ${path} failed: ${response.status} ${response.statusText} ${text}`.trim());
  }

  return response.json() as Promise<T>;
}

function escapeCsvValue(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function generateCSV(entries: WaitlistEntry[]): string {
  const header = 'email,created_at,source';
  const rows = entries.map((entry) =>
    [entry.email, entry.created_at, entry.source || 'unknown']
      .map((value) => escapeCsvValue(value))
      .join(','),
  );

  return [header, ...rows].join('\n');
}

async function postComment(issueId: string, body: string) {
  return apiRequest('POST', `${POST_PATH}/${issueId}/comments`, { body });
}

async function uploadAttachment(issueId: string, filename: string, content: string, mimeType = 'text/csv') {
  const formData = new FormData();
  const blob = new Blob([content], { type: mimeType });
  formData.append('file', blob, filename);

  const response = await fetch(`${PAPERCLIP_API_URL}${ATTACH_PATH}/${issueId}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
      'X-Paperclip-Run-Id': PAPERCLIP_RUN_ID || '',
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Paperclip attachment upload failed: ${response.status} ${response.statusText} ${text}`.trim());
  }

  return response.json();
}

async function main() {
  validateEnv();

  const client = new WaitlistClient();
  const now = new Date().toISOString();

  console.log('Starting waitlist stats check...');
  const { count: totalCount, entries } = await client.getStats();
  console.log(`Total entries: ${totalCount}`);

  const realEntries = filterRealEntries(entries);
  const realCount = realEntries.length;
  const testCount = totalCount - realCount;

  console.log(`Real signups: ${realCount}`);
  console.log(`Test rows filtered: ${testCount}`);

  if (realCount >= 25) {
    const progressComment = `## Waitlist Progress Update — ${now}\n\n**${realCount} real signups** detected (${testCount} test rows filtered from ${totalCount} total).\n\n- Midpoint threshold reached (25+)\n- Continuing to monitor...`;
    console.log(`Posting progress comment on ${PROGRESS_ISSUE}...`);
    await postComment(PROGRESS_ISSUE, progressComment);
  }

  if (realCount >= 50) {
    console.log('50+ real signups reached - generating CSV...');
    const csv = generateCSV(realEntries);
    const timestamp = now.replace(/[:.]/g, '-').slice(0, 19);
    const filename = `waitlist-real-signups-${timestamp}.csv`;

    await uploadAttachment(PROGRESS_ISSUE, filename, csv);

    const finalComment = `## Waitlist Final Report — ${now}\n\n**${realCount} real signups** reached the 50-signup milestone!\n\n- ${testCount} test rows filtered from ${totalCount} total entries\n- CSV archive uploaded to ${filename}`;

    console.log(`Posting final comment on ${PROGRESS_ISSUE}...`);
    await postComment(PROGRESS_ISSUE, finalComment);
    console.log('Done!');
    return;
  }

  console.log(`Check complete. ${realCount} real signups (need 50 for final CSV).`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error('Error:', error.message);
  } else {
    console.error('Error:', String(error));
  }
  process.exit(1);
});
