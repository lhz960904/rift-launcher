import { useEffect, useRef, useState } from 'react'
import { rift, type Settings } from '../lib/api'
import {
  Brand,
  BackIcon,
  CogIcon,
  KeyIcon,
  Kbd,
  PowerIcon,
  RefreshIcon,
  SunIcon
} from '../lib/icons'
import { eventToAccelerator, formatAccelerator } from '../lib/hotkey'

type Props = {
  settings: Settings
  onChange: (patch: Partial<Settings>) => Promise<{ ok: boolean; error?: string }>
  onBack: () => void
}

export function SettingsView({ settings, onChange, onBack }: Props) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildResult, setRebuildResult] = useState<string | null>(null)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    console.log('[settings] recording effect, recording=', recording)
    if (!recording) return
    const handler = async (e: KeyboardEvent) => {
      console.log('[settings] recording keydown', e.key, 'meta:', e.metaKey, 'ctrl:', e.ctrlKey, 'alt:', e.altKey, 'shift:', e.shiftKey)
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const acc = eventToAccelerator(e)
      console.log('[settings] accelerator:', acc)
      if (!acc) return
      setRecording(false)
      const res = await onChange({ hotkey: acc })
      console.log('[settings] register result:', res)
      if (!res.ok) setError(res.error || 'Failed to register shortcut')
      else setError(null)
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true } as never)
  }, [recording, onChange])

  useEffect(() => {
    if (recording) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }
      if (e.metaKey && e.key === ',') {
        if (Date.now() - mountedAt.current < 300) return
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, onBack])

  const setTheme = (theme: 'dark' | 'light') => {
    onChange({ theme })
  }

  const onRebuildIndex = async () => {
    setRebuilding(true)
    setRebuildResult(null)
    try {
      const { count } = await rift.rebuildAppIndex()
      setRebuildResult(`✓ rebuilt ${count} apps`)
    } catch (e) {
      setRebuildResult(`✗ ${(e as Error).message}`)
    } finally {
      setRebuilding(false)
      setTimeout(() => setRebuildResult(null), 5000)
    }
  }

  return (
    <div className="lx">
      <div className="lx-search">
        <span className="ico">
          <CogIcon size={22} />
        </span>
        <input placeholder="Settings" readOnly value="" />
        <span className="meta">
          <Kbd keys={['esc']} />
        </span>
      </div>

      {error && <div className="banner-error">{error}</div>}

      <div className="set-list">
        <div className="set-row">
          <span className="gl">
            <KeyIcon />
          </span>
          <div>
            <div className="lab">Hotkey</div>
            <div className="desc">
              Toggle launcher with this shortcut. Click to record a new combo.
            </div>
          </div>
          <button
            className={
              'hotkey-recorder' + (recording ? ' recording' : '') + (error ? ' error' : '')
            }
            onClick={() => {
              setError(null)
              setRecording((r) => !r)
            }}
          >
            {recording ? 'Press keys…' : formatAccelerator(settings.hotkey)}
          </button>
        </div>

        <div className="set-row">
          <span className="gl">
            <SunIcon />
          </span>
          <div>
            <div className="lab">Appearance</div>
            <div className="desc">Switch between dark and light theme.</div>
          </div>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className={'chip-pick' + (settings.theme === 'dark' ? ' on' : '')}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              className={'chip-pick' + (settings.theme === 'light' ? ' on' : '')}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>

        <div className="set-row">
          <span className="gl">
            <PowerIcon />
          </span>
          <div>
            <div className="lab">Launch at login</div>
            <div className="desc">Start Rift automatically when you log in to your Mac.</div>
          </div>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className={'chip-pick' + (settings.launchAtLogin ? ' on' : '')}
              onClick={() => onChange({ launchAtLogin: true })}
            >
              On
            </button>
            <button
              className={'chip-pick' + (!settings.launchAtLogin ? ' on' : '')}
              onClick={() => onChange({ launchAtLogin: false })}
            >
              Off
            </button>
          </div>
        </div>

        <div className="set-row">
          <span className="gl">
            <RefreshIcon />
          </span>
          <div>
            <div className="lab">App index</div>
            <div className="desc">
              Rescan installed apps. Useful if some don't show up.
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {rebuildResult && (
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{rebuildResult}</span>
            )}
            <button className="chip-pick" disabled={rebuilding} onClick={onRebuildIndex}>
              {rebuilding ? 'Rebuilding…' : 'Rebuild now'}
            </button>
          </div>
        </div>
      </div>

      <div className="lx-foot">
        <div className="l">
          <Brand />
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Settings</span>
        </div>
        <div className="r">
          <button className="act" onClick={onBack}>
            <BackIcon size={14} /> Back <Kbd keys={['esc']} />
          </button>
        </div>
      </div>
    </div>
  )
}
