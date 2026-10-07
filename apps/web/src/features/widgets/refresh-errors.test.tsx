import { MantineProvider } from '@mantine/core'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '../../pages/DashboardPage.tsx'
import { WidgetCard } from './WidgetCard.tsx'
import type { WidgetDetail, WidgetSummary } from './widgets.types.ts'

const state = vi.hoisted(() => ({
  detail: {
    data: undefined as WidgetDetail | undefined,
    isError: true,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  list: {
    data: undefined as WidgetSummary[] | undefined,
    isError: true,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}))
vi.mock('./widgets.queries.ts', () => ({
  useWidget: () => state.detail,
  useWidgets: () => state.list,
  useDeleteWidget: () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
  }),
  useUpdateWidget: () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
  useCreateWidget: () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
}))
const note = {
  id: 'note',
  type: 'TEXT' as const,
  title: 'Note',
  text: 'Saved note',
}
const render = (element: React.ReactNode) =>
  renderToString(<MantineProvider>{element}</MantineProvider>)
beforeEach(() => {
  state.detail.data = undefined
  state.list.data = undefined
})

describe('background refresh errors', () => {
  it('retains existing text content when its refresh fails', () => {
    state.detail.data = note
    const html = render(<WidgetCard summary={note} />)
    expect(html).toContain('Saved note')
    expect(html).toContain('Unable to refresh this widget')
    expect(html).toContain('Retry widget')
    expect(html).not.toContain('Unable to load this widget')
  })
  it('retains existing widgets when the list refresh fails', () => {
    state.detail.data = note
    state.list.data = [note]
    const html = render(<DashboardPage />)
    expect(html).toContain('Saved note')
    expect(html).toContain('Unable to refresh the dashboard')
    expect(html).not.toContain('Unable to load the dashboard')
  })
  it('shows the initial widget error when no cached detail exists', () => {
    const html = render(<WidgetCard summary={note} />)
    expect(html).toContain('Unable to load this widget')
    expect(html).not.toContain('Saved note')
  })
  it('shows the initial dashboard error when no cached list exists', () => {
    const html = render(<DashboardPage />)
    expect(html).toContain('Unable to load the dashboard')
    expect(html).not.toContain('Saved note')
  })
})
