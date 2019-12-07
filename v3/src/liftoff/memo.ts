import { AnyFunc, isTemplateStringsArray } from '../utilities/types'
import { setLocation, getLocation, Location } from './loc'

export interface Memo {
  apply<F extends AnyFunc>(
    func: F,
    thisContext: ThisParameterType<F>,
    args: Parameters<F>,
    facade: Memoized<F>,
    key?: Key): ReturnType<F>

  key: Key
}

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

let memo: Memo // TODO: initialize

export function getKey(): Key {
  return memo.key
}

export function getSite(): TemplateStringsArray {
  return memo.key[0]
}
