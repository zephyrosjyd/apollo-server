import {hooks, provides, Scope, attach, current} from './hooks'

describe('hooks', () => {
  const Path = hooks({
    name: '/',
    path: '/',
  })

  it('creates static accessors with the base implementation', () => {
    expect(Path.name).toBe('/')
    expect(Path.path).toBe('/')
  })

  const withName = (name: string) => ({
    [provides]: [Path],
    [attach]() {
      const parent = Path[current]
      return {
        name,
        get path() {
          return parent?.path + '/' + name
        }
      }
    }
  })

  describe('Scope.apply', () => {
    it('applies a function with scope providers', () => {
      let called = false
      function getPath() {
        called = true
        return Path.path
      }

      const result = Scope.apply(getPath, null, [], withName('hello'))
      expect(called).toBeTruthy()
      expect(result).toBe('//hello')
    })

    it('stacks', () => {
      function callPath(...path: string[]): string {
        if (!path.length) return Path.path
        return Scope.apply(callPath, null, path.slice(1), withName(path[0]))
      }

      const result = Scope.apply(callPath, null, ['world', 'a', 'b'], withName('hello'))
      expect(result).toBe('//hello/world/a/b')
    })

    it('restores', () => {
      expect(Path.path).toBe('/')
    })
  })

})
