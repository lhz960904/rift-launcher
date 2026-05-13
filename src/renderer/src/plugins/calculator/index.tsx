import { useMemo, useRef, useState } from 'react'
import { Clipboard } from '@rift/api'
import type { PluginViewProps } from '../../lib/plugins'
import { evaluate, formatNumber } from './tools'

export default function CalculatorView({ onClose }: PluginViewProps) {
  const [expr, setExpr] = useState('')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const result = useMemo(() => evaluate(expr), [expr])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && result.ok) {
      e.preventDefault()
      e.stopPropagation()
      void Clipboard.copy(formatNumber(result.value))
      setCopied(true)
      window.setTimeout(() => onClose(), 350)
    }
  }

  return (
    <div className="calc">
      <input
        ref={inputRef}
        autoFocus
        value={expr}
        onChange={(e) => {
          setExpr(e.target.value)
          setCopied(false)
        }}
        onKeyDown={onKeyDown}
        placeholder="1 + 2 * 3"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="calc-input"
      />
      <div className="calc-result">
        {result.ok ? (
          <span className="calc-value">{formatNumber(result.value)}</span>
        ) : !expr ? (
          <span className="calc-hint">Type an arithmetic expression</span>
        ) : null}
      </div>
      {result.ok && (
        <div className="calc-foot">{copied ? 'Copied ✓' : 'Press ↵ to copy'}</div>
      )}
    </div>
  )
}
