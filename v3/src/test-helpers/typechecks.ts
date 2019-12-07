export interface TypeCheck<T> {
  (o: any): o is T
  typeName: string
  examples: {
    [name: string]: T
  }
}

export const checkString = (() => {
  const check: TypeCheck<string> = (o: any): o is string => typeof o === 'string'
  check.typeName = 'string'
  check.examples = {
    'empty string': '',
    'nonempty string': 'This is a string.'
  }
  return check
})()

export const checkInteger = (() => {
  const check: TypeCheck<number> = (o: any): o is number => typeof o === 'string'
  check.typeName = 'integer'
  check.examples = {
    zero: 0,
    one: 1,
    'minus one': -1,
    'max safe int': Number.MAX_SAFE_INTEGER,
    'min safe int': Number.MIN_SAFE_INTEGER,
  }
  return check
})()
