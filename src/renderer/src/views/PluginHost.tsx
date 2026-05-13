import { BackIcon } from '../lib/icons'
import type { Plugin } from '../lib/plugins'

type Props = {
  plugin: Plugin
  commandName: string
  onClose: () => void
}

export function PluginHost({ plugin, commandName, onClose }: Props) {
  const { View, manifest } = plugin
  return (
    <>
      <div className="lx-plugin-head">
        <button className="lx-plugin-back" onClick={onClose} aria-label="Back">
          <BackIcon size={16} />
        </button>
        <img className="lx-plugin-logo" src={manifest.iconSrc} alt="" draggable={false} />
        <span className="lx-plugin-title">{manifest.name}</span>
      </div>
      <div className="lx-plugin-body">
        {View ? (
          <View commandName={commandName} onClose={onClose} />
        ) : (
          <div className="empty">This command has no view.</div>
        )}
      </div>
    </>
  )
}
