import type { SearchInput, SearchItem } from '@rift/api'
import { evaluate, formatNumber } from './tools'

const HAS_OPERATOR = /[+\-*/%]/

export default function search({ query }: SearchInput): SearchItem[] {
  const trimmed = query.trim()
  if (!trimmed || !HAS_OPERATOR.test(trimmed)) return []
  const r = evaluate(trimmed)
  if (!r.ok) return []
  const value = formatNumber(r.value)
  return [
    {
      uid: 'calc-result',
      title: `= ${value}`,
      subtitle: `Calculator · ${trimmed}`,
      icon: 'logo.svg',
      action: { type: 'copy', text: value }
    }
  ]
}
