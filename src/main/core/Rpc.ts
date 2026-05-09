/**
 * Rpc — main-side dispatcher for the unified `ipcMain.handle('rpc', …)`
 * channel. Modules call `registerRpc('foo.bar', handler)` instead of
 * `ipcMain.handle('foo:bar', handler)`. Every call is logged with method,
 * outcome, duration, and short requestId for grep-ability.
 */
import { ipcMain } from 'electron'
import { RPC_CHANNEL, type RpcRequest, type RpcResponse } from '../../shared/rpc'

type RpcHandler<P = unknown, R = unknown> = (payload: P) => R | Promise<R>

const handlers = new Map<string, RpcHandler<unknown, unknown>>()
let routerInstalled = false

export function registerRpc<P = unknown, R = unknown>(
  method: string,
  handler: RpcHandler<P, R>
): void {
  if (handlers.has(method)) {
    throw new Error(`RPC method already registered: ${method}`)
  }
  handlers.set(method, handler as RpcHandler<unknown, unknown>)
}

export function installRpcRouter(): void {
  if (routerInstalled) return
  routerInstalled = true

  ipcMain.handle(RPC_CHANNEL, async (_e, req: RpcRequest): Promise<RpcResponse> => {
    const t0 = Date.now()
    const reqShort = req.requestId.slice(0, 8)
    const handler = handlers.get(req.method)
    if (!handler) {
      const msg = `Unknown RPC method: ${req.method}`
      console.error(`[rpc] ${req.method} fail in 0ms (req=${reqShort}): ${msg}`)
      return {
        requestId: req.requestId,
        success: false,
        error: { code: 'METHOD_NOT_FOUND', message: msg },
        timestamp: Date.now()
      }
    }
    try {
      const data = await handler(req.payload)
      const dur = Date.now() - t0
      console.log(`[rpc] ${req.method} ok in ${dur}ms (req=${reqShort})`)
      return { requestId: req.requestId, success: true, data, timestamp: Date.now() }
    } catch (e) {
      const err = e as Error & { code?: string }
      const dur = Date.now() - t0
      console.error(
        `[rpc] ${req.method} fail in ${dur}ms (req=${reqShort}): ${err.message}`
      )
      return {
        requestId: req.requestId,
        success: false,
        error: {
          code: err.code || 'UNKNOWN',
          message: err.message,
          stack: err.stack
        },
        timestamp: Date.now()
      }
    }
  })
}
