import { z } from 'zod';

const WaitlistEntrySchema = z.object({
  id: z.string(),
  email: z.string(),
  source: z.string().nullable(),
  archetype: z.string().nullable().optional(),
  affiliate_opt_in: z.boolean().optional(),
  early_access_sent: z.boolean(),
  created_at: z.string(),
});

const WaitlistStatsResponseSchema = z.object({
  count: z.number(),
  entries: z.array(WaitlistEntrySchema),
});

type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;

export { WaitlistEntrySchema, WaitlistStatsResponseSchema };
export type { WaitlistEntry };

/**
 * Test-row classification shared with the hourly monitor (OS-1947 / OS-3270).
 *
 * Mirrors the historical heuristics used by the compiled monitor artifact:
 * - explicit example/test domains,
 * - suspicious TLDs,
 * - synthetic prefixes used by smoke/heartbeat/manual probes.
 */
function isTestRow(email: string): boolean {
  const lower = email.toLowerCase();
  const [localPart = '', domain = ''] = lower.split('@');
  const tld = domain.split('.').pop() || '';

  // Domain checks
  if ([
    'example.com',
    'test.com',
    'paperclip.example',
    'paperclip.ing',
    'buywhere.paperclip.ing',
    'x.com',
    'sage.example',
    // Hermes QA test infrastructure: hermes.dev kept open for actual/apijoin
    '8os-test.com',
    '8os-verify.com',
    '8os.dev',
  ].includes(domain)) {
    return true;
  }

  // Legacy guard: one-char TLDs are almost always synthetic in this pipeline
  if (tld.length === 1) {
    return true;
  }

  // Local-part checks
  if (localPart.includes('formtest') || localPart.includes('probe')) {
    return true;
  }

  if (/^test/.test(localPart)) return true;
  if (/^heidi-/.test(localPart)) return true;
  if (/^alex-/.test(localPart)) return true;
  if (/^burst\d+-/.test(localPart)) return true;
  if (/(alex-)?os\d+-/.test(localPart)) return true;
  if (/^smoke/.test(localPart)) return true;
  if (/^direct-test/.test(localPart)) return true;
  if (/^recheck/.test(localPart)) return true;
  if (/^hb-check/.test(localPart)) return true;

  // Expanded agent/test patterns
  if (/^drake/.test(localPart)) return true;
  if (/^hb-/.test(localPart)) return true;
  if (localPart.includes('heartbeat')) return true;
  if (/^vex/.test(localPart)) return true;
  if (/^payton/.test(localPart)) return true;
  if (/^orch-/.test(localPart)) return true;
  if (localPart.includes('verify')) return true;
  if (localPart.includes('drift')) return true;
  if (localPart.includes('stability')) return true;
  if (localPart.includes('clerk_test')) return true;
  if (/^orion-/.test(localPart)) return true;
  if (/^retest/.test(localPart)) return true;
  if (/^prefix-test/.test(localPart)) return true;
  if (localPart.includes('tudor')) return true;

  // OS-2179: t7d- prefix test rows leaked through filter (t7d-test, t7d-verify-final)
  if (/^t7d-/.test(localPart)) return true;

  // OS-2582: sage-smoke- prefix synthetic rows (sage + smoke + unix suffix)
  if (/^sage-smoke-/.test(localPart)) return true;

  // hermes-qa- prefix: filter most as test, but keep actual/apijoin as honest real
  if (/^hermes-qa-/.test(localPart) && !['hermes-qa-actual', 'hermes-qa-apijoin'].includes(localPart)) {
    return true;
  }
  if (/^hermes-test-/.test(localPart)) return true;

  return false;
}

export function filterRealEntries(entries: WaitlistEntry[]): WaitlistEntry[] {
  return entries.filter((entry) => !isTestRow(entry.email));
}

export class WaitlistClient {
  private readonly baseUrl = process.env.WAITLIST_API_URL || 'https://orchestrator-production-1643.up.railway.app';

  async getStats(): Promise<{ count: number; entries: WaitlistEntry[] }> {
    const adminKey = process.env.ADMIN_API_KEY || process.env.ADMIN_SECRET || '';
    const response = await fetch(`${this.baseUrl}/waitlist/stats`, {
      headers: {
        accept: 'application/json',
        'x-api-key': adminKey,
      },
    });

    if (!response.ok) {
      throw new Error(`waitlist /stats responded with status ${response.status}`);
    }

    const parsed = WaitlistStatsResponseSchema.parse(await response.json());
    return { count: parsed.count, entries: parsed.entries };
  }
}
