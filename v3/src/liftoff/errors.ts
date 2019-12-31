import { Class, Instance, isTemplateInvocation } from '../utilities/types'

export type Message<P extends any[]> = [string] | [(...params: P) => string] | [TemplateStringsArray, ...any[]]

export type Fail<P extends any[], Base extends Error> = Base & {
  readonly code: string
  readonly params: P
}

export interface FailureMode<P extends any[] = [object?], Base extends Error = Error> {
  (...params: P): Failure<P, Base>
  new (...params: P): Fail<P, Base>
  readonly code: string
  message: <MoreProps=undefined>(...msg: Message<[MoreProps]>) =>
    P extends []
      ? MoreProps extends object
        ? FailureMode<[MoreProps], Base>
        : FailureMode<P, Base>
      :
    P extends [infer Props]
      ? MoreProps extends object
        ? FailureMode<[Props & MoreProps], Base>
        : FailureMode<P, Base>
      :
      FailureMode<P, Base>
}

export interface Failure<P extends any[], Base extends Error> {
  create(): Fail<P, Base>
}

export class Failure<P extends any[], Base extends Error> {
  constructor(
    public readonly FailureMode: FailureMode<P, Base>,
    public readonly params: P) {}

  create(): Fail<P, Base> {
    return new this.FailureMode(...this.params)
  }
}

export interface ErrorWithStaticCode extends Class<Error> {
  readonly code: string
}

export function fail
  (code: string): FailureMode<[]>
export function fail<P extends any[], M extends FailureMode<P, any>>
  (code: string, mode: M): M
export function fail<E extends Class<Error>>
  (code: string, Base: E): FailureMode<ConstructorParameters<E>, Instance<E>>
export function fail<E extends ErrorWithStaticCode>
  (Base: E): FailureMode<ConstructorParameters<E>, Instance<E>>

export function fail<E extends ErrorWithStaticCode>(
  codeOrBase: E | string,
  ...rest: any[]
): any {
  let code: string
  let Base: Class<Error>
  if (typeof codeOrBase === 'string') {
    code = codeOrBase
    Base = rest[1] || Error
  } else {
    Base = rest[0]
    code = codeOrBase.code
  }

  return failureMode(Base, code)
}

function formatMsg<P extends any[]>(message: Message<P>, params: P) {
  if (!message.length) return null
  if (isTemplateInvocation(message)) return String.raw(...message)
  const [format] = message
  if (typeof format === 'function') return format(...params)
  if (typeof format === 'string') return format
  return null
}

function failureMode<B extends Class<Error>>(Base: B, code: string, message?: Message<ConstructorParameters<B>>): FailureMode<ConstructorParameters<B>, Instance<B>> {
  class FailureClass extends Base {
    static readonly code = code
    readonly params: ConstructorParameters<B>

    static message(...msg: any) {
      return failureMode(this, code, msg)
    }

    constructor(...params: any[]) {
      super(...params)
      this.params = params as any
    }

    get message() {
      if (!message) return super.message
      return [super.message, formatMsg(message, this.params)].filter(Boolean).join('\n\n')
    }
  }

  function FailureMode(this: any, ...args: ConstructorParameters<B>) {
    if (new.target)
      return FailureClass.apply(this, args)
    return new Failure(FailureMode as any, args)
  }

  Object.setPrototypeOf(FailureMode, FailureClass)
  Object.defineProperties(FailureMode, { name: { value: code } })

  FailureMode.prototype = Object.create(FailureClass.prototype)
  FailureMode.prototype.constructor = FailureMode

  return FailureMode as any
}
