import type { SearchInput, SearchItem } from '@rift/api'
import { getHistory, preview } from './tools'

const MAX_HITS = 8
const FETCH_LIMIT = 200

export default async function search({ query }: SearchInput): Promise<SearchItem[]> {
  const q = query.trim().toLowerCase()
  // Empty query: don't dominate main launcher with every clipboard entry.
  // User can invoke the plugin view (search "clip") to see full history.
  if (!q) return []
  const all = await getHistory(FETCH_LIMIT)
  const matched = all.filter((e) => e.text.toLowerCase().includes(q))
  return matched.slice(0, MAX_HITS).map((e, i) => ({
    uid: `clip-${e.ts}-${i}`,
    title: preview(e.text, 80),
    subtitle: `Clipboard · ${new Date(e.ts).toLocaleString()}`,
    icon: 'logo.svg',
    action: { type: 'copy', text: e.text }
  }))
}
