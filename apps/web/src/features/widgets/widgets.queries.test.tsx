import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWidget, deleteWidget, updateWidget } from './widgets.api.ts'
import {
  useCreateWidget,
  useDeleteWidget,
  useUpdateWidget,
} from './widgets.queries.ts'

vi.mock('./widgets.api.ts', () => ({
  createWidget: vi.fn(),
  deleteWidget: vi.fn(),
  updateWidget: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: 0 },
      queries: { gcTime: Infinity },
    },
  })
  const mutations: {
    current?: {
      create: ReturnType<typeof useCreateWidget>
      update: ReturnType<typeof useUpdateWidget>
      delete: ReturnType<typeof useDeleteWidget>
    }
  } = {}
  function Probe() {
    mutations.current = {
      create: useCreateWidget(),
      update: useUpdateWidget('note'),
      delete: useDeleteWidget('note'),
    }
    return null
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  )
  if (!mutations.current) throw new Error('Missing mutation hooks')
  const note = {
    id: 'note',
    type: 'TEXT' as const,
    title: 'Text',
    text: 'Old',
  }
  const chart = { id: 'chart', type: 'BAR' as const, title: 'Bar' }
  client.setQueryData(['widgets'], [note, chart])
  client.setQueryData(['widgets', 'note'], note)
  client.setQueryData(['widgets', 'chart'], chart)
  return { client, mutations: mutations.current, note, chart }
}

describe('widget mutation cache behavior', () => {
  it('invalidates only the exact list after creation', async () => {
    const { client, mutations } = setup()
    vi.mocked(createWidget).mockResolvedValue({
      id: 'new',
      type: 'BAR',
      title: 'Bar',
    })
    await mutations.create.mutateAsync('BAR')
    expect(client.getQueryState(['widgets'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['widgets', 'chart'])?.isInvalidated).toBe(
      false,
    )
    client.clear()
  })
  it('updates the edited detail without invalidating other widgets or the list', async () => {
    const { client, mutations, note } = setup()
    vi.mocked(updateWidget).mockResolvedValue({ ...note, text: 'Saved' })
    await mutations.update.mutateAsync('Saved')
    expect(updateWidget).toHaveBeenCalledWith('note', 'Saved')
    expect(client.getQueryData(['widgets', 'note'])).toEqual({
      ...note,
      text: 'Saved',
    })
    expect(client.getQueryState(['widgets'])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['widgets', 'chart'])?.isInvalidated).toBe(
      false,
    )
    client.clear()
  })
  it('cancels an outstanding read so it cannot overwrite saved text', async () => {
    const { client, mutations, note } = setup()
    let finishRead!: (value: typeof note) => void
    let signal!: AbortSignal
    const staleRead = client
      .fetchQuery({
        queryKey: ['widgets', 'note'],
        queryFn: (context) => {
          signal = context.signal
          return new Promise<typeof note>((resolve) => {
            finishRead = resolve
          })
        },
      })
      .catch(() => undefined)
    vi.mocked(updateWidget).mockResolvedValue({ ...note, text: 'Saved' })
    await mutations.update.mutateAsync('Saved')
    expect(signal.aborted).toBe(true)
    finishRead(note)
    await staleRead
    expect(client.getQueryData(['widgets', 'note'])).toEqual({
      ...note,
      text: 'Saved',
    })
    expect(client.getQueryState(['widgets', 'chart'])?.isInvalidated).toBe(
      false,
    )
    client.clear()
  })
  it('removes deleted detail and list entry while retaining other details', async () => {
    const { client, mutations, chart } = setup()
    vi.mocked(deleteWidget).mockResolvedValue(undefined)
    await mutations.delete.mutateAsync()
    expect(client.getQueryData(['widgets'])).toEqual([chart])
    expect(client.getQueryState(['widgets'])?.isInvalidated).toBe(true)
    expect(client.getQueryData(['widgets', 'note'])).toBeUndefined()
    expect(client.getQueryData(['widgets', 'chart'])).toEqual(chart)
    client.clear()
  })
  it('retains cached content when a save or delete fails', async () => {
    const { client, mutations, note } = setup()
    vi.mocked(updateWidget).mockRejectedValue(new Error('Save failed'))
    vi.mocked(deleteWidget).mockRejectedValue(new Error('Delete failed'))
    await expect(mutations.update.mutateAsync('Draft')).rejects.toThrow(
      'Save failed',
    )
    await expect(mutations.delete.mutateAsync()).rejects.toThrow(
      'Delete failed',
    )
    expect(client.getQueryData(['widgets', 'note'])).toEqual(note)
    expect(client.getQueryState(['widgets'])?.isInvalidated).toBe(false)
    client.clear()
  })
})
