import { Scalar, str, int, /* float, bool, obj, func */ } from './ref'
import { TypeCheck, checkString, checkInteger } from '../test-helpers'

describe.only('scalar refs', () => {
  testScalar(str, checkString)
  testScalar(int, checkInteger)
})

import { getLocation } from './loc'

function testScalar<T>(scalar: Scalar<T>, check: TypeCheck<T>) {
  describe.only(`${scalar} creates Ref<${check.typeName}>`, () => {
    it('the creator has a location', () =>
      expect(getLocation(scalar)).toBeDefined())

    it('creates ref with a location', () =>
      expect(getLocation(scalar `a ref` ())).toBeDefined())

    it.each(Object.entries(check.examples))(`accepts %s (%s)`, (_, example) => {
      scalar(example)
    })
  })
}
