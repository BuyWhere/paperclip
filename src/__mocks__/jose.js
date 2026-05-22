// CJS shim for jest — jose is ESM-only and can't be transformed by ts-jest.
// This shim re-implements the subset used by src/lib/auth/jwt.ts using Node built-ins.
'use strict'
const crypto = require('crypto')

function parseExpTime(exp) {
  if (typeof exp === 'number') return exp
  const units = { s: 1, m: 60, h: 3600, d: 86400 }
  const m = String(exp).match(/^(\d+)([smhd])$/)
  if (m) return Math.floor(Date.now() / 1000) + parseInt(m[1], 10) * units[m[2]]
  return Math.floor(Date.now() / 1000) + 900
}

class SignJWT {
  constructor(payload) {
    this._payload = { ...payload }
    this._header = { alg: 'RS256' }
  }
  setProtectedHeader(h) { this._header = h; return this }
  setSubject(sub) { this._payload.sub = sub; return this }
  setJti(jti) { this._payload.jti = jti; return this }
  setIssuedAt() { this._payload.iat = Math.floor(Date.now() / 1000); return this }
  setExpirationTime(exp) { this._payload.exp = parseExpTime(exp); return this }
  setIssuer(iss) { this._payload.iss = iss; return this }
  async sign(privateKeyPem) {
    const hdr = Buffer.from(JSON.stringify(this._header)).toString('base64url')
    const pld = Buffer.from(JSON.stringify(this._payload)).toString('base64url')
    const data = `${hdr}.${pld}`
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(data)
    const sig = signer.sign(privateKeyPem).toString('base64url')
    return `${data}.${sig}`
  }
}

async function jwtVerify(token, publicKeyPem, options = {}) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('JWSInvalid')
  const [hdr, pld, sig] = parts
  const data = `${hdr}.${pld}`
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(data)
  const valid = verifier.verify(publicKeyPem, Buffer.from(sig, 'base64url'))
  if (!valid) throw new Error('JWSSignatureVerificationFailed')
  const payload = JSON.parse(Buffer.from(pld, 'base64url').toString('utf8'))
  if (options.issuer && payload.iss !== options.issuer) throw new Error('JWTClaimValidationFailed: iss')
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWTExpired')
  return { payload, protectedHeader: JSON.parse(Buffer.from(hdr, 'base64url').toString('utf8')) }
}

async function importPKCS8(pem) { return pem }
async function importSPKI(pem) { return pem }

module.exports = { SignJWT, jwtVerify, importPKCS8, importSPKI }
