import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWidget,
  deleteWidget,
  getWidget,
  getWidgets,
  updateWidget,
} from './widgets.api.ts'
import type { WidgetSummary } from './widgets.types.ts'
export function useWidgets() {
  return useQuery({
    queryKey: ['widgets'],
    queryFn: ({ signal }) => getWidgets(signal),
  })
}

export function useCreateWidget() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: createWidget,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['widgets'], exact: true }),
  })
}
export function useUpdateWidget(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => updateWidget(id, text),
    onSuccess: async (widget) => {
      await client.cancelQueries({ queryKey: ['widgets', id], exact: true })
      client.setQueryData(['widgets', id], widget)
    },
  })
}
export function useDeleteWidget(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => deleteWidget(id),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: ['widgets', id], exact: true })
      client.setQueryData<WidgetSummary[]>(['widgets'], (list) =>
        list?.filter((widget) => widget.id !== id),
      )
      client.removeQueries({ queryKey: ['widgets', id], exact: true })
      await client.invalidateQueries({ queryKey: ['widgets'], exact: true })
    },
  })
}
export function useWidget(id: string) {
  return useQuery({
    queryKey: ['widgets', id],
    queryFn: ({ signal }) => getWidget(id, signal),
  })
}
