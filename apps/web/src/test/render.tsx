import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { TooltipProvider } from '#/components/ui/tooltip'

/** A query client for tests: no retries, so failures surface at once. */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Render inside the providers the root document mounts. */
export function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = testQueryClient(),
) {
  // As a wrapper, so `rerender` keeps the providers.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
  return render(ui, { wrapper })
}

/** Render a component that uses router `Link`s, at `path`, inside a memory
 * router whose routes all render it. */
export async function renderWithRouter(
  ui: ReactElement,
  {
    path = '/',
    queryClient = testQueryClient(),
  }: { path?: string; queryClient?: QueryClient } = {},
) {
  const rootRoute = createRootRoute({ component: () => ui })
  const routes = ['/', '/saved', '/about'].map((p) =>
    createRoute({ getParentRoute: () => rootRoute, path: p }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const result = renderWithProviders(
    <RouterProvider router={router as never} />,
    queryClient,
  )
  await router.load()
  return { ...result, router }
}
