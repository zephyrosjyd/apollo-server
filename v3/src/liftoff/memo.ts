import { AnyFunc, isTemplateStringsArray } from '../utilities/types'
import { setLocation } from './loc'

export type Memoized<F extends AnyFunc> = ((...key: Key) => F) & F

export type Key = [TemplateStringsArray, ...any[]]
const isKey = (o: any[]): o is Key => isTemplateStringsArray(o[0])

export const remember = <F extends AnyFunc>(func: F): Memoized<F> => (
  function consumeTag(this: any, ...keyOrArgs: any) {
    if (isKey(keyOrArgs)) {
      setLocation(keyOrArgs[0], 2)
      return (...args: any) => memo.apply(func, this, args, consumeTag as any, keyOrArgs)
    }
    return memo.apply(func, this, keyOrArgs, consumeTag as any)
  }
) as any

export function getKey(): Key {
  return memo.key
}

export function getSite(): TemplateStringsArray {
  return memo.key[0]
}

function makeSite(parts: string[]): TemplateStringsArray {
  ;(parts as any).raw = parts
  return parts as any
}

export interface Store {
  child(memo: Memo): Store
  get(key: Key): Row | undefined
  update<R extends RowUpdate<AnyFunc>>(update: R): Row<R extends RowUpdate<infer F> ? F : never> & R
  delete(key?: Key): void
  commit(): void
}

export interface PositionalSiteState {
  sites: (TemplateStringsArray & string[])[]
  nextIndex: number
}

export interface Row<F extends AnyFunc=AnyFunc> {
  memo: Memo
  key: Key
  func: F
  thisValue: ThisParameterType<F>
  args: Parameters<F>
  facade: Memoized<F>
  result?: Result<F>
}

type RowUpdate<F extends AnyFunc = AnyFunc> =
  Partial<Row<F>> & { memo: Memo, key: Key }

type Result<F extends AnyFunc> = Returned<F> | Threw<F>

interface Returned<F extends AnyFunc> {
  type: 'returned'
  value: ReturnType<F>
}
const Returned = <F extends AnyFunc>(value: ReturnType<F>) => ({
  type: 'returned' as 'returned', value
})

interface Threw<F> {
  type: 'threw'
  error: Error
}
const Threw = <F>(error: Error): Threw<F> => ({
  type: 'threw' as 'threw', error
})

function needsUpdate(a: Key, b: Key) {
  if (!a || !b) return true
  if (a.length !== b.length) return true
  let i = a.length; while (i --> 0) {
    if (a[i] !== b[i]) return true
  }
  return false
}

class Memo {
  constructor(public readonly key: Key, parentStore: Store) {
    this.store = parentStore.child(this)
  }

  readonly store: Store

  hasChildren = false
  @lazy
  private get children(): Map<TemplateStringsArray, Memo> {
    this.hasChildren = true
    return new Map
  }

  @lazy
  private get activeChildren(): Set<Memo> {
    this.hasChildren = true
    return new Set
  }

  child(key: Key): Memo {
    const [site] = key
    const child = this.children.get(site)
    if (child) {
      this.activeChildren.add(child)
      return child
    }
    const created: Memo = new (this.constructor as any)(key, this.store)
    this.children.set(site, created)
    this.activeChildren.add(created)
    return created
  }

  apply<F extends AnyFunc>(func: F, thisValue: ThisParameterType<F>, args: Parameters<F>, facade: Memoized<F>, key?: Key): ReturnType<F> {
    const {store} = this
    const childKey = key || this.positionalKey(facade, thisValue, ...args)
    const row = store.get(childKey) as Row<F> || {
      key: childKey,
      parentMemo: this,
      func,
      thisValue,
      args,
      facade,
    }
    if (!needsUpdate(childKey, row.key) && row.result?.type === 'returned')
      return row.result.value

    const {result} = this.update(row)
    if (result.type === 'returned')
      return result.value
    throw result.error
  }

  update<F extends AnyFunc>(row: Row<F>): Row<F> & { result: Result<F> } {
    const {store} = this
    const {key, func, thisValue, args} = row
    const prevMemo = memo
    try {
      memo = this.child(key)
      const value = func.apply(thisValue, args)
      return store.update({
        key,
        memo,
        result: Returned<F>(value),
      })
    } catch(error) {
      return store.update({
        key,
        memo,
        result: Threw<F>(error)
      })
    } finally {
      memo.finished()
      memo = prevMemo
    }
  }

  finished() {
    this.hasChildren && this.destroyInactiveChildren()
    this.hasPositionalSites && this.resetPositionalIndexes()
    this.store.commit()
  }

  destroyInactiveChildren() {
    const {children, activeChildren} = this
    for (const [site, child] of children.entries()) {
      if (!activeChildren.has(child)) {
        child.destroy()
        children.delete(site)
      }
    }
  }

  destroy() {
    if (this.hasChildren) {
      for (const child of this.children.values()) {
        child.destroy()
      }
    }
    this.store.delete()
  }

  private hasPositionalSites = false
  @lazy
  private get positionalSites(): Map<AnyFunc, PositionalSiteState> {
    this.hasPositionalSites = true
    return new Map
  }

  positionalKey<F extends AnyFunc>(func: F, ...deps: any[]): Key {
    const {positionalSites} = this
    let keyStateForFunc = positionalSites.get(func)!
    if (!keyStateForFunc) {
      keyStateForFunc = { sites: [], nextIndex: 0 }
      positionalSites.set(func, keyStateForFunc)
    }
    const {sites, nextIndex} = keyStateForFunc
    try {
      const site = sites[nextIndex] || (sites[nextIndex] = makeSite([]) as any)
      this.formatSite(site, func, nextIndex, deps.length)
      return [site, ...deps]
    } finally {
      keyStateForFunc.nextIndex++
    }
  }

  formatSite(site: string[], func: AnyFunc, index: number, length: number): void {
    site.length = 0
    const name = func.name || 'anonymous'
    site.push(
      `${name}#${index}(this: `,
      ...Array.from({length}).fill(',') as Array<string>,
      ')'
    )
  }

  resetPositionalIndexes(): void {
    const {positionalSites} = this
    for (const [func, state] of positionalSites.entries()) {
      if (!state.nextIndex) {
        positionalSites.delete(func)
        continue
      }
      state.sites.length = state.nextIndex
      state.nextIndex = 0
    }
  }
}

function lazy(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const get = descriptor.get
  descriptor.get = function lazyGet() {
    const value = get?.apply(target)
    Object.defineProperty(target, propertyKey, { value })
    return value
  }
}

let memo: Memo // TODO: initialize
