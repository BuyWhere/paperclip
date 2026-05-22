import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose'
import { v4 as uuidv4 } from 'uuid'

// RS256 key pair — loaded from env vars at runtime
// In production, set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY as PEM strings.
// For local dev, generate with: openssl genrsa -out private.pem 2048
//   and: openssl rsa -in private.pem -pubout -out public.pem

async function getPrivateKey() {
  const pem = process.env.JWT_PRIVATE_KEY!.replace(/\\n/g, '\n')
  return importPKCS8(pem, 'RS256')
}

async function getPublicKey() {
  const pem = process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n')
  return importSPKI(pem, 'RS256')
}

export interface AccessTokenPayload extends JWTPayload {
  sub: string       // userId
  role: string
  jti: string
  sessionId: string
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string       // userId
  sessionId: string
  jti: string
}

/** Issue a 15-minute access token (RS256). */
export async function signAccessToken(userId: string, role: string, sessionId: string): Promise<string> {
  const privateKey = await getPrivateKey()
  return new SignJWT({ role, sessionId } as Record<string, unknown>)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(uuidv4())
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('8os')
    .sign(privateKey)
}

/** Issue a 7-day refresh token (RS256). */
export async function signRefreshToken(userId: string, sessionId: string): Promise<string> {
  const privateKey = await getPrivateKey()
  return new SignJWT({ sessionId } as Record<string, unknown>)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(uuidv4())
    .setIssuedAt()
    .setExpirationTime('7d')
    .setIssuer('8os')
    .sign(privateKey)
}

/** Verify an access token; throws on invalid/expired. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const publicKey = await getPublicKey()
  const { payload } = await jwtVerify(token, publicKey, { issuer: '8os' })
  return payload as AccessTokenPayload
}

/** Verify a refresh token; throws on invalid/expired. */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const publicKey = await getPublicKey()
  const { payload } = await jwtVerify(token, publicKey, { issuer: '8os' })
  return payload as RefreshTokenPayload
}

/** Sign a short-lived password reset token (JWT, 1hr, single-use). */
export async function signPasswordResetToken(userId: string, jti: string): Promise<string> {
  const privateKey = await getPrivateKey()
  return new SignJWT({ purpose: 'pwd-reset' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('8os')
    .sign(privateKey)
}

export async function verifyPasswordResetToken(token: string): Promise<JWTPayload & { sub: string; jti: string }> {
  const publicKey = await getPublicKey()
  const { payload } = await jwtVerify(token, publicKey, { issuer: '8os' })
  if (payload.purpose !== 'pwd-reset') throw new Error('invalid token purpose')
  return payload as JWTPayload & { sub: string; jti: string }
}
