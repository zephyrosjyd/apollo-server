// TODO(AS3) Keep this function here, but remove it from other places:
//  - apollo-gateway
//  - apollo-server-core
//  - apollo-server-core runQuery.test.ts
export function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

export function lazy(_target: any, prop: string, descriptor: PropertyDescriptor) {
  const create = descriptor.get!
  descriptor.get = function() {
    const value = create.call(this)
    Object.defineProperty(this, prop, {value})
    return value
  }
}

export function symbols(name: string) {
  let nextId = 0
  return function create(label?: string) {
    return Symbol(label ? `${name}[${nextId++}] - ${label}`: `${name}[${nextId++}]`)
  }
}
