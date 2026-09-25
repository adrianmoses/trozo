import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { TranslatorView } from '#/components/translator/TranslatorView'
import type { TranslatorState } from '#/components/translator/TranslatorView'
import { chunkQueryOptions } from '#/lib/chunk-query'
import { validateTranslatorSearch } from '#/lib/search'
import { getPreferredRegion } from '#/server/chunk.functions'

export const Route = createFileRoute('/')({
  validateSearch: validateTranslatorSearch,
  // The loader only reads the region cookie (no LLM call); Infinity keeps it
  // from re-running on every search change. See spec 002, Key Decisions.
  staleTime: Infinity,
  loader: async () => ({ defaultRegion: await getPreferredRegion() }),
  component: TranslatorPage,
})

function TranslatorPage() {
  const search = Route.useSearch()
  const { defaultRegion } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/' })
  const q = search.q ?? ''
  const region = search.region ?? defaultRegion
  const query = useQuery(chunkQueryOptions({ q, region }))

  let state: TranslatorState
  if (!q) {
    state = { kind: 'idle' }
  } else if (
    query.isPending ||
    (query.isFetching && query.data?.ok === false)
  ) {
    state = { kind: 'loading' }
  } else if (query.isError) {
    state = {
      kind: 'error',
      error: { status: 0, code: 'client', message: query.error.message },
    }
  } else if (query.data.ok) {
    state = { kind: 'result', data: query.data.data }
  } else {
    state = { kind: 'error', error: query.data.error }
  }

  return (
    <TranslatorView
      q={q}
      region={region}
      state={state}
      onSubmit={(text, nextRegion) =>
        void navigate({ search: { q: text, region: nextRegion } })
      }
      onRetry={() => void query.refetch()}
    />
  )
}
