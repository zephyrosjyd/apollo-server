import { remember, Key, getKey, Memoized, getSite } from './memo'
import { setLocation, getLocation } from './loc'
import { AnyFunc } from '../utilities/types'
import { REPR, toString } from './repr'

export type Ref<O extends (any[] | void), I extends (any[] | void) = O> =
  I extends void
    ? Source<O>
    :
  I extends any[]
    ? Source<O> & Sink<I>
    :
  never

const KEY = Symbol('Memo key')
const BASE = Symbol('Scalar base type')

export interface Scalar<T> extends Memoized<
  Ref<[T], [T]> & {
    <X extends T>(): Scalar<X>
    [KEY]: Key
    [BASE]: Scalar<any>
  }
> {}

export interface Sink<I extends any[]> {
  <X extends I>(...input:  X): Source<X>
  <X extends I>(source: Source<X>): Source<X>
}

export interface Reader<T, S=any, D=any> {
  getValue(state: S): T
  initialState?:  S
  reduce?: (state: S, delta: D) => S
  plan?(emit: (delta: D) => void): void
}

const READ = Symbol('Source<T>[READ]: Reader')
export interface Source<T> {
  readonly [READ]: Reader<T>
}
export const isSource = <X>(o: any): o is Source<X> => !!o[READ]

export interface CreateScalar {
  <T>(base?: Ref<any, [T]>): Scalar<T>
}

export const createScalar: Memoized<CreateScalar> =
  remember(<T>(base?: Ref<any, [T]>): Scalar<T> => {
    const scalar: Scalar<T> = Object.defineProperties(
      remember(((...args: any[]) => {
        if (args.length) {
          const [source] = args
          if (isSource<[T]>(source)) return source
          return data(args)
        }
        return createScalar(scalar)
      })), {
        [REPR]: { value: repr },
        [BASE]: { value: base },
        [KEY]: { value: getKey() },
        toString: { value: toString }
      })
    setLocation(scalar, getSite())
    return scalar
  })

function repr(this: Scalar<any>) {
  return `${
    String.raw(...this[KEY])
  }${
    this[BASE]
      ? ` <${String.raw(...this[BASE][KEY])}> `
      : ''
  } (${getLocation(this)!.short})`
}

function data<T extends any[]>(value: T) {
  return { [READ]: new Final(value) }
}

class Final<T extends any[]> implements Reader<T, void, void> {
  constructor(private value: T) {}
  getValue(): T {
    return this.value
  }
}

export const str = createScalar `str` <string>()
export const obj = createScalar `obj` <object>()
export const int = createScalar `int` <number>()
export const float = createScalar `float` <number>()
export const bool = createScalar `bool` <boolean>()
export const func = createScalar `func`<AnyFunc>()
