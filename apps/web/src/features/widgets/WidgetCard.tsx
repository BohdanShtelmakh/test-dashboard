import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Title,
} from '@mantine/core'
import { useDeleteWidget, useWidget } from './widgets.queries.ts'
import type { WidgetSummary } from './widgets.types.ts'
import { WidgetRenderer } from './WidgetRenderer.tsx'

export function WidgetSkeleton() {
  return (
    <Card
      withBorder
      radius="md"
      padding="lg"
      aria-label="Loading widget"
      aria-busy="true"
    >
      <Skeleton height={24} width="65%" mb="md" />
      <Skeleton height={300} />
    </Card>
  )
}
export function WidgetCard({ summary }: { summary: WidgetSummary }) {
  const query = useWidget(summary.id)
  const deletion = useDeleteWidget(summary.id)
  return (
    <Card
      component="article"
      withBorder
      radius="md"
      padding="lg"
      className="widget-card"
      aria-labelledby={`widget-${summary.id}`}
      aria-busy={query.isPending}
    >
      <Group justify="space-between" wrap="nowrap" mb="md" align="flex-start">
        <Title order={2} size="h4" id={`widget-${summary.id}`}>
          {query.data?.title ?? summary.title}
        </Title>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Delete ${summary.title}`}
          loading={deletion.isPending}
          onClick={() => {
            if (!deletion.isPending) deletion.mutate()
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
          </svg>
        </ActionIcon>
      </Group>
      {deletion.isError && (
        <Alert color="red" role="alert" mb="sm">
          Unable to delete this widget. Please try again.
        </Alert>
      )}
      <div className="widget-body">
        {query.isPending ? (
          <Skeleton height="100%" aria-label="Loading chart" />
        ) : query.isError ? (
          <Alert color="red" title="Unable to load this widget" role="alert">
            <Stack gap="sm">
              <span>Please try again.</span>
              <Button
                variant="light"
                color="red"
                size="xs"
                onClick={() => void query.refetch()}
                loading={query.isFetching}
              >
                Retry widget
              </Button>
            </Stack>
          </Alert>
        ) : query.data ? (
          <WidgetRenderer widget={query.data} />
        ) : null}
      </div>
    </Card>
  )
}
