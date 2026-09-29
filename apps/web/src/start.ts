import { createMiddleware, createStart } from '@tanstack/react-start'
import type { JWTVerifyGetKey } from 'jose'
import {
  accessConfig,
  accessDecision,
  remoteJwks,
} from '#/server/access.server'

// Read once per process: Fly sets env at boot, and a config change redeploys.
const config = accessConfig()
let jwks: JWTVerifyGetKey | undefined

/** Every server request (SSR pages, server functions, server routes) needs a
 * valid Cloudflare Access JWT when Access is on (006). Static assets are
 * served by Nitro before this runs. */
const accessMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const denied = await accessDecision(request, config, () => {
      if (config.state !== 'on') throw new Error('Access is not on')
      return (jwks ??= remoteJwks(config.teamDomain))
    })
    return denied ?? next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [accessMiddleware],
}))
