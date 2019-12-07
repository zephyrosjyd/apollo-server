export const REPR = Symbol('repr(): string')

type Print = (value: any) => String

export interface HasRepr {
  [REPR](fallback: Print): string
}

export const hasRepr = (o: any): o is HasRepr => o && typeof o[REPR] === 'function'

export function printer(fallback: Print = String) {
  return repr

  function repr(value: any) {
    if (value && typeof value[REPR] === 'function') {
      return value[REPR](repr)
    }
    return fallback(value)
  }
}

export const repr = printer()

export function toString(this: any) {
  return repr(this)
}

