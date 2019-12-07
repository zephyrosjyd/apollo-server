// import { remember, Memoized } from './memo'


// const int = scalar<number>()
// const asdf = int`abcd`(2)

// const obj = createScalar <object>()
// const Schema = obj<{ type: string }>()

// Schema `some sub-ref` ()
//   ({ type: 'asdf' })







// // type Part = (...args: any[]) => Ref<any>

// // function part<P extends Part>(part: P): P {
// //   return part
// // }

// // part(() => int `asdf` (2))

// type Proj<I, O> = (input: I) => O

// function map<I, P extends Proj<I, any>>(input: I, proj: P): ReturnType<P> {
//   return proj(input)
// }

// function flip<I extends number|string>(input: I): I extends number ? string : number {
//   return typeof input === 'string' ? Number(input) : String(input) as any
// }

// const x = map<string, typeof flip>('hello', flip)

// const y = flip(2)
// // function bind<X,Y>(x: X, y: Y): BindOutput<X, Y> {

// }
