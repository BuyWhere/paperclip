import { RateLimiterRedis, RateLimiterMemory, type RateLimiterAbstract } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis/client'

// Shared factory: use Redis in prod, memory in test
function makeLimiter(opts: {
  keyPrefix: string
  points: number
  duration: number
  blockDuration?: number
}): RateLimiterAbstract {
  const base = {
    keyPrefix: opts.keyPrefix,
    points: opts.points,
    duration: opts.duration,
    blockDuration: opts.blockDuration,
  }
  try {
    return new RateLimiterRedis({ storeClient: redis, ...base })
  } catch {
    return new RateLimiterMemory(base)
  }
}

// 5 failed login attempts → 15-minute block per username+IP
export const loginLimiter = makeLimiter({
  keyPrefix: 'rl_login',
  points: 5,
  duration: 60 * 15,
  blockDuration: 60 * 15,
})

// 10 OTP requests per phone/email per hour
export const otpLimiter = makeLimiter({
  keyPrefix: 'rl_otp',
  points: 10,
  duration: 60 * 60,
})

// 3 password-reset requests per email per hour
export const resetLimiter = makeLimiter({
  keyPrefix: 'rl_reset',
  points: 3,
  duration: 60 * 60,
})

/** Consume one point; returns remaining, throws RateLimiterRes on exhaustion. */
export async function consumeLoginAttempt(key: string) {
  return loginLimiter.consume(key)
}

export async function resetLoginAttempts(key: string) {
  return loginLimiter.delete(key)
}

export async function consumeOtpRequest(key: string) {
  return otpLimiter.consume(key)
}

export async function consumeResetRequest(key: string) {
  return resetLimiter.consume(key)
}

// ─── General API rate limits (Task 11) ────────────────────────────────────────

// 10 requests per minute per IP
export const ipApiLimiter = makeLimiter({
  keyPrefix: 'rl_api_ip',
  points: 10,
  duration: 60,
  blockDuration: 60,
})

// 100 requests per day per authenticated user
export const userApiLimiter = makeLimiter({
  keyPrefix: 'rl_api_user',
  points: 100,
  duration: 60 * 60 * 24,
})

export async function consumeIpRequest(ip: string) {
  return ipApiLimiter.consume(ip)
}

export async function consumeUserRequest(userId: string) {
  return userApiLimiter.consume(userId)
}

// ─── PH launch: endpoint-specific rate limits ─────────────────────────────────

// 20 new registrations per IP per hour — prevents mass account creation spam
// No blockDuration: sliding window naturally expires; avoids permanent bans on shared/CI IPs
export const registrationIpLimiter = makeLimiter({
  keyPrefix: 'rl_register_ip',
  points: 20,
  duration: 60 * 60,
})

// 5 birth calculations per IP per hour — BaZi is CPU-heavy
export const birthIpLimiter = makeLimiter({
  keyPrefix: 'rl_birth_ip',
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
})

export async function consumeRegistrationRequest(ip: string) {
  return registrationIpLimiter.consume(ip)
}

export async function consumeBirthRequest(ip: string) {
  return birthIpLimiter.consume(ip)
}
