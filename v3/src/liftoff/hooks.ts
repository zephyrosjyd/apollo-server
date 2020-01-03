import { AnyFunc, UnionToIntersection } from "src/utilities/types"

export const current = Symbol('Current hook impl')
const set = Symbol('Set hook implementations')

export type Hooks<T> = T & {
  readonly [current]: T
  [set](current: T, parent?: T): T
}

export function hooks<T extends object>(base: T): Hooks<T> {
  const context: any = {}
  for (const prop in base) {
    if (typeof base[prop] === 'function')
      context[prop] = (...args: any[]) =>
        context[current][prop].apply(context[current], args)
    else
      Object.defineProperty(context, prop, {
        get() {
          return context[current][prop]
        }
      })
  }
  context[current] = base
  context[set] = (provider: T): T =>
    context[current] = provider
  return context
}

interface Returned<F extends AnyFunc> {
  type: 'returned'
  returned: ReturnType<F>
}

interface Threw<_F extends AnyFunc> {
  type: 'threw'
  threw: any
}

export type Result<F extends AnyFunc> = Returned<F> | Threw<F>

export const provides = Symbol('Implemented context')
export const attach = Symbol('Attach provider')
export const detach = Symbol('Detach provider')

export type Provider<T> = {
  readonly [provides]: Hooks<T>[]
  [attach](): UnionToIntersection<T> & { [detach]?(): void }
}

export const Scope = hooks({
  apply<F extends AnyFunc>
    (func: F, self: ThisParameterType<F>, params: Parameters<F>, ...providers: Provider<any>[]): ReturnType<F> {
      const restore: any = []
      for (const p of providers) {
        const iface = p[attach]()
        const frame: any = []
        restore.push(frame)
        for (const ctx of p[provides]) {
          frame.push(ctx[current])
          ctx[set](iface)
        }
      }
      try {
        return func.apply(self, params)
      } finally {
        let i = providers.length; while (i --> 0) {
          const p = providers[i]
          const frame = restore[i]
          let j = p[provides].length; while (j --> 0) {
            const ctx = p[provides][j]
            ctx[set](frame[j])
          }
        }
      }
    }
})
