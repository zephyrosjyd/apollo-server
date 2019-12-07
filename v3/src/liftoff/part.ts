import { isTemplateStringsArray, ValueType, ValueTypeOf, AnyFunc } from "../utilities/types"
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
  <X extends I>(source: Source<X>): Source<X>
}

interface Source<_X> {}
const isSource = <X>(o: any): o is Source<X> => !!o

type Key = [TemplateStringsArray, ...any[]]

interface Memo {
  apply<F extends AnyFunc>(
    func: F,
    thisContext: ThisParameterType<F>,
    args: Parameters<F>,
    facade: Memoized<F>,
    key?: Key): ReturnType<F>
}

let memo: Memo // TODO: initialize

type Memoized<F extends AnyFunc> = ((site: TemplateStringsArray, ...deps: any[]) => F) & F

export const remember = <F extends AnyFunc>(func: F): Memoized<F> => (
  function consumeTag(this: any, ...keyOrArgs: any) {
    const [site] = keyOrArgs
    if (isTemplateStringsArray(site)) {
      setLocation(site, 2)
      return (...args: any) => memo.apply(func, this, args, consumeTag as any, keyOrArgs)
    }
    return memo.apply(func, this, keyOrArgs, consumeTag as any)
  }
) as any

type ScalarType = <T>(base?: Ref<any, [T]>) => Scalar<T>

export const scalarType: Memoized<ScalarType> =
  remember(<T>(__base?: Ref<any, [T]>): Scalar<T> => {
    const scalar: Scalar<T> = remember(
      ((...args: any[]) => {
        if (args.length) {
          const [source] = args
          if (isSource<[T]>(source)) return source
          return data(args)
        }
        return scalarType(scalar)
      }) as any
    )
    return scalar
  })

const DATA = Symbol('Definition')
interface Data<T extends any[]> extends Source<T>{
  [DATA]: T
}
function data<T extends any[]>(value: T): Data<T> {
  return { [DATA]: value }
}

//   const connect: Memoized<Ref<T>> = memoized(<V extends T = T>(value?: Input<V>) => {
//     const definition = sink(connect, value)
//     return definition
//   })
//   return connect
// }



// const int = scalar<number>()
// const asdf = int`abcd`(2)

const obj = scalarType <object>()
const Schema = obj<{ type: string }>()

Schema `some sub-ref` ()
  ({ type: 'asdf' })







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
