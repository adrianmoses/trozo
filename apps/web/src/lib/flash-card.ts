/** DOM id of a chunk card, used by the watch-out box's "→ card NN" links. */
export function cardDomId(chunkId: string): string {
  return `card-${chunkId}`
}

/** Scroll a card into view and flash it (CSS keys off `data-flash`). */
export function flashCard(chunkId: string): boolean {
  const el = document.getElementById(cardDomId(chunkId))
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.setAttribute('data-flash', '')
  window.setTimeout(() => el.removeAttribute('data-flash'), 1400)
  return true
}
