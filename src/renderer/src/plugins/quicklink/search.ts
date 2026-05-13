import type { ItemAction, SearchInput, SearchItem } from '@rift/api'
import { listLinks, parsePlaceholders, type QuickLink } from './tools'

const MAX_HITS = 8

function actionFor(link: QuickLink): ItemAction {
  const { needsArgument } = parsePlaceholders(link.url)
  if (needsArgument) {
    return {
      type: 'open-url-with-args',
      urlTemplate: link.url,
      placeholders: ['argument'],
      appPath: link.appPath
    }
  }
  return { type: 'open-url', url: link.url, appPath: link.appPath }
}

export default async function search({ query }: SearchInput): Promise<SearchItem[]> {
  const q = query.trim().toLowerCase()
  const links = await listLinks()
  // Empty query = "show me your saved quicklinks as suggestions".
  const matched = !q
    ? links
    : links.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          l.keywords.some((k) => k.toLowerCase().includes(q))
      )
  console.log(
    `[quicklink] search "${q}" → ${matched.length}/${links.length}`,
    matched.map((l) => l.title)
  )
  return matched.slice(0, MAX_HITS).map((l) => ({
    uid: `ql-${l.id}`,
    title: l.title,
    subtitle: l.url,
    icon: 'logo.svg',
    action: actionFor(l)
  }))
}
