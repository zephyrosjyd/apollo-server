import { isTemplateStringsArray, ValueType, ValueTypeOf } from "../utilities/types"
import { setLocation } from "./loc"

interface Ref<T> {
  <X extends T = T>(value?: Input<X>): Output<X>
}

type Input<T> =
  T extends Ref<infer V> ? V | T
   :
   T | Ref<T>

type Output<T> =
  T extends Ref<any> ? T
  :
  T extends ValueType ? Ref<ValueTypeOf<T>>
  :
  void

const sink = <T>(_type?: Ref<T>, defaultValue?: Input<T>) => {
  const connect: Memoized<Ref<T>> = memoized(<V extends T = T>(value?: Input<V>) => {
    const definition = sink(connect, value)
    return definition
  })
  return connect
}

type Memoized<F extends Function> = ((site: TemplateStringsArray, ...deps: any[]) => F) & F


const int = sink<number>()
const asdf = int`abcd` (2)

asdf(11)





export const memoized = <F extends Function>(func: F): Memoized<F> => (
  (...args: any[]) => {
    const [site, ...deps] = args
    if (isTemplateStringsArray(site)) {
      setLocation(site, 2)
      return func
    }
    return func
  }
) as any

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
