// Gate 2 check: Testing Library + jsdom render under the standalone Vitest
// config, importing through the `#/` subpath alias.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { cn } from '#/lib/utils'

function Hello({ name }: { name: string }) {
  return <p className={cn('greeting', 'font-bold')}>Hello, {name}</p>
}

describe('test runner', () => {
  it('renders a component with jsdom and jest-dom matchers', () => {
    render(<Hello name="trozo" />)
    const el = screen.getByText('Hello, trozo')
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('greeting', 'font-bold')
  })
})
