import { expect, it } from 'vitest'
import { axisLabel } from './chart-style.ts'

it('preserves date-looking category labels and numbers', () => {
  expect(axisLabel('2025-01-01 campaign', 'STRING')).toBe('2025-01-01 campaign')
  expect(axisLabel(42, 'INTEGER')).toBe('42')
})
it('retains year and time for typed calendar axes', () => {
  expect(axisLabel('2025-01-01', 'DATE')).toBe('2025-01-01')
  expect(axisLabel('2025-01-01T12:30:00.000Z', 'DATETIME')).toBe(
    '2025-01-01 12:30',
  )
})
