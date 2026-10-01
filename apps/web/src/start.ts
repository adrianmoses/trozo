import { createMiddleware, createStart } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import type { JWTVerifyGetKey } from 'jose'
import { logJson } from '#/lib/log.server'
import {
  accessConfig,
  accessDecision,
  remoteJwks,
} from '#/server/access.server'

// Read once per process: Fly sets env at boot, and a config change redeploys.
const config = accessConfig()
let jwks: JWTVerifyGetKey | undefined

/** One JSON line per failed request (009): route and error message only.
 * Redirects and not-found are control flow, not failures. */
function logFailure(event: string, path: string, error: unknown): void {
  if (isRedirect(error) || isNotFound(error)) return
  logJson('error', {
    event,
    path,
    error: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  })
}

/** Every server request (SSR pages, server functions, server routes) needs a
 * valid Cloudflare Access JWT when Access is on (006). Static assets are
 * served by Nitro before this runs. */
const accessMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const denied = await accessDecision(request, config, () => {
      if (config.state !== 'on') throw new Error('Access is not on')
      return (jwks ??= remoteJwks(config.teamDomain))
    })
    if (denied) return denied
    try {
      return await next()
    } catch (error) {
      logFailure('request_error', new URL(request.url).pathname, error)
      throw error
    }
  },
)

/** Server-function errors are serialized into a 200 response, so the request
 * middleware never sees them thrown; log them here. */
const functionErrorMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error) {
      logFailure('server_fn_error', new URL(getRequest().url).pathname, error)
      throw error
    }
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [accessMiddleware],
  functionMiddleware: [functionErrorMiddleware],
}))
