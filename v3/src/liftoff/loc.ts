import {basename} from 'path'
import Parser, {StackFrame} from 'error-stack-parser'

const locations = new WeakMap<any, Location>()

export class Location {
  public readonly isConstructor?: boolean
  public readonly isEval?: boolean
  public readonly isNative?: boolean
  public readonly isTopLevel?: boolean

  public get file() {
    return basename(this.frame.fileName!)
  }
  public get path() {
    return this.frame.fileName
  }
  public get line() { return this.frame.lineNumber }
  public get col() { return this.frame.columnNumber }

  public get short() {
    return `${this.file}:${this.line}:${this.col}`
  }

  public readonly functionName?: string
  public readonly args?: any[]

  /**
   * Create a location describing a point in the source.
   *
   * @param error _an Error whose stack includes the location_
   * @param depth _the index of the stack frame holding the location_
   */
  constructor(public readonly error: Error, public readonly depth: number) {}

  get stack(): readonly Readonly<StackFrame>[] {
    const value = Object.freeze(
      Parser.parse(this.error).map(Object.freeze) as Readonly<StackFrame>[]
    )
    Object.defineProperty(this, 'stack', {
      value, writable: false, configurable: false
    })
    return value
  }

  get frame() {
    return this.stack[this.depth]
  }
}

/**
 * Set the source location of an object to be on the current stack.
 *
 * Does nothing if the object's location is already set. If the object's
 * location hasn't already been set, retrieves the stack (by constructing
 * an Error and parsing its `stack` property) and sets the object's location
 * to the stack frame at `depth`.
 *
 * @param of _the object whose location to set_
 * @param depth _the index of the stack frame holding the location **(default=1)**_
 */
export function setLocation(of: any, depth?: number): void

/**
 * Set the source location of an object to be the location of another object.
 *
 * Does nothing if the object's location is already set. If the object's
 * location hasn't already been set, retrieves `src`'s location and sets it
 * as the object's location.
 *
 * @param of _the object whose location to set_
 * @param src _the object whose location will be used_
 */
export function setLocation(of: any, src: object): void

export function setLocation(of: any, srcOrDepth: object | number = 1) {
  if (locations.has(of)) return
  const loc = typeof srcOrDepth === 'number'
    ? new Location(new Error, srcOrDepth)
    :
    (getLocation(srcOrDepth) || new Location(new Error, 1))
  loc && locations.set(of, loc)
}

export function getLocation(of: object) {
  return locations.get(of)
}

;['isConstructor',
'isEval',
'isNative',
'isTopLevel',
'functionName',
'args',].forEach(prop => {
  Object.defineProperty(Location.prototype, prop, {
    get() { return this.frame[prop] }
  })
})
