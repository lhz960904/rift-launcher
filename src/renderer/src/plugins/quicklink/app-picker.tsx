import { useState } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import type { AppEntry } from '@rift/api'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Props = {
  apps: AppEntry[]
  value: string
  onChange: (path: string) => void
}

const DEFAULT_LABEL = 'Default browser'

function Icon({ src, className }: { src?: string | null; className?: string }) {
  if (src) {
    return <img src={src} alt="" className={className} draggable={false} />
  }
  return <Globe className={className} />
}

export function AppPicker({ apps, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = apps.find((a) => a.path === value)

  return (
    <div
      // While popover is open, swallow Escape so Launcher's onKeyDown doesn't
      // exit the plugin view too. Radix portals content but events still
      // bubble through the React tree to this wrapper.
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') e.stopPropagation()
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Icon
                src={selected?.icon}
                className="size-[18px] rounded shrink-0 opacity-90"
              />
              <span className="truncate">
                {selected ? selected.name : DEFAULT_LABEL}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search apps…" />
            <CommandList>
              <CommandEmpty>No app found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__default__ default browser"
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  <Globe className="size-[18px] opacity-70" />
                  <span className="flex-1 truncate">{DEFAULT_LABEL}</span>
                  {value === '' && <Check className="size-4 text-primary" />}
                </CommandItem>
                {apps.map((a) => (
                  <CommandItem
                    key={a.path}
                    value={`${a.name} ${a.path}`}
                    onSelect={() => {
                      onChange(a.path)
                      setOpen(false)
                    }}
                  >
                    <Icon src={a.icon} className="size-[18px] rounded shrink-0" />
                    <span className="flex-1 truncate">{a.name}</span>
                    {value === a.path && (
                      <Check className="size-4 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
