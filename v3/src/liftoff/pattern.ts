import { lazy } from "src/utilities/decorators"
import { ReferenceType } from "src/utilities/types"

/**
 * A Pattern holds an indexable tree of rows `<R>`. Rows can be any object.
 *
 * Patterns identify rows with a primary key `<K>`. The primary key is some
 * part of `R` which uniquely identifies the row within a pattern.
 *
 * Patterns also have a positional key part `<P>` which like primary keys
 * are some part of `R`. Unlike primary keys, they do not have to uniquely
 * identify rows alone. Instead, they can be used in conjunction with their
 * position within the pattern to identify a row.
 *
 * @param R row type
 * @param K key type (default: `R`)
 */
interface Pattern<
  R extends object = object,
  K extends Partial<R> = R,
  P extends Partial<R> = K> {
  sweep(): Sweep<R, K, P>
}


const ID = Symbol('Key id: number')
type Id = { [ID]: number }

const ids: WeakMap<ReferenceType, Id> = new WeakMap
let nextId = 0
function idFor(o: ReferenceType) {
  const existing = ids.get(o)
  if (existing) return existing
  const id = Object.freeze({ [ID]: nextId++ })
  ids.set(o, id)
  return id
}

/**
 * Sweeps modify Patterns. During a Sweep, we walk (some subset of) the tree,
 * touching (some subset of) rows. Any untouched row is removed after the
 * sweep.
 */
interface Sweep<
  R extends object = object,
  K extends Partial<R> = R,
  P extends Partial<R> = K> {
  seek(key: K | P): R | undefined
  update(row: UpdateOf<Pattern<R, K, P>>): Sweep<P>

  /**
   * Finish the sweep, applying changes.
   */
  commit(): void
}


abstract class Pattern<
  R extends object = object,
  K extends Partial<R> = R,
  P extends Partial<R> = K> {

  abstract identify(key: K | P): Id
  abstract getRow(id: Id): R | undefined
  abstract getChild(id: Id): Pattern<R, K, P> | undefined

  hasChildren = false
  @lazy get children(): Map<object, Pattern<R, K, P>> {
    this.hasChildren = true
    return new Map
  }

  sweep(): Sweep<R, K, P> {
    return new Sweep(this)
  }
}

type UpdateOf<P extends Pattern> =
  P extends Pattern<infer R, infer K, infer P>
    ? (K | P) & Partial<R>
    : never

interface Transaction<P extends Pattern> {
  update(id: Id, update: UpdateOf<P>): void
}

class Sweep<
  R extends object = object,
  K extends Partial<R> = R,
  P extends Partial<R> = K> {
  constructor(
    readonly pattern: Pattern<R, K, P>,
    readonly transaction: Transaction<Pattern<R, K, P>>,
    readonly parent?: Sweep<P>) {}

  hasActiveRows = false
  @lazy get activeRows(): Set<object> {
    this.hasActiveRows = true
    return new Set
  }

  hasAddedRows = false
  @lazy get addedRows(): Set<object> {
    this.hasActiveRows = true
    return new Set
  }

  hasDelta = false
  @lazy get delta(): Delta<Pattern<R, K, P>>[] { return [] }

  get(key: K | P): R | undefined {
    const {pattern} = this
    const id = pattern.identify(key)
    this.activeRows.add(id)
    const existing = pattern.getRow(id)
    return existing
  }

  update(row: UpdateOf<Pattern<R, K, P>>): Sweep<R, K, P> {
    const {pattern} = this
    const id = this.pattern.identify(row)
    this.activeRows.add(id)
    this.transaction.update(id, row)
    const child = this.pattern.getChild(id)

  }

}
