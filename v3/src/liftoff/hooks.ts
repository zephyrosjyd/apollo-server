import { AnyFunc } from "src/utilities/types"

const ID = Symbol('ID for scoped value')
const BASE = Symbol('Base value for scoped value')

export type Scoped<T> = {
  readonly [ID]: symbol
  [BASE]: T
}

export type ScopedType<S extends Scoped<any>> =
  S extends Scoped<infer T> ? T
    : never

export type Hook<F extends AnyFunc> = Scoped<F> & F

export type Slot<T> = Scoped<T> & {
  get(): T
  set(value: T): void
}

export function hook<F extends AnyFunc>(base: F): Hook<F> {
  const id = Symbol(`Hook ${base.name}`)
  Object.defineProperties(dispatcher, {
    name: { value: base.name },
    [ID]: { value: id },
    [BASE]: { value: base },
  })
  rootScope[id] = entry(id, base, rootScope)

  return Object.freeze(dispatcher) as any

  function dispatcher(this: any, ...args: any[]) {
    return Scope.current[id].value.apply(this, args)
  }
}

export function slot<T>(base: T, name?: string): Slot<T> {
  const id = Symbol(name)
  rootScope[id] = entry(id, base, rootScope)
  const slot = Object.freeze({
    [ID]: id,
    [BASE]: base,
    get() { return get(slot) },
    set(val: T) { set(slot, val) }
  })
  return slot
}


interface Entry<S extends Scoped<any>> {
  value: ScopedType<S>
  scope: any
  prev?: Entry<S>
}

function entry<S extends Scoped<any>>(id: S[typeof ID], value: ScopedType<S>, scope = Scope.current) {
  const prev: Entry<S> = scope[id]
  return {
    value, scope, prev
  }
}

export function get<S extends Scoped<any>>(scoped: S): ScopedType<S> {
  return Scope.current[scoped[ID]].value
}

export function prev<S extends Scoped<any>>(scoped: S): ScopedType<S> | undefined {
  return Scope.current[scoped[ID]]?.prev?.value
}

export function *ancestry<S extends Scoped<any>>(scoped: S): Iterable<ScopedType<S>> {
  let e = Scope.current[scoped[ID]]; while (e) {
    yield e.value
    e = e.prev
  }
}

export function set<S extends Scoped<any>>(scoped: S, value: ScopedType<S>) {
  const id = scoped[ID]
  const current = Scope.current[id]
  if (current.scope !== Scope.current)
    Scope.current[id] = entry(id, value)
  else
    current.value = value
}

export function extend<S extends Scoped<any>>(scoped: S, mid: (current: ScopedType<S>) => ScopedType<S>) {
  set(scoped, mid(get(scoped)))
}

const rootScope = {} as any
export const Scope: { current: any, finalizers: (() => void)[] } = {
  current: rootScope
} as any

Object.defineProperty(Scope, 'finalizers', slot([], 'Scope finalizers'))

export function onDestroy(destroy: () => void) {
  Scope.finalizers.push(destroy)
}

type Initializer<S extends Scoped<any>> = (() => void) | [S, ScopedType<S>]

export function apply<F extends AnyFunc>
  (func: F, self: ThisParameterType<F>, params: Parameters<F>, ...initialize: Initializer<any>[]): ReturnType<F> {
  const parent = Scope.current
  Scope.current = Object.create(parent)
  try {
    Scope.finalizers = []
    const count = initialize.length
    for (let i = 0; i !== count; ++i) {
      const init = initialize[i]
      if (typeof init === 'function') init()
      else set(...init)
    }
    return func.apply(self, params)
  } finally {
    const {finalizers} = Scope
    let i = finalizers.length; while (i --> 0)
      finalizers[i]()
    Scope.current = parent
  }
}
