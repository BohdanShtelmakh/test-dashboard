import { expect, test } from '@playwright/test'
import type {
  WidgetDetail,
  WidgetSummary,
} from '../src/features/widgets/widgets.types.ts'

test('creates all widget types, persists chart data and text, handles errors, and deletes', async ({
  page,
  request,
}) => {
  const api = 'http://localhost:3001/api/widgets'
  const created: WidgetSummary[] = []
  const chartDetails = new Map<string, WidgetDetail>()
  const card = (id: string) =>
    page.locator(`article[aria-labelledby="widget-${id}"]`)
  try {
    await page.goto('/')
    const initial = await request.get(api)
    expect(initial.ok()).toBe(true)
    const summaries = (await initial.json()) as WidgetSummary[]
    for (const type of ['LINE', 'PIE', 'STACKED_BAR']) {
      const widget = summaries.find((item) => item.type === type)
      expect(widget, `Seeded ${type} widget`).toBeDefined()
      await expect(card(widget!.id).locator('.recharts-wrapper')).toBeVisible()
    }
    for (const label of [
      'Line chart',
      'Bar chart',
      'Stacked bar chart',
      'Pie chart',
      'Text',
    ]) {
      await page
        .getByRole('button', { name: 'Create widget', exact: true })
        .click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Widget type').click()
      await page.getByRole('option', { name: label, exact: true }).click()
      if (label === 'Text') {
        await dialog
          .getByRole('textbox', { name: 'Text content' })
          .fill('Initial text from creation')
        await page.route(api, async (route) => {
          if (route.request().method() === 'POST')
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: '{"message":"Test failure"}',
            })
          else await route.continue()
        })
        await dialog
          .getByRole('button', { name: 'Create', exact: true })
          .click()
        await expect(dialog.getByRole('alert')).toContainText(
          'Unable to create',
        )
        await expect(
          dialog.getByRole('textbox', { name: 'Text content' }),
        ).toHaveValue('Initial text from creation')
        await page.unroute(api)
      } else {
        await expect(
          dialog.getByRole('textbox', { name: 'Text content' }),
        ).toHaveCount(0)
      }
      const response = page.waitForResponse(
        (value) => value.url() === api && value.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      const result = await response
      expect(result.status()).toBe(201)
      const widget = (await result.json()) as WidgetSummary
      created.push(widget)
      await expect(dialog).not.toBeVisible()
      if (widget.type !== 'TEXT') {
        await expect(card(widget.id).locator('.recharts-wrapper')).toBeVisible()
        const detail = await request.get(`${api}/${widget.id}`)
        chartDetails.set(widget.id, (await detail.json()) as WidgetDetail)
      }
    }
    const text = created.find((widget) => widget.type === 'TEXT')!
    const textUrl = `${api}/${text.id}`
    await expect(
      card(text.id).getByText('Initial text from creation', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      card(text.id).getByText('Initial text from creation', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Create widget', exact: true })
      .click()
    await page.getByRole('dialog').getByLabel('Widget type').click()
    await page.getByRole('option', { name: 'Text', exact: true }).click()
    await expect(
      page.getByRole('dialog').getByRole('textbox', { name: 'Text content' }),
    ).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await card(text.id)
      .getByRole('button', { name: 'Edit', exact: true })
      .click()
    await card(text.id)
      .getByRole('textbox', { name: 'Text content' })
      .fill('Browser acceptance: saved text')
    await page.route(textUrl, async (route) => {
      if (route.request().method() === 'PATCH')
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"message":"Test failure"}',
        })
      else await route.continue()
    })
    await card(text.id)
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await expect(card(text.id).getByRole('alert')).toContainText(
      'Unable to save text',
    )
    await expect(card(text.id).getByRole('textbox')).toHaveValue(
      'Browser acceptance: saved text',
    )
    await page.unroute(textUrl)
    await card(text.id)
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    await expect(
      card(text.id).getByText('Browser acceptance: saved text', {
        exact: true,
      }),
    ).toBeVisible()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(textUrl, async (route) => {
      await gate
      await route.continue()
    })
    try {
      await page.reload()
      await expect(card(text.id)).toHaveAttribute('aria-busy', 'true')
    } finally {
      release()
    }
    await expect(
      card(text.id).getByText('Browser acceptance: saved text', {
        exact: true,
      }),
    ).toBeVisible()
    await page.unroute(textUrl)
    await page.route(textUrl, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"message":"Test failure"}',
      }),
    )
    await page.reload()
    await expect(card(text.id).getByRole('alert')).toContainText(
      'Please try again',
      { timeout: 15_000 }, // TanStack Query's default retries take 1 + 2 + 4 seconds.
    )
    await expect(card(created[0].id).locator('.recharts-wrapper')).toBeVisible()
    await page.unroute(textUrl)
    await card(text.id).getByRole('button', { name: 'Retry widget' }).click()
    await expect(
      card(text.id).getByText('Browser acceptance: saved text', {
        exact: true,
      }),
    ).toBeVisible()
    await page.reload()
    await expect(
      card(text.id).getByText('Browser acceptance: saved text', {
        exact: true,
      }),
    ).toBeVisible()
    for (const [id, expected] of chartDetails) {
      await expect(card(id).locator('.recharts-wrapper')).toBeVisible()
      expect(await (await request.get(`${api}/${id}`)).json()).toEqual(expected)
    }
    for (const widget of created) {
      await card(widget.id)
        .getByRole('button', { name: `Delete ${widget.title}`, exact: true })
        .click()
      await expect(card(widget.id)).toHaveCount(0)
      expect((await request.get(`${api}/${widget.id}`)).status()).toBe(404)
    }
  } finally {
    // Clean up only widgets created by this test, including on failure.
    for (const widget of created) {
      const result = await request.delete(`${api}/${widget.id}`)
      expect([204, 404]).toContain(result.status())
    }
  }
})
