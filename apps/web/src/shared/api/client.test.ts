import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiConfigurationError, ApiError, apiFetch } from './client.ts'

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

  it('supports the same-origin production base URL', async () => {
    vi.stubEnv('VITE_API_URL', '/')
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/api/widgets')
    expect(fetchMock).toHaveBeenCalledWith('/api/widgets', undefined)
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

    const request = apiFetch('/example')
    await expect(request).rejects.toBeInstanceOf(ApiConfigurationError)
    await expect(request).rejects.toThrow('API configuration is missing')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('supports successful responses with no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiFetch<void>('/example', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
