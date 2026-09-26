import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { SavedView } from '#/components/saved/SavedView'
import { validateSavedFilter } from '#/lib/saved'
import { savedListQueryOptions, useDeleteSaved } from '#/lib/saved-query'

export const Route = createFileRoute('/saved')({
  validateSearch: validateSavedFilter,
  loaderDeps: ({ search }) => ({ region: search.region, tag: search.tag }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(savedListQueryOptions(deps)),
  head: () => ({ meta: [{ title: 'Saved · trozo' }] }),
  component: SavedPage,
})

function SavedPage() {
  const filter = Route.useSearch()
  const navigate = useNavigate({ from: '/saved' })
  const { data } = useSuspenseQuery(savedListQueryOptions(filter))
  const remove = useDeleteSaved()
  return (
    <SavedView
      items={data}
      filter={filter}
      onFilter={(next) => void navigate({ search: next })}
      onDelete={(id) => remove.mutate(id)}
    />
  )
}
