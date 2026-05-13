import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppEntry } from '@rift/api'

type Option = { path: string; name: string; icon: string | null }

const DEFAULT_OPTION: Option = { path: '', name: 'Default browser', icon: null }

type Props = {
  apps: AppEntry[]
  value: string
  onChange: (path: string) => void
}

export function AppPicker({ apps, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const options: Option[] = useMemo(
    () => [DEFAULT_OPTION, ...apps.map((a) => ({ path: a.path, name: a.name, icon: a.icon }))],
    [apps]
  )
  const selected = options.find((o) => o.path === value) ?? DEFAULT_OPTION

  useEffect(() => {
    if (!open) return
    const idx = options.findIndex((o) => o.path === value)
    setHighlight(idx >= 0 ? idx : 0)
  }, [open, value, options])

  useEffect(() => {
    if (!open) return
    const el = menuRef.current?.querySelector<HTMLElement>(
      `[data-pick-idx="${highlight}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const pick = (path: string) => {
    onChange(path)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(options.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(options[highlight].path)
    }
  }

  const renderIcon = (opt: Option) =>
    opt.icon ? (
      <img className="ql-pick-icon" src={opt.icon} alt="" draggable={false} />
    ) : (
      <span className="ql-pick-icon ql-pick-icon-fallback">🌐</span>
    )

  return (
    <div className="ql-pick" ref={rootRef} onKeyDown={onKey} tabIndex={0}>
      <button
        type="button"
        className="ql-pick-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {renderIcon(selected)}
        <span className="ql-pick-name">{selected.name}</span>
        <span className="ql-pick-caret">▾</span>
      </button>
      {open && (
        <div className="ql-pick-menu" ref={menuRef} role="listbox">
          {options.map((opt, i) => (
            <div
              key={opt.path || 'default'}
              data-pick-idx={i}
              role="option"
              aria-selected={opt.path === value}
              className={
                'ql-pick-opt' +
                (i === highlight ? ' hl' : '') +
                (opt.path === value ? ' sel' : '')
              }
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(opt.path)
              }}
            >
              {renderIcon(opt)}
              <span className="ql-pick-name">{opt.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
