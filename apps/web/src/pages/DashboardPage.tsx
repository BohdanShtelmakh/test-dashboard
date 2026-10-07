import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { WidgetCard, WidgetSkeleton } from '../features/widgets/WidgetCard.tsx'
import { useWidgets } from '../features/widgets/widgets.queries.ts'
import { CreateWidgetModal } from '../features/widgets/CreateWidgetModal.tsx'
import { useState } from 'react'

export function DashboardPage() {
  const query = useWidgets()
  const [creating, setCreating] = useState(false)
  return (
    <Container component="main" size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1}>Dashboard</Title>
        <Button onClick={() => setCreating(true)}>Create widget</Button>
      </Group>
      <CreateWidgetModal opened={creating} onClose={() => setCreating(false)} />
      {query.isError && query.data && (
        <Alert color="red" role="alert" mb="lg">
          <Group justify="space-between">
            <Text>Unable to refresh the dashboard. Showing saved widgets.</Text>
            <Button
              variant="light"
              color="red"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Retry dashboard
            </Button>
          </Group>
        </Alert>
      )}
      {query.isPending ? (
        <div
          className="dashboard-grid"
          aria-label="Loading dashboard"
          aria-busy="true"
        >
          {[0, 1, 2].map((key) => (
            <WidgetSkeleton key={key} />
          ))}
        </div>
      ) : query.isError && !query.data ? (
        <Alert color="red" title="Unable to load the dashboard" role="alert">
          <Stack gap="sm">
            <Text>Please try again.</Text>
            <Button
              variant="light"
              color="red"
              onClick={() => void query.refetch()}
              loading={query.isFetching}
            >
              Retry dashboard
            </Button>
          </Stack>
        </Alert>
      ) : query.data?.length ? (
        <div className="dashboard-grid">
          {query.data.map((summary) => (
            <WidgetCard key={summary.id} summary={summary} />
          ))}
        </div>
      ) : (
        <Paper withBorder p="xl" radius="md">
          <Text c="dimmed">No widgets to display yet.</Text>
        </Paper>
      )}
    </Container>
  )
}
