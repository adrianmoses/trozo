// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import type { JWK, JWTVerifyGetKey } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ACCESS_HEADER,
  accessConfig,
  accessDecision,
  verifyAccessJwt,
} from './access.server'

const teamDomain = 'trozo.cloudflareaccess.com'
const audience = 'aud-tag'
const on = { state: 'on', teamDomain, audience } as const

let jwks: JWTVerifyGetKey
let privateKey: CryptoKey
let otherKey: CryptoKey

async function token(
  overrides: {
    iss?: string
    aud?: string
    exp?: string | number
    key?: CryptoKey
  } = {},
) {
  return new SignJWT({ email: 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(overrides.iss ?? `https://${teamDomain}`)
    .setAudience(overrides.aud ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m')
    .sign(overrides.key ?? privateKey)
}

function request(path: string, jwt?: string) {
  return new Request(`https://trozoapp.com${path}`, {
    headers: jwt ? { [ACCESS_HEADER]: jwt } : {},
  })
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'k1',
    alg: 'RS256',
  }
  jwks = createLocalJWKSet({ keys: [jwk] })
})

describe('accessConfig', () => {
  it('is off without Access values off Fly', () => {
    expect(accessConfig({})).toEqual({ state: 'off' })
  })

  it('fails closed on Fly when values are missing', () => {
    expect(accessConfig({ FLY_APP_NAME: 'trozo-web' })).toEqual({
      state: 'misconfigured',
      missing: ['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD'],
    })
    expect(
      accessConfig({ FLY_APP_NAME: 'trozo-web', CF_ACCESS_AUD: audience }),
    ).toEqual({ state: 'misconfigured', missing: ['CF_ACCESS_TEAM_DOMAIN'] })
  })

  it('is on with both values, normalizing the team domain', () => {
    expect(
      accessConfig({
        CF_ACCESS_TEAM_DOMAIN: `https://${teamDomain}/`,
        CF_ACCESS_AUD: audience,
      }),
    ).toEqual(on)
  })
})

describe('verifyAccessJwt', () => {
  it('accepts a valid token', async () => {
    expect(await verifyAccessJwt(await token(), on, jwks)).toBe(true)
  })

  it.each([
    ['wrong audience', { aud: 'other' }],
    ['wrong issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['past expiry', { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])('rejects a token with a %s', async (_, overrides) => {
    expect(await verifyAccessJwt(await token(overrides), on, jwks)).toBe(false)
  })

  it('rejects a token signed by another key', async () => {
    const jwt = await token({ key: otherKey })
    expect(await verifyAccessJwt(jwt, on, jwks)).toBe(false)
  })

  it('rejects a malformed token', async () => {
    expect(await verifyAccessJwt('not.a.jwt', on, jwks)).toBe(false)
  })
})

describe('accessDecision', () => {
  const log = vi.fn()
  const getJwks = () => jwks

  it('always lets the health check through', async () => {
    const misconfigured = { state: 'misconfigured', missing: ['X'] } as const
    expect(
      await accessDecision(request('/healthz'), misconfigured, getJwks, log),
    ).toBeNull()
    expect(await accessDecision(request('/healthz'), on, getJwks, log)).toBe(
      null,
    )
  })

  it('lets everything through when off', async () => {
    expect(
      await accessDecision(request('/'), { state: 'off' }, getJwks, log),
    ).toBeNull()
  })

  it('returns 503 naming the missing variables when misconfigured', async () => {
    const res = await accessDecision(
      request('/saved'),
      { state: 'misconfigured', missing: ['CF_ACCESS_AUD'] },
      getJwks,
      log,
    )
    expect(res?.status).toBe(503)
    expect(await res?.text()).toContain('CF_ACCESS_AUD')
    expect(log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason: 'misconfigured',
        missing: 'CF_ACCESS_AUD',
      }),
    )
  })

  it('returns 403 without a token and logs no token', async () => {
    const res = await accessDecision(request('/'), on, getJwks, log)
    expect(res?.status).toBe(403)
    expect(log).toHaveBeenLastCalledWith({
      event: 'access_denied',
      status: 403,
      method: 'GET',
      path: '/',
      reason: 'missing',
    })
  })

  it('returns 403 for an invalid token without logging it', async () => {
    const jwt = await token({ aud: 'other' })
    const res = await accessDecision(
      request('/_serverFn/abc', jwt),
      on,
      getJwks,
      log,
    )
    expect(res?.status).toBe(403)
    expect(log).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 403, reason: 'invalid' }),
    )
    expect(JSON.stringify(log.mock.lastCall)).not.toContain(jwt)
  })

  it('lets a valid token through', async () => {
    expect(
      await accessDecision(
        request('/api/export', await token()),
        on,
        getJwks,
        log,
      ),
    ).toBeNull()
  })
})
