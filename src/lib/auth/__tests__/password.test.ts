import { hashPassword, verifyPassword, isPasswordPwned } from '../password'

describe('password utilities', () => {
  describe('hashPassword / verifyPassword', () => {
    it('hashes a password and verifies it', async () => {
      const hash = await hashPassword('MyS3cureP@ss!')
      expect(hash).not.toBe('MyS3cureP@ss!')
      expect(/^\$2[ab]\$12\$/.test(hash)).toBe(true)
      await expect(verifyPassword('MyS3cureP@ss!', hash)).resolves.toBe(true)
    })

    it('rejects an incorrect password', async () => {
      const hash = await hashPassword('correcthorsebatterystaple')
      await expect(verifyPassword('wrong', hash)).resolves.toBe(false)
    })

    it('is timing-safe against dummy hashes', async () => {
      const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attacks.in.auth.flow.x'
      await expect(verifyPassword('anypassword', dummyHash)).resolves.toBe(false)
    })
  })

  describe('isPasswordPwned', () => {
    it('returns false on network failure (fail-open)', async () => {
      // Mock fetch to throw
      const originalFetch = global.fetch
      global.fetch = async () => { throw new Error('network') }
      await expect(isPasswordPwned('anything')).resolves.toBe(false)
      global.fetch = originalFetch
    })

    it('returns false on non-OK response (fail-open)', async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({ ok: false } as Response)
      await expect(isPasswordPwned('anything')).resolves.toBe(false)
      global.fetch = originalFetch
    })
  })
})
