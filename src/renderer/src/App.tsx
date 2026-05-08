import { useEffect, useState } from 'react'
import { rift, type Settings } from './lib/api'
import { Launcher } from './views/Launcher'
import { SettingsView } from './views/Settings'

type View = 'launcher' | 'settings'

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('launcher')

  useEffect(() => {
    rift.getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    const offShow = rift.onShow(() => {
      setView('launcher')
    })
    return offShow
  }, [])

  useEffect(() => {
    if (settings) document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings])

  if (!settings) return null

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    return rift.setSettings(patch)
  }

  console.log('[app] render view=', view)
  return view === 'launcher' ? (
    <Launcher
      onOpenSettings={() => {
        console.log('[app] setView -> settings')
        setView('settings')
      }}
    />
  ) : (
    <SettingsView
      settings={settings}
      onChange={update}
      onBack={() => {
        console.log('[app] onBack -> launcher')
        setView('launcher')
      }}
    />
  )
}
