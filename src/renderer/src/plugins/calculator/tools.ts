export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

const SAFE_CHARS = /^[\d\s+\-*/().%]+$/

export function evaluate(expr: string): EvalResult {
  const trimmed = expr.trim()
  if (!trimmed) return { ok: false, error: '' }
  if (!SAFE_CHARS.test(trimmed)) return { ok: false, error: 'Invalid characters' }
  try {
    const fn = new Function(`"use strict"; return (${trimmed})`) as () => unknown
    const v = fn()
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: 'Not a number' }
    }
    return { ok: true, value: v }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return Number.parseFloat(n.toPrecision(12)).toString()
}
