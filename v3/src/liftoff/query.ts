import { AnyFunc } from '../utilities/types'
import { Result } from './memo'

interface Call<F extends AnyFunc=AnyFunc> {
  func: F
  thisValue: ThisParameterType<F>
  args: Parameters<F>
  result: Result<F>
}

type Col<F extends string> = <T>(o: T) => F extends keyof T ? T[F] : void
const col = <F extends string>(field: F): Col<F> => (o: any) => o[field]

type Shape<T> = Record<string, keyof T>

const select = Symbol('select')
const where = Symbol('where')
const array = Symbol('array')
const map = Symbol('map')

type Pattern<T> = {
  [K in keyof T]: Pattern<T[K]>
} & Query<T>

const project = Symbol('project')

type ObjToParams<T extends object> = {
  [keys in keyof T]: number
}

function isOk(call: Result<AnyFunc>) {
  if (call.type === 'returned') return call
  return
}

function Schema(typeDefs: string, resolvers: object) {

}

// field(null! as Call<typeof Schema>, 'args', )

interface Query<T> {
  [select]<S extends Shape<T>>(shape: S): Select<T, S>
  [where]<F extends Filter<T>>(filter: F): Pattern<T>
  [map]<P extends Projection<T, any>>(project: P): Pattern<Project<T, P>>
  readonly [array]: T[]
}

type Filter<T> = (o: T) => boolean

type Select<T, S extends Record<string, keyof T>> = Pattern<{
  [K in keyof S]: T[S[K]]
}>

type Projection<T, R> = (item: T) => R

type Project<T, P extends Projection<any, any>> =
  P extends Projection<T, infer R>
    ? Exclude<R, undefined>
    : never

function from<T>(row: T): Pattern<T> {
  return {} as any
}

const a = from(null as unknown as Call).result[map](isOk)



// const results = a.result[where](r => {
//   if (r.type === 'returned') {
//     r.value
//   }
// })
const x = results.value

a.func[where](f => f === from)
const shaped = a[select]({ self: 'thisValue' })


// .self[filter](s => s instanceof Map)


// ({ func: 'func', result: 'result', args: 'args' })


// const fs = a[where]((r: any): r is { hello: 'world' } => true)[array]
// const z = fs[0]
// const k = z.hello

