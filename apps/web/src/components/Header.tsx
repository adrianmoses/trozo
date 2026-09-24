import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <nav
        aria-label="Primary"
        className="page-wrap flex items-center justify-between py-3 sm:py-4"
      >
        <Link
          to="/"
          className="font-serif text-2xl text-ink italic no-underline hover:text-brand-text"
        >
          trozo
        </Link>
        {/* Right-hand slot: 004 adds "Saved · n" and "Export to Anki" here. */}
        <div className="flex items-center gap-5 text-sm text-ink-muted">
          <Link
            to="/about"
            className="no-underline hover:text-ink"
            activeProps={{ className: 'text-ink no-underline' }}
          >
            About
          </Link>
        </div>
      </nav>
    </header>
  )
}
