import { Alert, Button, Modal, Select, Stack } from '@mantine/core'
import { useState } from 'react'
import { useCreateWidget } from './widgets.queries.ts'
import type { WidgetType } from './widgets.types.ts'

const options: { value: WidgetType; label: string }[] = [
  { value: 'LINE', label: 'Line chart' },
  { value: 'BAR', label: 'Bar chart' },
  { value: 'STACKED_BAR', label: 'Stacked bar chart' },
  { value: 'PIE', label: 'Pie chart' },
  { value: 'TEXT', label: 'Text' },
]
export function CreateWidgetModal({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const [type, setType] = useState<WidgetType>('LINE')
  const mutation = useCreateWidget()
  function close() {
    if (!mutation.isPending) {
      mutation.reset()
      onClose()
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Create widget"
      closeOnClickOutside={!mutation.isPending}
      closeOnEscape={!mutation.isPending}
      withCloseButton={!mutation.isPending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!mutation.isPending)
            mutation.mutate(type, {
              onSuccess: () => {
                mutation.reset()
                onClose()
              },
            })
        }}
      >
        <Stack>
          <Select
            label="Widget type"
            data={options}
            value={type}
            allowDeselect={false}
            disabled={mutation.isPending}
            onChange={(value) => {
              const option = options.find((item) => item.value === value)
              if (option) setType(option.value)
            }}
          />
          {mutation.isError && (
            <Alert color="red" role="alert">
              Unable to create the widget. Please try again.
            </Alert>
          )}
          <Button type="submit" loading={mutation.isPending}>
            Create
          </Button>
        </Stack>
      </form>
    </Modal>
  )
}
