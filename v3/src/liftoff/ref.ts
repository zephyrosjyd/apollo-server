import { AnyFunc } from '../utilities/types'
import { lazy, symbols } from '../utilities'
import { slot, set, hook } from './hooks'
import { ID } from './id'

export type Ref<T> = T | Call<(...args: any) => T>

interface Call<F extends AnyFunc> {
  [ID]: symbol
  func: F
  self: ThisParameterType<F>
  args: Parameters<F>
  base?: F
}

export type RefFunc = (...args: any[]) => Ref<any>

const nextTypeId = symbols('RefType')
export function ref<F extends RefFunc>(base?: F): F {
  const id = nextTypeId()
  Object.defineProperty(lookup, ID, {value: id})
  if (base) {
    base.name && Object.defineProperty(lookup, 'name', {value: base.name})
    Object.defineProperty(lookup, 'toString', { value: () => base.toString() })
  }
  return lookup as F
  function lookup(this: any, ...args: any[]): any {
    return getRef(lookup, this, args, base)
  }
}

export const scalar: <T>(value: T) => Ref<T>
  = ref(function scalar<T>(value: T) { return value as any as Ref<T> })

const nextCallId = symbols('Call')
export const getRef = hook(
  function <F extends RefFunc>(func: F, self: ThisParameterType<F>, args: Parameters<F>, base?: F) {
    const node = root.next(func).next(self).nextIn(args)
    node.acquire(refScope.get())
    const {value} = node
    if (value) return value
    const created: Call<F> = {
      [ID]: nextCallId(`${func.name}(this: ${self}, ${args})`), func, self, args, base
    }
    node.value = created
    return created
  }
)

const nextRefScope = symbols('RefScope')
const refScope = slot(nextRefScope('root'))
export function withRefScope() {
  set(refScope, nextRefScope())
}

export class CacheNode {
  static nextId = 0

  constructor(public readonly parent?: CacheNode, public readonly key?: any) {}

  readonly id = CacheNode.nextId++

  _hasNodes = false; @lazy get nodes() {
    this._hasNodes = true
    return new Map<any, CacheNode>()
  }

  hasNext(key: any) {
    if (!this._hasNodes) return false
    return this.nodes.has(key)
  }

  next(key: any) {
    const {nodes} = this
    const existing = nodes.get(key)
    if (existing) return existing
    const created = new CacheNode(this, key)
    nodes.set(key, created)
    return created
  }

  nextIn(path: any[]) {
    let node: CacheNode = this
    for (const part of path) node = node.next(part)
    return node
  }

  acquire(from: any) {
    this.referrers.add(from)
  }

  release(from: any) {
    this.referrers.delete(from)
    this.maybeDestroy()
  }

  destroyKey(key: any) {
    this.nodes.delete(key)
    this.maybeDestroy()
  }

  maybeDestroy() {
    if (this._hasNodes && this.nodes.size) return
    if (this.referrers.size) return
    this.parent?.destroyKey(this.key)
  }

  _hasReferrers = false; @lazy get referrers() {
    this._hasReferrers = true
    return new Set<any>()
  }

  value?: Ref<any> = undefined
}

export const root = new CacheNode

export function *printCache(node: CacheNode = root, depth = 0): Iterable<string> {
  const spaces = '·'.repeat(depth)
  if (!node._hasNodes || !node.nodes.size) {
    return yield spaces + '<empty>'
  }
  for (const [key, child] of node.nodes) {
    yield(`${spaces}[${key}] -> ${String(child.value && child.value[ID])}`)
    yield* printCache(child, depth + 1)
  }
}
