import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="rise-in max-w-2xl">
        <p className="font-mono text-xs tracking-wider text-ink-faint uppercase">
          About
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight font-semibold text-ink sm:text-5xl">
          Reusable Spanish, not one-off translations.
        </h1>
        <p className="mt-5 text-base leading-8 text-ink-muted">
          trozo turns an English phrase into one to five reusable Spanish
          chunks, patterns like{' '}
          <span lang="es" className="font-serif text-ink">
            tener ganas de
          </span>{' '}
          + infinitive, each with a conjugated example that mirrors your phrase,
          regional variants tagged by region, and warnings about calques and
          false friends.
        </p>
        <p className="mt-4 text-base leading-8 text-ink-muted">
          Confidence labels are derived from signals, starting with a seed list
          of verified chunks, never from the model rating itself. It is a
          learning and portfolio project, so the eval harness is a first-class
          part of it.
        </p>
      </section>
    </main>
  )
}
