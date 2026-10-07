import { Container, Stack, Text, Title } from '@mantine/core'

export function DashboardPage() {
  return (
    <Container component="main" size="lg" py="xl">
      <Stack gap="sm">
        <Title order={1}>Dashboard</Title>
        <Text c="dimmed">Your dashboard will take shape here.</Text>
      </Stack>
    </Container>
  )
}
