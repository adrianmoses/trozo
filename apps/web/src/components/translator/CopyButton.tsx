import { ChevronDownIcon } from 'lucide-react'
import type { Chunk } from '@trozo/schema'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { chunkOnly, chunkWithExample } from '#/lib/copy'
import { copyText } from '#/lib/copy-text'

/** Split button: the main click copies the chunk; the menu adds
 * chunk + example. */
export function CopyButton({ chunk }: { chunk: Chunk }) {
  return (
    <div className="flex" role="group" aria-label="Copy chunk">
      <Button
        type="button"
        variant="outline"
        className="flex-1 rounded-r-none"
        onClick={() => void copyText(chunkOnly(chunk), 'chunk')}
      >
        Copy
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More copy options"
            className="rounded-l-none border-l-0"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => void copyText(chunkOnly(chunk), 'chunk')}
          >
            Copy chunk
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void copyText(chunkWithExample(chunk), 'chunk + example')
            }
          >
            Copy chunk + example
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
