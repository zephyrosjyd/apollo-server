import { isTemplateStringsArray, ValueType, ValueTypeOf } from "../utilities/types"
import { setLocation } from "./loc"

type Ref<O extends (any[] | void), I extends (any[] | void) = O> =
  I extends void
    ? Source<O>
    :
  I extends any[]
    ? Source<O> & Sink<I>
    :
  never

interface Scalar<T> extends Memoized<
  Ref<[T], [T]> & {
    <X extends T>(): Scalar<X>
  }
> {}

interface Sink<I extends any[]> {
  <X extends I>(...input:  X): Source<X>
}

interface Source<_X> {}

function emit<I extends any[]>(_ref: Ref<void, I>, _value: I) {

}


export const memoized = <F extends Function>(func: F): Memoized<F> => (
  function consumeTag(...args: any[]) {
    const [site, ...deps] = args
    if (isTemplateStringsArray(site)) {
      setLocation(site, 2)
      return func
    }
    return func
  }
) as any

export const scalar = memoized(<T>(base?: Ref<any, [T]>): Scalar<T> => {
  const connect = memoized(<X extends T>(value?: X): Scalar<X> => {
    if (!value) return scalar(connect)
    base && value && emit(connect, [value])
    return connect
  })
  return connect
})



//   const connect: Memoized<Ref<T>> = memoized(<V extends T = T>(value?: Input<V>) => {
//     const definition = sink(connect, value)
//     return definition
//   })
//   return connect
// }

type Memoized<F extends Function> = ((site: TemplateStringsArray, ...deps: any[]) => F) & F


// const int = scalar<number>()
// const asdf = int`abcd`(2)

const obj = scalar `abcd` <object>()
const Schema = obj<{ type: string }>()

Schema `some sub-ref` ()
  `a value`({ type: 'asdf' })







// type Part = (...args: any[]) => Ref<any>

// function part<P extends Part>(part: P): P {
//   return part
// }

// part(() => int `asdf` (2))

type Proj<I, O> = (input: I) => O

function map<I, P extends Proj<I, any>>(input: I, proj: P): ReturnType<P> {
  return proj(input)
}

function flip<I extends number|string>(input: I): I extends number ? string : number {
  return typeof input === 'string' ? Number(input) : String(input) as any
}

const x = map<string, typeof flip>('hello', flip)

const y = flip(2)
// function bind<X,Y>(x: X, y: Y): BindOutput<X, Y> {

// }
