import { useEffect, useMemo, useRef, useState } from 'react'
import { rift, type AppEntry } from '../lib/api'
import { ArrowIcon, Brand, CogIcon, Kbd, SearchIcon } from '../lib/icons'
import { scoreEntry } from '../lib/score'

type Props = { onOpenSettings: () => void }

const SCORE_THRESHOLD = 0.05

export function Launcher({ onOpenSettings }: Props) {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
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
      rift.listApps().then(setApps)
      setTimeout(() => inputRef.current?.focus(), 0)
    })
    return off
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) {
      return [...apps]
        .sort((a, b) => {
          if (a.mruCount !== b.mruCount) return b.mruCount - a.mruCount
          return a.name.localeCompare(b.name)
        })
        .slice(0, 50)
    }
    return apps
      .map((a) => ({ a, s: scoreEntry(a.name, a.aliases, query, a.mruCount) }))
      .filter((x) => x.s > SCORE_THRESHOLD)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a)
      .slice(0, 50)
  }, [apps, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const open = (a: AppEntry) => {
    rift.openApp(a.path)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    console.log('[launcher] keydown', e.key, 'meta:', e.metaKey, 'ctrl:', e.ctrlKey)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(filtered.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[sel]
      if (item) open(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      rift.hide()
    } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      console.log('[launcher] opening settings')
      onOpenSettings()
    }
  }

  return (
    <div className="lx" onKeyDown={onKeyDown}>
      <div className="lx-search">
        <span className="ico">
          <SearchIcon size={22} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search applications…"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <span className="meta">
          <span className="lx-scope">
            <span className="lx-scope-dot" />
            Applications
          </span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {apps.length === 0 ? 'Indexing applications…' : 'No matches'}
        </div>
      ) : (
        <>
          <div className="lx-section">
            <span>Applications</span>
            <span>{String(filtered.length).padStart(2, '0')}</span>
          </div>
          <div className="lx-list" ref={listRef}>
            {filtered.map((a, i) => (
              <div
                key={a.id}
                data-idx={i}
                className={'row' + (i === sel ? ' sel' : '')}
                onMouseEnter={() => setSel(i)}
                onClick={() => open(a)}
              >
                <div className="tile">
                  {a.icon ? (
                    <img src={a.icon} alt="" draggable={false} />
                  ) : (
                    <span>{a.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="row-body">
                  <div className="row-title">{a.name}</div>
                </div>
                <div className="row-meta">
                  {i === sel && (
                    <>
                      <span style={{ marginRight: 4 }}>Open</span>
                      <Kbd keys={['↵']} />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="lx-foot">
        <div className="l">
          <Brand />
        </div>
        <div className="r">
          <button className="act" onClick={onOpenSettings}>
            <CogIcon size={14} /> Settings <Kbd keys={['⌘', ',']} />
          </button>
          <span className="act">
            Open <Kbd keys={['↵']} />
          </span>
        </div>
      </div>
    </div>
  )
}
