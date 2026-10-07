import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWidget,
  deleteWidget,
  getWidget,
  getWidgets,
  updateWidget,
} from './widgets.api.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('widget API functions', () => {
  it('uses independent prefixed endpoints and passes cancellation signals', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000')
    const fetch = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    await getWidgets(signal)
    await getWidget('widget-id', signal)
    expect(fetch.mock.calls).toEqual([
      ['http://localhost:3000/api/widgets', { signal }],
      ['http://localhost:3000/api/widgets/widget-id', { signal }],
    ])
  })
  it('sends only the supported creation and edit fields and accepts DELETE 204', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000')
    const fetch = vi
      .fn()
      .mockImplementation(async (_url, options: RequestInit) =>
        options.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : Response.json({ id: 'widget' }),
      )
    vi.stubGlobal('fetch', fetch)
    await createWidget('BAR')
    await updateWidget('widget/id', 'Saved text')
    await expect(deleteWidget('widget/id')).resolves.toBeUndefined()
    expect(fetch.mock.calls).toEqual([
      [
        'http://localhost:3000/api/widgets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'BAR' }),
        },
      ],
      [
        'http://localhost:3000/api/widgets/widget%2Fid',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Saved text' }),
        },
      ],
      ['http://localhost:3000/api/widgets/widget%2Fid', { method: 'DELETE' }],
    ])
  })
})
