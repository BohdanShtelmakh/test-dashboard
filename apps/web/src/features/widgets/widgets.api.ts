import { apiFetch } from '../../shared/api/client.ts'
import type {
  WidgetDetail,
  WidgetSummary,
  CreateWidgetInput,
} from './widgets.types.ts'
export function getWidgets(signal?: AbortSignal): Promise<WidgetSummary[]> {
  return apiFetch('/api/widgets', { signal })
}

export function createWidget(input: CreateWidgetInput): Promise<WidgetSummary> {
  return apiFetch('/api/widgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
export function updateWidget(
  id: string,
  text: string,
): Promise<Extract<WidgetDetail, { type: 'TEXT' }>> {
  return apiFetch(`/api/widgets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}
export function deleteWidget(id: string): Promise<void> {
  return apiFetch(`/api/widgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
export function getWidget(
  id: string,
  signal?: AbortSignal,
): Promise<WidgetDetail> {
  return apiFetch(`/api/widgets/${encodeURIComponent(id)}`, { signal })
}
