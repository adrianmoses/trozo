// Compile-time contract check: a realistic service response must satisfy
// the generated ChunkResponse type. Run via `pnpm --filter @trozo/schema test`.
import type { ChunkResponse, ErrorResponse } from '../src/index.ts'

export const sampleResponse: ChunkResponse = {
  request_id: 'req_01j8abc',
  input: "I'm really excited to go to the beach this weekend.",
  translation: 'Tengo muchas ganas de ir a la playa este fin de semana.',
  chunks: [
    {
      id: 'ch_1',
      pattern: 'tener (muchas) ganas de',
      slots: ['+ inf.'],
      surface: 'tener muchas ganas de',
      gloss_en: 'to be really looking forward to (doing something)',
      register: 'neutral',
      regions: ['neutral'],
      example: {
        es: 'Tengo muchas ganas de ir a la playa este fin de semana.',
        en: "I'm really excited to go to the beach this weekend.",
        highlight: [0, 21],
        conjugation: { verb: 'tener', person: '1sg', tense: 'presente' },
      },
      translation_highlight: [0, 21],
      confidence: {
        label: 'high',
        signals: { seed: true, consistency: null, verifier: null },
      },
      alternatives: [
        {
          surface: 'me hace mucha ilusión + inf.',
          example_es: 'Me hace mucha ilusión ir a la playa.',
          regions: ['ES'],
          register: 'neutral',
          confidence: {
            label: 'unrated',
            signals: { seed: false, consistency: null, verifier: null },
          },
        },
      ],
    },
  ],
  notes: [
    {
      kind: 'false_friend',
      avoid: 'Estoy muy excitado',
      why: "'Excitado' usually reads as sexually aroused.",
      applies_to: ['ch_1'],
    },
  ],
  meta: {
    prompt_version: 'p1',
    model: 'claude-sonnet-5',
    latency_ms: 1840,
    cached: false,
  },
}

export const sampleError: ErrorResponse = {
  error: { code: 'invalid_input', message: 'input is empty' },
}
