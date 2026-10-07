import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client.ts'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses the configured base URL and returns typed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal

    const result = await apiFetch<{ message: string }>('/example', { signal })

    expect(result.message).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/example', { signal })
  })

  it('throws an ApiError with the HTTP status for non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(null, { status: 403, statusText: 'Forbidden' }),
    ))

    const request = apiFetch('/example')

    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({ status: 403 })
  })

  it('rejects missing configuration before making a request', async () => {
    vi.stubEnv('VITE_API_URL', undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/example')).rejects.toThrow('VITE_API_URL is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
