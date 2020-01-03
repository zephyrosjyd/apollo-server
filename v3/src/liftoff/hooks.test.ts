import {hook, extend, apply, slot, set, prev, ancestry} from './hooks'

describe('scoped values', () => {
  const name = slot('/')
  const getPath = hook(() => '/')

  it('start with the base implementation', () => {
    expect(name.get()).toBe('/')
    expect(getPath()).toBe('/')
  })

  describe('set', () => {
    it('sets a scoped value', () => {
      const meaning = slot(42)
      expect(meaning.get()).toBe(42)
      set(meaning, 52)
      expect(meaning.get()).toBe(52)
    })

    it('sets the implementation of a hook', () => {
      const meaning = hook(() => 42)
      expect(meaning()).toBe(42)
      set(meaning, () => 52)
      expect(meaning()).toBe(52)
    })
  })

  describe('extend', () => {
    it('changes the implementation of a hook via middleware', () => {
      const meaning = hook(() => 42)
      expect(meaning()).toBe(42)
      extend(meaning, next => () => next() + 10)
      expect(meaning()).toBe(52)
    })
  })

  describe('apply', () => {
    it('applies a function in a new scope, taking an initializer', () => {
      let called = false
      const result = apply(() => getPath(), null, [], () => {
        called = true
        extend(getPath, parent => () => parent() + '/' + name.get())
        set(name, 'hello')
      })
      expect(called).toBeTruthy()
      expect(result).toBe('//hello')
    })

    it('restores the previous scope on completion', () => {
      apply(() => getPath(), null, [], () => {
        extend(getPath, parent => () => parent() + '/' + name.get())
        set(name, 'hello')
      })
      expect(getPath()).toBe('/')
    })

    it('stacks recursively, of course', () => {
      function callPath(...path: string[]): string {
        if (!path.length) return getPath()
        return apply(callPath, null, path.slice(1), () => {
          extend(getPath, parent => () => parent() + '/' + path[0])
        })
      }

      expect(callPath('hello', 'world', 'a', 'b', 'c'))
        .toBe('//hello/world/a/b/c')
      expect(getPath()).toBe('/')
    })
  })

  describe('looking up the scope chain', () => {
    it('prev(scoped) returns the previous value from a containing scope', () => {
      apply(() => {
        expect(name.get()).toBe('hello')
        expect(prev(name)).toBe('/')
      }, null, [], () => {
        set(name, 'hello')
      })
    })

    it('ancestry(scoped) returns an iterable of values from all containing scopes', () => {
      function callPath(...path: string[]): string {
        if (!path.length) return [...ancestry(name)].reverse().join('/')
        return apply(callPath, null, path.slice(1), [name, path[0]])
      }
      expect(callPath('hello', 'world', 'a', 'b', 'c'))
        .toBe('//hello/world/a/b/c')
    })
  })
})
