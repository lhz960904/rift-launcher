/**
 * Shared RPC envelope — sent through a single `ipcMain.handle('rpc', …)`
 * channel. The renderer's `rpc()` helper builds requests; the main router
 * dispatches by `method` and wraps responses.
 *
 * Methods use dot-notation (`apps.list`, `settings.set`). Events (one-way
 * main → renderer push like `launcher:show`) keep their direct channel
 * names — envelope adds no value to single-shot pushes.
 *
 * Single-window app, single requestId is enough to correlate request ↔
 * response in logs. Distributed traceId for plugin / multi-window era is
 * documented in docs/IPC.md.
 */

export type RpcRequest<P = unknown> = {
  requestId: string
  method: string
  payload?: P
  timestamp: number
}

export type RpcSuccess<R = unknown> = {
  requestId: string
  success: true
  data: R
  timestamp: number
}

export type RpcError = {
  requestId: string
  success: false
  error: { code: string; message: string; stack?: string }
  timestamp: number
}

export type RpcResponse<R = unknown> = RpcSuccess<R> | RpcError

export const RPC_CHANNEL = 'rpc'

/** Thrown by renderer-side rpc() when main returns a failure envelope. */
export class RpcCallError extends Error {
  readonly code: string

  constructor(code: string, message: string, public readonly remoteStack?: string) {
    super(message)
    this.name = 'RpcCallError'
    this.code = code
  }
}
