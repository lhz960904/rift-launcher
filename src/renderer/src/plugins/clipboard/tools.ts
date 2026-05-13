import { Clipboard, type ClipEntry } from '@rift/api'

export type { ClipEntry } from '@rift/api'

export async function getHistory(limit?: number): Promise<ClipEntry[]> {
  return Clipboard.history(limit)
}

export async function copyBack(text: string): Promise<void> {
  return Clipboard.copy(text)
}

export async function clearAll(): Promise<void> {
  return Clipboard.clearHistory()
}

export async function removeEntry(ts: number): Promise<void> {
  return Clipboard.removeHistoryItem(ts)
}

export function preview(text: string, maxChars = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxChars ? oneLine.slice(0, maxChars) + '…' : oneLine
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function summarizeLength(text: string): string {
  const len = text.length
  const lines = text.split('\n').length
  if (lines > 1) return `${len} chars · ${lines} lines`
  return `${len} chars`
}
