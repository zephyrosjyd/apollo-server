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
  set(dispatcher as any, base)
  return Object.freeze(dispatcher) as any

  function dispatcher(this: any, ...args: any[]) {
    return Current.scope[id].value.apply(this, args)
  }
}

export function slot<T>(base: T, name?: string): Slot<T> {
  const id = Symbol(name)
  const slot: Slot<T> = Object.freeze({
    [ID]: id,
    [BASE]: base,
    get() { return get(slot) },
    set(val: T) { set(slot, val) }
  })
  set(slot, base)
  return slot
}


interface Entry<S extends Scoped<any>> {
  value: ScopedType<S>
  scope: any
  prev?: Entry<S>
}

function createEntry<S extends Scoped<any>>(id: S[typeof ID], value: ScopedType<S>, scope = Current.scope) {
  const prev: Entry<S> = scope[id]
  return {
    value, scope, prev
  }
}

export function get<S extends Scoped<any>>(scoped: S, scope = Current.scope): ScopedType<S> {
  return scope[scoped[ID]].value
}

export function prev<S extends Scoped<any>>(scoped: S, scope = Current.scope): ScopedType<S> | undefined {
  return scope[scoped[ID]]?.prev?.value
}

export function *ancestry<S extends Scoped<any>>(scoped: S, scope = Current.scope): Iterable<ScopedType<S>> {
  let e = scope[scoped[ID]]; while (e) {
    yield e.value
    e = e.prev
  }
}

export function set<S extends Scoped<any>>(scoped: S, value: ScopedType<S>, scope = Current.scope) {
  const id = scoped[ID]
  const entry = scope[id]
  if (entry?.scope !== scope)
    scope[id] = createEntry(id, value)
  else
    entry.value = value
}

export function extend<S extends Scoped<any>>(scoped: S, mid: (current: ScopedType<S>) => ScopedType<S>) {
  set(scoped, mid(get(scoped)))
}

let nextScopeId = 0

export const Current: {
  scope: any
  onClose: (() => void)[]
} = {} as any

Current.scope = createScope()

export interface Scope {
  [ID]: symbol
}

Object.defineProperty(Current, 'onClose', slot([], 'Scope.onClose'))

export function onClose(close: () => void) {
  Current.onClose.push(close)
}

type Initializer<S extends Scoped<any>> = (() => void) | [S, ScopedType<S>]

export function apply<F extends AnyFunc>
  (func: F, self: ThisParameterType<F>, params: Parameters<F>, scope: Scope = Current.scope): ReturnType<F> {
  const parent = Current.scope
  Current.scope = scope
  try {
    return func.apply(self, params)
  } finally {
    const {onClose} = Current
    let i = onClose.length; while (i --> 0)
      onClose[i]()
    Current.scope = parent
  }
}

export function createScope(...initialize: Initializer<any>[]): Scope {
  const parent = Current.scope
  try {
    Current.scope = parent ? Object.create(parent) : {}
    Current.scope[ID] = Symbol(`Scope#${nextScopeId++}`)
    Current.onClose = []
    const count = initialize.length
    for (let i = 0; i !== count; ++i) {
      const init = initialize[i]
      if (typeof init === 'function') init()
      else set(...init)
    }
    return Current.scope
  } finally {
    Current.scope = parent
  }
}
