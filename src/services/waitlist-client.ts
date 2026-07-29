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
export function isTestRow(email: string): boolean {
  const lower = email.toLowerCase();
  const [localPart = '', domain = ''] = lower.split('@');
  const tld = domain.split('.').pop() || '';

  // Explicit real rows that otherwise look synthetic
  if (['hermes-qa-actual@hermes.dev', 'hermes-qa-apijoin@hermes.dev'].includes(lower)) {
    return false;
  }

  // Domain checks
  if ([
    'example.com',
    'test.com',
    'paperclip.example',
    'paperclip.ing',
    'buywhere.paperclip.ing',
    'paperclip.dev',
    'x.com',
    'y.com',
    'sage.example',
    // Hermes QA test infrastructure: hermes.dev kept open for actual/apijoin
    '8os-test.com',
    '8os-verify.com',
    '8os.dev',
    // OS-4875: new synthetic domains
    'test.ai',
    'smoke.dev',
    'test8os.ai',
    '8os.example',
    'test-mira-heartbeat.com',
    // hermes.dev is Hermes QA infra; keep only the two honest real rows
    'hermes.dev',
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

  if (localPart.includes('smoke')) return true;
  if (localPart.includes('healthcheck')) return true;
  if (localPart.includes('sentry')) return true;
  if (localPart.includes('hb-')) return true;
  // Synthetic monitor rows may use a heartbeat suffix without the `hb-` separator.
  if (localPart.includes('hb')) return true;
  // One-character addresses such as x@y.com are probe fixtures, not signups.
  if (localPart.length === 1 && domain === 'y.com') return true;

  if (/^test/.test(localPart)) return true;
  if (/^heidi-/.test(localPart)) return true;
  if (/^alex-/.test(localPart)) return true;
  if (/^burst\d+-/.test(localPart)) return true;
  if (/(alex-)?os\d+-/.test(localPart)) return true;
  if (/^smoke/.test(localPart)) return true;
  if (/^direct-test/.test(localPart)) return true;
  if (/^recheck/.test(localPart)) return true;
  if (/^hb-check/.test(localPart)) return true;

  // OS-4875: Sage heartbeat/QA/smoke patterns
  if (/^sage-test-/.test(localPart)) return true;
  if (/^sagehb/.test(localPart)) return true;
  if (/^sage-heartbeat/.test(localPart)) return true;
  if (/^sentry_test_/.test(localPart)) return true;
  if (/^sentry-hb-/.test(localPart)) return true;
  if (/^sentry-test-/.test(localPart)) return true;
  if (/^sentry-heartbeat/.test(localPart)) return true;
  if (/^sentry\.heartbeat/.test(localPart)) return true;
  if (/^sentry-check$/.test(localPart)) return true;
  if (/^quinn\.hb\./.test(localPart)) return true;
  if (/^quinn-heartbeat/.test(localPart)) return true;
  if (/^daisy-hb-/.test(localPart)) return true;
  if (/^daisy-heartbeat/.test(localPart)) return true;
  if (/^sage\.qa\+noop$/.test(localPart)) return true;
  if (/^sage\+smoke$/.test(localPart)) return true;
  if (/^sage\+test$/.test(localPart)) return true;
  if (/^sagetest/.test(localPart)) return true;
  if (/^final-smoke/.test(localPart)) return true;
  if (localPart.includes('mira-heartbeat')) return true;
  if (/^subseg-/.test(localPart)) return true;
  if (/^catchall-/.test(localPart)) return true;
  if (/^p2-[ab]$/.test(localPart)) return true;
  if (/^someone$/.test(localPart) && domain === '8os.ai') return true;
  if (/^orion-heartbeat/.test(localPart)) return true;

  // OS-5082: timestamped/probe synthetic rows flagged after OS-4954 review
  if (/^sage-test\+/.test(localPart)) return true;
  if (/^sage\.\d+$/.test(localPart)) return true;
  if (/^sage\+[\d-]+$/.test(localPart)) return true;
  if (/^sage\+hb$/.test(localPart)) return true;
  if (/^quinn-test\+/.test(localPart)) return true;
  if (/^orion\+test/.test(localPart)) return true;
  if (/^sentry\.check\+/.test(localPart)) return true;
  if (/^mira-test\+/.test(localPart)) return true;
  if (/^apex\.test\./.test(localPart)) return true;
  if (/^cachecheck\d*$/.test(localPart) && domain === '8os.ai') return true;
  if (/^sage-hb-test-/.test(localPart)) return true;
  if (/^daisy-\d+$/.test(localPart)) return true;

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

  // OS-4637 / HB 504: apiv2-test is a test harness email (OS-4637 source)
  if (/^apiv2-test$/.test(localPart)) return true;

  return false;
}

export function filterRealEntries(entries: WaitlistEntry[]): WaitlistEntry[] {
  return entries.filter((entry) => !isTestRow(entry.email));
}

export class WaitlistClient {
  // Primary: Railway orchestrator (live DB, full window)
  // Fallback: static Next.js stub at 8os.ai (capped at 100, may be stale)
  private readonly baseUrl = 'https://orchestrator-production-1643.up.railway.app';
  private readonly fallbackUrls = [
    'https://8os.ai/api',
    'https://8os.ai',
    'https://www.8os.ai',
  ];

  private async tryGetStats(url: string, adminKey: string): Promise<{ count: number; entries: WaitlistEntry[] }> {
    const response = await fetch(`${url}/waitlist/stats`, {
      headers: {
        accept: 'application/json',
        ...(adminKey ? { 'x-api-key': adminKey } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`${url}/waitlist/stats responded with status ${response.status}`);
    }

    const parsed = WaitlistStatsResponseSchema.parse(await response.json());
    return { count: parsed.count, entries: parsed.entries };
  }

  async getStats(): Promise<{ count: number; entries: WaitlistEntry[]; source: string }> {
    // Admin key from env: WAITLIST_STATS_API_KEY (monitor runtime) > ADMIN_API_KEY (Railway) > ADMIN_SECRET
    const adminKey =
      process.env.WAITLIST_STATS_API_KEY ||
      process.env.ADMIN_API_KEY ||
      process.env.ADMIN_SECRET ||
      '';
    const errors: string[] = [];

    // Try primary orchestrator first (requires auth)
    try {
      const result = await this.tryGetStats(this.baseUrl, adminKey);
      return { ...result, source: this.baseUrl };
    } catch (err) {
      errors.push(`primary (${this.baseUrl}): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Try fallback endpoints (static Next.js stub at 8os.ai — no auth needed)
    for (const fallbackUrl of this.fallbackUrls) {
      try {
        const result = await this.tryGetStats(fallbackUrl, '');
        console.warn(`Using fallback endpoint: ${fallbackUrl}`);
        return { ...result, source: fallbackUrl };
      } catch (err) {
        errors.push(`fallback (${fallbackUrl}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error(`All waitlist /stats endpoints failed:\n${errors.join('\n')}`);
  }
}
