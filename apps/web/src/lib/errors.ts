import type { ChunkServiceError } from '#/lib/chunker.server'

/** One line the inline error can show. Service messages are surfaced when
 * they are meant for the user (422); transport failures get a plain phrase. */
export function describeError(error: ChunkServiceError): string {
  switch (error.status) {
    case 0:
      return `Couldn't reach the chunk service (${error.message}).`
    case 401:
      return 'The web app is not authorized to call the chunk service. Check CHUNKER_TOKEN.'
    case 422:
      return error.message
    case 502:
      return `The model failed to answer: ${error.message}`
    case 503:
      return `The model is rate-limited right now: ${error.message}`
    default:
      return `Something went wrong (${error.status} ${error.code}): ${error.message}`
  }
}
