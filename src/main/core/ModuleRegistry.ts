/**
 * ModuleRegistry — central DI container for main-process modules.
 *
 * Modules are registered with a string key, then resolved on demand via
 * `get(key)`. Constructors only stash the registry reference; dependencies
 * are resolved lazily inside method calls so circular references between
 * modules (e.g., HotkeyModule ↔ TrayModule) work without bootstrap order
 * gymnastics.
 *
 * Lifecycle: register all → bootstrap each in order → ... → shutdown each
 * in reverse on quit.
 */
export interface Module {
  bootstrap?(): void | Promise<void>
  shutdown?(): void | Promise<void>
}

export class ModuleRegistry {
  private services = new Map<string, Module>()
  private order: string[] = []

  register<T extends Module>(key: string, instance: T): T {
    if (this.services.has(key)) {
      throw new Error(`Module already registered: ${key}`)
    }
    this.services.set(key, instance)
    this.order.push(key)
    return instance
  }

  get<T extends Module>(key: string): T {
    const m = this.services.get(key)
    if (!m) throw new Error(`Module not registered: ${key}`)
    return m as T
  }

  /** registration order — used for sequential bootstrap */
  all(): Module[] {
    return this.order.map((k) => this.services.get(k)!)
  }

  /** reverse registration order — used for shutdown */
  allReversed(): Module[] {
    return [...this.order].reverse().map((k) => this.services.get(k)!)
  }
}
