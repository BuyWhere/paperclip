import { isTestRow, filterRealEntries } from '../waitlist-client';

describe('isTestRow (OS-5082)', () => {
  describe('OS-5082 timestamped patterns', () => {
    it('flags sage-test+timestamp@8os.ai as test', () => {
      expect(isTestRow('sage-test+1785165457@8os.ai')).toBe(true);
      expect(isTestRow('sage-test+1785167215@8os.ai')).toBe(true);
    });

    it('flags sage.timestamp@8os.ai as test', () => {
      expect(isTestRow('sage.1785158186275343073@8os.ai')).toBe(true);
    });

    it('flags sage+hb@8os.ai as test', () => {
      expect(isTestRow('sage+hb@8os.ai')).toBe(true);
    });

    it('flags quinn-test+timestamp@8os.ai as test', () => {
      expect(isTestRow('quinn-test+1785192410@8os.ai')).toBe(true);
      expect(isTestRow('quinn-test+1785192411@8os.ai')).toBe(true);
    });

    it('flags orion+test*@8os.ai as test', () => {
      expect(isTestRow('orion+test1785201495@8os.ai')).toBe(true);
      expect(isTestRow('orion+test@8os.ai')).toBe(true);
    });

    it('flags sentry.check+*@8os.ai as test', () => {
      expect(isTestRow('sentry.check+now@8os.ai')).toBe(true);
      expect(isTestRow('sentry.check+api@8os.ai')).toBe(true);
    });

    it('flags mira-test+*@8os.ai as test', () => {
      expect(isTestRow('mira-test+stale-20260728061826@8os.ai')).toBe(true);
    });

    it('flags apex.test.*@gmail.com as test', () => {
      expect(isTestRow('apex.test.20260728162320@gmail.com')).toBe(true);
    });

    it('flags cachecheck*@8os.ai as test', () => {
      expect(isTestRow('cachecheck@8os.ai')).toBe(true);
      expect(isTestRow('cachecheck2@8os.ai')).toBe(true);
    });

    it('flags sage-hb-test-*@example.org as test', () => {
      expect(isTestRow('sage-hb-test-172022@example.org')).toBe(true);
    });
  });

  describe('OS-5200 leaked synthetic rows', () => {
    it.each([
      'x@y.com',
      'daisy-smoke+20260729041003@paperclip-test.com',
      'sage+1785296149-12043@paperclip.dev',
      'daisy-hb75-smoke@theopsin.com',
      'healthcheck-1785287196@gmail.com',
      'daisy-1785287177@gmail.com',
      'sage-hb-2037-telly@8os.ai',
      'daisy-smoke-jul28@proton.me',
      'sentry-test@8os.ai',
      'sentry@8os.ai',
    ])('flags %s as test', (email) => {
      expect(isTestRow(email)).toBe(true);
    });
  });

  describe('explicit real rows that look synthetic', () => {
    it('allows hermes-qa-actual@hermes.dev', () => {
      expect(isTestRow('hermes-qa-actual@hermes.dev')).toBe(false);
    });

    it('allows hermes-qa-apijoin@hermes.dev', () => {
      expect(isTestRow('hermes-qa-apijoin@hermes.dev')).toBe(false);
    });

    it('allows sagereal@gmail.com', () => {
      expect(isTestRow('sagereal@gmail.com')).toBe(false);
    });
  });

  describe('filterRealEntries', () => {
    it('filters out test rows and keeps real entries', () => {
      const entries = [
        { id: '1', email: 'sage-test+123@8os.ai', source: null, early_access_sent: false, created_at: '' },
        { id: '2', email: 'sagereal@gmail.com', source: null, early_access_sent: false, created_at: '' },
        { id: '3', email: 'sage+hb@8os.ai', source: null, early_access_sent: false, created_at: '' },
        { id: '4', email: 'hermes-qa-actual@hermes.dev', source: null, early_access_sent: false, created_at: '' },
      ];
      const filtered = filterRealEntries(entries);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(e => e.email)).toContain('sagereal@gmail.com');
      expect(filtered.map(e => e.email)).toContain('hermes-qa-actual@hermes.dev');
    });
  });
});
