import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { TooltipProvider } from '#/components/ui/tooltip'

/** Render inside the providers the root document mounts. */
export function renderWithProviders(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}
