import { Plugin } from 'pretty-format'
import { printer, hasRepr } from '../liftoff/repr'

const serializer: Plugin = {
  test(value: any) {
    return hasRepr(value)
  },

  print(value, print) {
    return printer(print)(value)
  }
}

export default serializer
