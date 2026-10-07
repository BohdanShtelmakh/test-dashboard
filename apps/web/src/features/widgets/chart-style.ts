const colors = ['blue', 'teal', 'violet', 'orange', 'grape', 'cyan', 'red']
export function chartColor(index: number): string {
  return `var(--mantine-color-${colors[index % colors.length]}-6)`
}
export function axisLabel(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(5, 10)
    : String(value ?? '')
}
