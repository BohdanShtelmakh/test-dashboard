import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { useState } from 'react'
import { useUpdateWidget } from './widgets.queries.ts'
import type { WidgetDetail } from './widgets.types.ts'
export function TextWidget({
  widget,
}: {
  widget: Extract<WidgetDetail, { type: 'TEXT' }>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const mutation = useUpdateWidget(widget.id)
  if (editing)
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!mutation.isPending)
            mutation.mutate(draft, { onSuccess: () => setEditing(false) })
        }}
      >
        <Stack gap="sm">
          <Textarea
            label="Text content"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            minRows={5}
            disabled={mutation.isPending}
          />
          {mutation.isError && (
            <Alert color="red" role="alert">
              Unable to save text. Your draft is still here.
            </Alert>
          )}
          <Group>
            <Button type="submit" loading={mutation.isPending}>
              Save
            </Button>
            <Button
              variant="default"
              disabled={mutation.isPending}
              onClick={() => {
                setEditing(false)
                setDraft('')
                mutation.reset()
              }}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    )
  return (
    <Stack align="flex-start">
      <Text
        style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        c={widget.text ? undefined : 'dimmed'}
      >
        {widget.text || 'No text yet'}
      </Text>
      <Button
        size="xs"
        variant="light"
        onClick={() => {
          setDraft(widget.text ?? '')
          mutation.reset()
          setEditing(true)
        }}
      >
        Edit
      </Button>
    </Stack>
  )
}
