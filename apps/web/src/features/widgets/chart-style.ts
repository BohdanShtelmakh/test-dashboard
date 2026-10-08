import type { DatasetColumn } from './widgets.types.ts'

const colors = ['blue', 'teal', 'violet', 'orange', 'grape', 'cyan', 'red']
export function chartColor(index: number): string {
  return `var(--mantine-color-${colors[index % colors.length]}-6)`
}
export function axisLabel(
  value: unknown,
  type?: DatasetColumn['type'],
): string {
  return (type === 'DATE' || type === 'DATETIME') &&
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)
    ? type === 'DATETIME'
      ? value.slice(0, 16).replace('T', ' ')
      : value.slice(0, 10)
    : String(value ?? '')
}
