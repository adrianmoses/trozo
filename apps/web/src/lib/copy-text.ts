import { toast } from 'sonner'

/** Copy to the clipboard and confirm with a toast. Returns whether it worked. */
export async function copyText(text: string, label: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
    return true
  } catch {
    toast.error('Copy failed')
    return false
  }
}
