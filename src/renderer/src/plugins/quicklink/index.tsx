import { useEffect, useMemo, useState } from 'react'
import { Apps, type AppEntry } from '@rift/api'
import type { PluginViewProps } from '../../lib/plugins'
import {
  listLinks,
  makeLink,
  normalizeUrl,
  parseKeywords,
  parsePlaceholders,
  removeLink,
  upsertLink,
  type QuickLink
} from './tools'
import { AppPicker } from './app-picker'

const URL_HANDLER_SCHEMES = ['http', 'https']

function isUrlHandler(app: AppEntry): boolean {
  return app.urlSchemes.some((s) => URL_HANDLER_SCHEMES.includes(s))
}

type Mode =
  | { kind: 'list' }
  | { kind: 'edit'; link: QuickLink; isNew: boolean }

type Draft = {
  title: string
  url: string
  keywords: string
  appPath: string
}

const EMPTY_DRAFT: Draft = { title: '', url: '', keywords: '', appPath: '' }

export default function QuickLinkView(_: PluginViewProps) {
  const [links, setLinks] = useState<QuickLink[]>([])
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [installedApps, setInstalledApps] = useState<AppEntry[]>([])

  const urlHandlerApps = useMemo(
    () =>
      installedApps
        .filter(isUrlHandler)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [installedApps]
  )

  const refresh = async () => setLinks(await listLinks())

  useEffect(() => {
    void refresh()
    void Apps.list().then(setInstalledApps)
  }, [])

  const startAdd = () => {
    setDraft(EMPTY_DRAFT)
    setMode({ kind: 'edit', link: makeLink('', '', []), isNew: true })
  }

  const startEdit = (link: QuickLink) => {
    setDraft({
      title: link.title,
      url: link.url,
      keywords: link.keywords.join(', '),
      appPath: link.appPath ?? ''
    })
    setMode({ kind: 'edit', link, isNew: false })
  }

  const cancelEdit = () => setMode({ kind: 'list' })

  const save = async () => {
    if (mode.kind !== 'edit') return
    const title = draft.title.trim()
    const url = normalizeUrl(draft.url.trim())
    if (!title || !url) return
    const next: QuickLink = {
      id: mode.link.id,
      title,
      url,
      keywords: parseKeywords(draft.keywords),
      appPath: draft.appPath || undefined
    }
    await upsertLink(next)
    await refresh()
    setMode({ kind: 'list' })
  }

  const del = async (id: string) => {
    await removeLink(id)
    await refresh()
  }

  const onFieldKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void save()
    }
  }

  if (mode.kind === 'edit') {
    const placeholders = parsePlaceholders(draft.url)
    return (
      <div className="ql-edit">
        <div className="ql-edit-row">
          <label>Name</label>
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={onFieldKey}
            placeholder="Google Search"
            spellCheck={false}
          />
        </div>
        <div className="ql-edit-row">
          <label>Link</label>
          <input
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            onKeyDown={onFieldKey}
            placeholder="https://google.com/search?q={argument}"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <div className="ql-hint">
            Use <code>{'{argument}'}</code> for user input,{' '}
            <code>{'{clipboard}'}</code> for the current clipboard.
            {(placeholders.needsArgument || placeholders.hasClipboard) && (
              <span className="ql-hint-active">
                {' '}— detected:
                {placeholders.needsArgument && (
                  <span className="ql-chip mini"> argument</span>
                )}
                {placeholders.hasClipboard && (
                  <span className="ql-chip mini"> clipboard</span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="ql-edit-row">
          <label>Open With</label>
          <AppPicker
            apps={urlHandlerApps}
            value={draft.appPath}
            onChange={(p) => setDraft({ ...draft, appPath: p })}
          />
        </div>
        <div className="ql-edit-row">
          <label>Keywords</label>
          <input
            value={draft.keywords}
            onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
            onKeyDown={onFieldKey}
            placeholder="gh, github (comma separated)"
            spellCheck={false}
          />
        </div>
        <div className="ql-edit-actions">
          <button className="ql-btn" onClick={cancelEdit}>
            Cancel
          </button>
          <button className="ql-btn primary" onClick={save}>
            {mode.isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ql-list">
      <div className="ql-list-head">
        <span>
          {links.length} quick {links.length === 1 ? 'link' : 'links'}
        </span>
        <button className="ql-btn primary" onClick={startAdd}>
          + Add
        </button>
      </div>
      {links.length === 0 ? (
        <div className="ql-empty">
          <div className="ql-empty-title">No quick links yet</div>
          <div className="ql-empty-hint">
            Add a URL with optional <code>{'{argument}'}</code> /{' '}
            <code>{'{clipboard}'}</code> placeholders, then trigger by keyword.
          </div>
        </div>
      ) : (
        <ul className="ql-items">
          {links.map((l) => {
            const app = l.appPath
              ? installedApps.find((a) => a.path === l.appPath)
              : undefined
            return (
              <li key={l.id} className="ql-item">
                <div className="ql-item-body">
                  <div className="ql-item-title">{l.title}</div>
                  <div className="ql-item-url">{l.url}</div>
                  <div className="ql-item-meta">
                    {app && (
                      <span className="ql-chip mini">
                        {app.icon && (
                          <img className="ql-chip-icon" src={app.icon} alt="" />
                        )}
                        {app.name}
                      </span>
                    )}
                    {l.keywords.map((k) => (
                      <span key={k} className="ql-chip mini">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ql-item-actions">
                  <button className="ql-btn" onClick={() => startEdit(l)}>
                    Edit
                  </button>
                  <button className="ql-btn danger" onClick={() => del(l.id)}>
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
