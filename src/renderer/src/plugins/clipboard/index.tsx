import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import type { PluginViewProps } from '../../lib/plugins'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  copyBack,
  getHistory,
  preview,
  summarizeLength,
  timeAgo,
  type ClipEntry
} from './tools'

type TimeBucket = 'Today' | 'Yesterday' | 'Earlier'

function bucketOf(ts: number): TimeBucket {
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  if (ts >= startOfToday) return 'Today'
  if (ts >= startOfYesterday) return 'Yesterday'
  return 'Earlier'
}

function groupByTime(entries: ClipEntry[]): Record<TimeBucket, ClipEntry[]> {
  const groups: Record<TimeBucket, ClipEntry[]> = {
    Today: [],
    Yesterday: [],
    Earlier: []
  }
  for (const e of entries) {
    groups[bucketOf(e.ts)].push(e)
  }
  return groups
}

function lineCount(text: string): number {
  return text.split('\n').length
}

export default function ClipboardHistoryView({ onClose }: PluginViewProps) {
  const [entries, setEntries] = useState<ClipEntry[] | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedValue, setSelectedValue] = useState('')

  useEffect(() => {
    void getHistory().then(setEntries)
  }, [])

  const entriesByValue = useMemo(
    () => new Map((entries ?? []).map((e) => [String(e.ts), e])),
    [entries]
  )

  const groups = useMemo(
    () => (entries ? groupByTime(entries) : null),
    [entries]
  )

  const selected = selectedValue ? entriesByValue.get(selectedValue) : undefined

  const onPick = async (entry: ClipEntry) => {
    await copyBack(entry.text)
    onClose()
  }

  if (entries === null) return null

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="text-sm font-medium text-fg-2">
          No clipboard history yet
        </div>
        <div className="mt-2 text-xs text-fg-4">
          Copy text from any app to start building history.
        </div>
      </div>
    )
  }

  const renderGroup = (label: TimeBucket, items: ClipEntry[]) => {
    if (items.length === 0) return null
    return (
      <CommandGroup key={label} heading={label}>
        {items.map((e) => (
          <CommandItem
            key={e.ts}
            value={String(e.ts)}
            onSelect={() => onPick(e)}
            className="gap-2.5 py-2"
          >
            <FileText className="size-4 shrink-0 text-fg-3" />
            <span className="flex-1 truncate text-sm">{preview(e.text, 60)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    )
  }

  return (
    <Command
      className="-mx-1 flex h-full flex-col bg-transparent"
      value={selectedValue}
      onValueChange={setSelectedValue}
      filter={(value, search) => {
        if (!search) return 1
        const entry = entriesByValue.get(value)
        if (!entry) return 0
        return entry.text.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
      }}
    >
      <CommandInput
        value={filter}
        onValueChange={setFilter}
        placeholder="Type to filter entries…"
        autoFocus
      />
      <div className="flex min-h-0 flex-1">
        <CommandList className="max-h-none w-[42%] flex-none overflow-y-auto border-r-[0.5px] pr-1">
          <CommandEmpty>No matches.</CommandEmpty>
          {groups && renderGroup('Today', groups.Today)}
          {groups && renderGroup('Yesterday', groups.Yesterday)}
          {groups && renderGroup('Earlier', groups.Earlier)}
        </CommandList>
        <div className="flex min-w-0 flex-1 flex-col pl-3">
          {selected ? <Preview entry={selected} /> : <NoSelection />}
        </div>
      </div>
    </Command>
  )
}

function Preview({ entry }: { entry: ClipEntry }) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm text-fg">
          {entry.text}
        </pre>
      </div>
      <div className="mt-2 border-t-[0.5px] pt-3">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-fg-3">
          Information
        </div>
        <div className="space-y-1.5">
          <Meta label="Content type" value="Text" />
          <Meta label="Length" value={summarizeLength(entry.text)} />
          {lineCount(entry.text) > 1 && (
            <Meta label="Lines" value={String(lineCount(entry.text))} />
          )}
          <Meta label="Copied" value={timeAgo(entry.ts)} />
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-fg-3">{label}</span>
      <span className="font-mono text-fg-2">{value}</span>
    </div>
  )
}

function NoSelection() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-fg-4">
      Select an entry to preview
    </div>
  )
}
