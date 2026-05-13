import { Storage } from '@rift/api'

const NS = 'quicklink'
const KEY = 'links'

export type QuickLink = {
  id: string
  title: string
  url: string
  keywords: string[]
  /** Absolute .app bundle path to open with. Empty / undefined → default browser. */
  appPath?: string
}

const store = Storage.scope(NS)

export async function listLinks(): Promise<QuickLink[]> {
  const links = (await store.get<QuickLink[]>(KEY)) ?? []
  console.log('[quicklink] listLinks →', links.length, links.map((l) => l.title))
  return links
}

export async function saveLinks(links: QuickLink[]): Promise<void> {
  await store.set(KEY, links)
}

export async function upsertLink(link: QuickLink): Promise<void> {
  const list = await listLinks()
  const idx = list.findIndex((l) => l.id === link.id)
  if (idx >= 0) list[idx] = link
  else list.push(link)
  await saveLinks(list)
}

export async function removeLink(id: string): Promise<void> {
  const list = await listLinks()
  await saveLinks(list.filter((l) => l.id !== id))
}

export function makeLink(title: string, url: string, keywords: string[]): QuickLink {
  return { id: crypto.randomUUID(), title, url, keywords }
}

export function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function normalizeUrl(url: string): string {
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) return `https://${url}`
  return url
}

export type PlaceholderInfo = {
  /** User input placeholder ({argument} or its alias {query}) present in template. */
  needsArgument: boolean
  /** {clipboard} present — auto-substituted at execution time. */
  hasClipboard: boolean
}

export function parsePlaceholders(url: string): PlaceholderInfo {
  return {
    needsArgument: /\{argument\}|\{query\}/.test(url),
    hasClipboard: /\{clipboard\}/.test(url)
  }
}
