export function lazy(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const get = descriptor.get
  descriptor.get = function lazyGet() {
    const value = get?.apply(target)
    Object.defineProperty(target, propertyKey, { value })
    return value
  }
}
