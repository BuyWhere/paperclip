import { generateOtp } from '../otp'

describe('OTP generation', () => {
  it('generates a 6-digit numeric string', () => {
    const otp = generateOtp(6)
    expect(otp).toMatch(/^\d{6}$/)
  })

  it('left-pads with zeros when needed', () => {
    // Run many times to statistically hit small numbers
    for (let i = 0; i < 100; i++) {
      const otp = generateOtp(6)
      expect(otp.length).toBe(6)
    }
  })

  it('generates different values on each call', () => {
    const otps = new Set(Array.from({ length: 50 }, () => generateOtp(6)))
    // With 50 samples of 10^6 space, duplicates should be extremely rare
    expect(otps.size).toBeGreaterThan(40)
  })
})
