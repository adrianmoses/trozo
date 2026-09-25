import type { Chunk, ChunkResponse } from '@trozo/schema'

const SEP = ' — '

/** "Chunk only": the pattern, optional words in parentheses included, since
 * that is the form a learner stores. */
export function chunkOnly(chunk: Chunk): string {
  return chunk.pattern
}

export function chunkWithExample(chunk: Chunk): string {
  return `${chunk.pattern}${SEP}${chunk.example.es}`
}

/** TXT line format from the design doc: `pattern — example_es — regions`. */
export function chunkAsTxtLine(chunk: Chunk): string {
  const regions =
    chunk.regions && chunk.regions.length > 0 ? chunk.regions : ['neutral']
  return `${chunk.pattern}${SEP}${chunk.example.es}${SEP}${regions.join(', ')}`
}

export function allAsTxt(response: Pick<ChunkResponse, 'chunks'>): string {
  return response.chunks.map(chunkAsTxtLine).join('\n')
}
