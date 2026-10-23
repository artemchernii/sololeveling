import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const store = (saved: Record<string, string> = {}) => ({
  getItem: (k: string) => saved[k] ?? null,
  setItem: (k: string, v: string) => void (saved[k] = v),
})

test('nothing saved is Sonnet 5.5; a pick is kept for the next page', async () => {
  const saved: Record<string, string> = {}
  vi.stubGlobal('localStorage', store(saved))
  const a = await import('./localModel')
  expect(a.localModel()).toBe('claude-sonnet-5-5')
  a.setLocalModel('claude-opus-5-5')
  expect(a.localModel()).toBe('claude-opus-5-5')
  vi.resetModules()
  const b = await import('./localModel')
  expect(b.localModel()).toBe('claude-opus-5-5')
})

test('an unknown id saved, or storage that throws, is Sonnet 5.5', async () => {
  vi.stubGlobal('localStorage', store({ 'sl.localModel': 'gpt-5' }))
  expect((await import('./localModel')).localModel()).toBe('claude-sonnet-5-5')
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  })
  const c = await import('./localModel')
  expect(c.localModel()).toBe('claude-sonnet-5-5')
  c.setLocalModel('claude-haiku-5-5')
  expect(c.localModel()).toBe('claude-haiku-5-5')
})
