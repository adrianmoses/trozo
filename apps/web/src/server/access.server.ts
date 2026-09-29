// Cloudflare Access check (feature 006). Production sits behind Access, but
// Fly also serves the app on a public *.fly.dev hostname, so every request
// must carry a valid Access JWT. Pure functions here; src/start.ts wires them
// into global request middleware.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

export const HEALTH_PATH = '/healthz'
export const ACCESS_HEADER = 'cf-access-jwt-assertion'

export type AccessConfig =
  | { state: 'off' }
  | { state: 'misconfigured'; missing: readonly string[] }
  | { state: 'on'; teamDomain: string; audience: string }

/** `on` when both Access values are set. On Fly (FLY_APP_NAME) a missing value
 * is `misconfigured`, so production never serves unauthenticated; off Fly
 * (local dev, Compose) it is `off`. */
export function accessConfig(
  env: Record<string, string | undefined> = process.env,
): AccessConfig {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim()
  const audience = env.CF_ACCESS_AUD?.trim()
  if (teamDomain && audience) {
    return {
      state: 'on',
      teamDomain: teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      audience,
    }
  }
  if (!env.FLY_APP_NAME) return { state: 'off' }
  const missing = [
    !teamDomain && 'CF_ACCESS_TEAM_DOMAIN',
    !audience && 'CF_ACCESS_AUD',
  ].filter((name): name is string => Boolean(name))
  return { state: 'misconfigured', missing }
}

/** The team's signing keys; jose caches them and refetches on rotation. */
export function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  return createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  )
}

export async function verifyAccessJwt(
  token: string,
  config: { teamDomain: string; audience: string },
  jwks: JWTVerifyGetKey,
): Promise<boolean> {
  try {
    await jwtVerify(token, jwks, {
      issuer: `https://${config.teamDomain}`,
      audience: config.audience,
    })
    return true
  } catch {
    return false
  }
}

/** A response that ends the request, or null to let it through. Never logs
 * the token itself. */
export async function accessDecision(
  request: Request,
  config: AccessConfig,
  jwks: () => JWTVerifyGetKey,
  log: (message: string) => void = console.warn,
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  if (pathname === HEALTH_PATH || config.state === 'off') return null

  if (config.state === 'misconfigured') {
    const message = `Cloudflare Access is not configured: set ${config.missing.join(' and ')}`
    log(`[access] 503 ${request.method} ${pathname}: ${message}`)
    return new Response(message, { status: 503 })
  }

  const token = request.headers.get(ACCESS_HEADER)
  if (token && (await verifyAccessJwt(token, config, jwks()))) return null

  log(
    `[access] 403 ${request.method} ${pathname}: ${token ? 'invalid' : 'missing'} Access token`,
  )
  return new Response('Forbidden', { status: 403 })
}
