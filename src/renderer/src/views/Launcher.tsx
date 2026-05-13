import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, Shell } from '@rift/api'
import type { ItemAction, SearchItem } from '../../../shared/plugin-types'
import { rift, type AppEntry } from '../lib/api'
import { BackIcon, Brand, CodeIcon, CogIcon, Kbd, SearchIcon } from '../lib/icons'
import { scoreEntry } from '../lib/score'
import { plugins as allPlugins, type Plugin, type ResolvedCommand } from '../lib/plugins'
import {
  appToResult,
  commandToResult,
  searchItemToResult,
  type ActionDisplayInfo,
  type LauncherResult
} from '../lib/results'
import { PluginHost } from './PluginHost'

type Props = {
  onOpenSettings: () => void
  updateReady: { version: string } | null
}

type Active = { plugin: Plugin; command: ResolvedCommand }

type ArgPrompt = ActionDisplayInfo & {
  urlTemplate: string
  placeholders: string[]
  appPath?: string
}

type ArgMode = {
  prompt: ArgPrompt
  values: Record<string, string>
}

const SCORE_THRESHOLD = 0.05
const PLUGIN_SCORE_BIAS = 1.05
const DYNAMIC_BASE_SCORE = 10
const SEARCH_TIMEOUT_MS = 200

function IconView({ src, fallback }: { src?: string; fallback: string }) {
  return src ? <img src={src} alt="" draggable={false} /> : <span>{fallback}</span>
}

async function runPluginSearch(
  plugin: Plugin,
  query: string
): Promise<SearchItem[]> {
  if (!plugin.search) return []
  try {
    return await Promise.race([
      Promise.resolve(plugin.search({ query })),
      new Promise<SearchItem[]>((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), SEARCH_TIMEOUT_MS)
      )
    ])
  } catch (e) {
    console.warn(`[plugins] ${plugin.manifest.id} search failed:`, e)
    return []
  }
}

async function substituteUrl(
  template: string,
  values: Record<string, string>
): Promise<string> {
  let url = template
  if (/\{clipboard\}/.test(url)) {
    const clip = await Clipboard.read()
    url = url.replace(/\{clipboard\}/g, encodeURIComponent(clip))
  }
  for (const [key, value] of Object.entries(values)) {
    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value))
  }
  // {query} aliases the user-provided argument
  if (values.argument !== undefined) {
    url = url.replace(/\{query\}/g, encodeURIComponent(values.argument))
  }
  return url
}

export function Launcher({ onOpenSettings, updateReady }: Props) {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [active, setActive] = useState<Active | null>(null)
  const [argMode, setArgMode] = useState<ArgMode | null>(null)
  const [dynamicResults, setDynamicResults] = useState<LauncherResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const argInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rift.listApps().then(setApps)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const off = rift.onShow(() => {
      setQ('')
      setSel(0)
      setActive(null)
      setArgMode(null)
      rift.listApps().then(setApps)
      setTimeout(() => inputRef.current?.focus(), 0)
    })
    return off
  }, [])

  useEffect(() => {
    if (!active && !argMode) setTimeout(() => inputRef.current?.focus(), 0)
  }, [active, argMode])

  useEffect(() => {
    if (argMode) setTimeout(() => argInputRef.current?.focus(), 0)
  }, [argMode])

  const openApp = useCallback((path: string) => rift.openApp(path), [])

  const activateCommand = useCallback(
    (plugin: Plugin, command: ResolvedCommand) => {
      if (command.mode === 'view') {
        if (plugin.View) setActive({ plugin, command })
        else console.warn(`[plugins] ${plugin.manifest.id}:${command.name} has no view`)
      } else {
        console.warn(
          `[plugins] no-view command ${plugin.manifest.id}:${command.name} — tools runtime not implemented yet`
        )
      }
    },
    []
  )

  const resolveAndOpen = useCallback(
    async (template: string, values: Record<string, string>, appPath?: string) => {
      const url = await substituteUrl(template, values)
      await Shell.openExternal(url, { appPath })
    },
    []
  )

  const dispatchAction = useCallback(
    (action: ItemAction, plugin: Plugin, display: ActionDisplayInfo) => {
      switch (action.type) {
        case 'copy':
          void Clipboard.copy(action.text)
          rift.hide()
          break
        case 'open-url':
          void resolveAndOpen(action.url, {}, action.appPath)
            .catch((e) => console.warn('[launcher] open-url failed:', e))
            .finally(() => rift.hide())
          break
        case 'open-url-with-args':
          setArgMode({
            prompt: {
              name: display.name,
              iconSrc: display.iconSrc,
              iconFallback: display.iconFallback,
              urlTemplate: action.urlTemplate,
              placeholders: action.placeholders,
              appPath: action.appPath
            },
            values: {}
          })
          break
        case 'open-view': {
          const cmd = plugin.manifest.commands.find(
            (c) => c.name === (action.commandName ?? 'default')
          )
          if (cmd) activateCommand(plugin, cmd)
          break
        }
      }
    },
    [activateCommand, resolveAndOpen]
  )

  const submitArgMode = useCallback(async () => {
    if (!argMode) return
    try {
      await resolveAndOpen(
        argMode.prompt.urlTemplate,
        argMode.values,
        argMode.prompt.appPath
      )
    } catch (e) {
      console.warn('[launcher] open-url-with-args failed:', e)
    }
    setArgMode(null)
    rift.hide()
  }, [argMode, resolveAndOpen])

  const staticResults = useMemo<LauncherResult[]>(() => {
    const commands = allPlugins.flatMap((p) =>
      p.manifest.commands.map((c) => commandToResult(p, c, activateCommand))
    )
    const appResults = apps.map((a) => appToResult(a, openApp))
    return [...commands, ...appResults]
  }, [apps, openApp, activateCommand])

  useEffect(() => {
    const query = q.trim()
    const searchPlugins = allPlugins.filter((p) => p.search)
    if (searchPlugins.length === 0) {
      setDynamicResults([])
      return
    }

    let cancelled = false
    void (async () => {
      const settled = await Promise.allSettled(
        searchPlugins.map(async (p) => ({
          plugin: p,
          items: await runPluginSearch(p, query)
        }))
      )
      if (cancelled) return
      const merged: LauncherResult[] = []
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue
        s.value.items.forEach((item, idx) => {
          merged.push(searchItemToResult(s.value.plugin, item, idx, dispatchAction))
        })
      }
      setDynamicResults(merged)
    })()

    return () => {
      cancelled = true
    }
  }, [q, dispatchAction])

  const filtered: LauncherResult[] = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) {
      // Empty query: dynamic plugin suggestions first (Raycast-style),
      // then plugin commands (Quick Link config / Calculator), then apps.
      const suggestions = dynamicResults
      const commands = staticResults
        .filter((r) => r.id.startsWith('plugin:'))
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
      const appResults = staticResults
        .filter((r) => r.id.startsWith('app:'))
        .slice()
        .sort((a, b) => {
          if (a.mruWeight !== b.mruWeight) return b.mruWeight - a.mruWeight
          return a.title.localeCompare(b.title)
        })
        .slice(0, 50)
      return [...suggestions, ...commands, ...appResults]
    }
    const scored: { r: LauncherResult; score: number }[] = []
    dynamicResults.forEach((r, i) => {
      scored.push({ r, score: DYNAMIC_BASE_SCORE - i * 0.001 })
    })
    for (const r of staticResults) {
      const s = scoreEntry(r.title, r.keywords, query, r.mruWeight)
      if (s > SCORE_THRESHOLD) {
        const bias = r.id.startsWith('plugin:') ? PLUGIN_SCORE_BIAS : 1
        scored.push({ r, score: s * bias })
      }
    }
    const result = scored
      .sort((x, y) => y.score - x.score)
      .slice(0, 50)
      .map((x) => x.r)
    console.log(
      `[launcher] filtered "${query}" — dyn=${dynamicResults.length} static=${staticResults.length} → top:`,
      scored
        .sort((x, y) => y.score - x.score)
        .slice(0, 5)
        .map((x) => ({
          title: x.r.title,
          score: x.score.toFixed(3),
          kind: x.r.id.split(':')[0] + (x.r.id.includes(':dyn:') ? '(dyn)' : '')
        }))
    )
    return result
  }, [staticResults, dynamicResults, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const selected = filtered[sel] ?? null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (argMode) {
      if (e.key === 'Enter') {
        e.preventDefault()
        void submitArgMode()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setArgMode(null)
      }
      return
    }
    if (active) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setActive(null)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(filtered.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selected?.primaryAction.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      rift.hide()
    } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      onOpenSettings()
    }
  }

  const argPlaceholderName = argMode?.prompt.placeholders[0] ?? 'argument'
  const argValue = argMode ? argMode.values[argPlaceholderName] ?? '' : ''

  const renderHead = () => {
    if (argMode) {
      return (
        <div className="lx-search arg-mode">
          <button
            className="lx-back-btn"
            onClick={() => setArgMode(null)}
            aria-label="Back"
            tabIndex={-1}
          >
            <BackIcon size={16} />
          </button>
          <span className="lx-arg-chip">
            <IconView
              src={argMode.prompt.iconSrc}
              fallback={argMode.prompt.iconFallback}
            />
            <span>{argMode.prompt.name}</span>
          </span>
          <input
            ref={argInputRef}
            value={argValue}
            onChange={(e) =>
              setArgMode((prev) =>
                prev
                  ? {
                      ...prev,
                      values: { ...prev.values, [argPlaceholderName]: e.target.value }
                    }
                  : prev
              )
            }
            placeholder={`{${argPlaceholderName}}`}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      )
    }
    return (
      <div className="lx-search">
        <span className="ico">
          <SearchIcon size={22} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search applications & commands…"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <span className="meta">
          {selected?.argumentSlot && (
            <span className="lx-arg-slot">{`{${selected.argumentSlot}}`}</span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="lx" onKeyDown={onKeyDown}>
      {active ? (
        <PluginHost
          plugin={active.plugin}
          commandName={active.command.name}
          onClose={() => setActive(null)}
        />
      ) : (
        <>
          {updateReady && !bannerDismissed && (
            <div
              className="update-banner"
              role="button"
              tabIndex={0}
              onClick={() => rift.installUpdate()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  rift.installUpdate()
                }
              }}
            >
              <span className="dot" />
              <span className="text">
                Update v{updateReady.version} ready · <strong>Click to restart</strong>
              </span>
              <button
                className="close"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation()
                  setBannerDismissed(true)
                }}
              >
                ×
              </button>
            </div>
          )}
          {renderHead()}

          {argMode ? (
            <div className="lx-arg-body">
              <div className="lx-arg-hint">
                Press <Kbd keys={['↵']} /> to open
                {argMode.prompt.appPath ? ' with chosen app' : ''}.
                {/\{clipboard\}/.test(argMode.prompt.urlTemplate) && (
                  <span> Clipboard will be auto-filled.</span>
                )}
              </div>
              <div className="lx-arg-template">{argMode.prompt.urlTemplate}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              {apps.length === 0 ? 'Indexing applications…' : 'No matches'}
            </div>
          ) : (
            <>
              <div className="lx-section">
                <span>Results</span>
                <span>{String(filtered.length).padStart(2, '0')}</span>
              </div>
              <div className="lx-list" ref={listRef}>
                {filtered.map((r, i) => (
                  <div
                    key={r.id}
                    data-idx={i}
                    className={'row' + (i === sel ? ' sel' : '')}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => r.primaryAction.run()}
                  >
                    <div className="tile">
                      <IconView src={r.iconSrc} fallback={r.iconFallback} />
                    </div>
                    <div className="row-body">
                      <div className="row-title">{r.title}</div>
                      {r.subtitle && <div className="row-sub">{r.subtitle}</div>}
                    </div>
                    <div className="row-category">{r.category}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="lx-foot">
        <div className="l">
          {argMode ? (
            <span className="lx-foot-ctx">
              <span className="lx-foot-ctx-icon">
                <IconView
                  src={argMode.prompt.iconSrc}
                  fallback={argMode.prompt.iconFallback}
                />
              </span>
              {argMode.prompt.name}
            </span>
          ) : selected?.context ? (
            <span className="lx-foot-ctx">
              <span className="lx-foot-ctx-icon">
                <IconView
                  src={selected.context.iconSrc}
                  fallback={selected.context.iconFallback}
                />
              </span>
              {selected.context.name}
            </span>
          ) : (
            <Brand />
          )}
        </div>
        <div className="r">
          {argMode ? (
            <>
              <span className="act act-primary">
                <strong>Open</strong>
                <Kbd keys={['↵']} />
              </span>
              <span className="act">
                Back
                <Kbd keys={['Esc']} />
              </span>
            </>
          ) : (
            <>
              {!active && selected && (
                <span className="act act-primary">
                  <strong>{selected.primaryAction.label}</strong>
                  <Kbd keys={['↵']} />
                </span>
              )}
              <button
                className="act"
                onClick={() => rift.toggleDevTools()}
                aria-label="Toggle DevTools"
                title="Toggle DevTools (⌥⌘I)"
              >
                <CodeIcon size={14} />
              </button>
              <button
                className="act"
                onClick={onOpenSettings}
                aria-label="Settings"
              >
                <CogIcon size={14} />
                <Kbd keys={['⌘', ',']} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
