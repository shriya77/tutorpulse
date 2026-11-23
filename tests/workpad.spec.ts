/**
 * Sketch pad comfort: a stroke never selects page text; zoom and Move; full
 * screen covers the page so nothing else can be touched; with a stylus in
 * use, finger/palm touches don't draw. No answers are submitted, so no AI.
 */
import { test, expect, loadAllTestAccounts, type Page } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

/** Dispatch a synthetic pointer stroke (pen or touch) across the canvas. */
async function syntheticStroke(page: Page, pointerType: 'pen' | 'touch', pointerId: number) {
  await page.getByTestId('work-canvas').evaluate(
    (c: HTMLCanvasElement, { pointerType, pointerId }) => {
      const r = c.getBoundingClientRect()
      const at = (f: number) => ({ clientX: r.left + r.width * f, clientY: r.top + r.height * (0.3 + f / 3), pointerId, pointerType, isPrimary: true, bubbles: true, buttons: 1 })
      c.dispatchEvent(new PointerEvent('pointerdown', at(0.2)))
      for (const f of [0.3, 0.4, 0.5, 0.6]) c.dispatchEvent(new PointerEvent('pointermove', at(f)))
      c.dispatchEvent(new PointerEvent('pointerup', at(0.6)))
    },
    { pointerType, pointerId },
  )
}

/** Two synthetic touches moving together; `spread` scales the gap between them by the end. */
async function twoFingers(page: Page, dy: number, spread: number, wobble = 0) {
  await page.getByTestId('work-canvas').evaluate(
    (c: HTMLCanvasElement, { dy, spread, wobble }) => {
      const r = c.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const ev = (type: string, id: number, x: number, y: number) =>
        c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: id === 51, bubbles: true, buttons: 1 }))
      const gap = 60
      ev('pointerdown', 51, cx - gap, cy)
      ev('pointerdown', 52, cx + gap, cy)
      for (let i = 1; i <= 10; i++) {
        const t = i / 10
        const g = gap * (1 + (spread - 1) * t) * (1 + (i % 2 ? wobble : -wobble))
        ev('pointermove', 51, cx - g, cy + dy * t)
        ev('pointermove', 52, cx + g, cy + dy * t)
      }
      ev('pointerup', 51, cx - gap * spread, cy + dy)
      ev('pointerup', 52, cx + gap * spread, cy + dy)
    },
    { dy, spread, wobble },
  )
}

test('the pad zooms, goes full screen, never selects text, and ignores palms', async ({ users }) => {
  test.setTimeout(150_000)
  const [tutor, student] = await users(2)
  const token = async (u: typeof tutor) => {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
    return ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  }
  const [tt, st] = [await token(tutor), await token(student)]
  const post = async (u: typeof tutor, t: string, path: string, data: unknown) =>
    (await (await u.context.request.post(path, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as Record<string, any>
  const create = async (collection: string, data: Record<string, unknown>) => {
    const b = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_create', { input: { collection, data } })
    return (b.result.data?.recordId ?? b.result.recordId) as string
  }
  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ pad` })
  const problemId = await create('problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}\\sin(3x^2)' })
  await create('answerKeys', { problemId, answer: '6x*cos(3x^2)' })
  try {
    const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
    expect((await post(student, st, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)

    const page = student.page
    await page.setViewportSize({ width: 1000, height: 700 })
    await page.goto(`/sessions/${sessionId}`)
    const canvas = page.getByTestId('work-canvas')
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await canvas.scrollIntoViewIfNeeded()
    const clear = page.getByTestId('work-clear')

    // 1. A mouse stroke that runs off the pad, over the page's text, selects nothing.
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5 - i * 40)
    await page.mouse.up()
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
    await expect(clear).toBeEnabled() // the stroke was drawn

    // While a stroke is held down, the page refuses to start selecting text anywhere
    // (what Safari and touch screens try when a stroke leaves the pad or a palm lands).
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    const during = await page.evaluate(() => {
      const text = document.querySelector('[data-testid="student-problem"]') ?? document.body
      const ev = new Event('selectstart', { bubbles: true, cancelable: true })
      text.dispatchEvent(ev)
      return { refused: ev.defaultPrevented, userSelect: getComputedStyle(text).userSelect }
    })
    await page.mouse.up()
    expect(during).toEqual({ refused: true, userSelect: 'none' })
    await expect.poll(() => page.evaluate(() => document.documentElement.style.userSelect), { timeout: 3_000 }).toBe('') // released after the stroke

    // 2. Zoom in; Move pans without drawing; drawing zoomed in still counts.
    await clear.click()
    await expect(clear).toBeDisabled()
    await page.getByTestId('work-zoom-in').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('150%')
    await page.getByTestId('work-zoom-in').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('200%')
    await page.getByTestId('work-hand').click()
    await canvas.hover()
    await page.mouse.down()
    await page.mouse.move(box.x + 50, box.y + 50, { steps: 5 })
    await page.mouse.up()
    await expect(clear).toBeDisabled() // moving never draws
    await page.getByTestId('work-pen').click()
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 })
    await page.mouse.up()
    await expect(clear).toBeEnabled()
    await page.getByTestId('work-zoom-out').click()
    await page.getByTestId('work-zoom-out').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('100%')
    await expect(page.getByTestId('work-hand')).toHaveCount(0)

    // Zooming out shows more paper to write on (and Move appears, as there's somewhere to go).
    await page.getByTestId('work-zoom-out').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('75%')
    await page.getByTestId('work-zoom-out').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('50%')
    await expect(page.getByTestId('work-zoom-out')).toBeDisabled()
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.85)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.95, { steps: 4 })
    await page.mouse.up() // writing low on the zoomed-out page, i.e. below the old 4:3 page
    await page.getByTestId('work-zoom-in').click()
    await page.getByTestId('work-zoom-in').click()
    await expect(page.getByTestId('work-zoom-level')).toHaveText('100%')
    await expect(page.getByTestId('work-hand')).toBeVisible() // the page is taller now, so it can move
    await expect(page.getByTestId('work-more-space')).toBeEnabled()

    // Two fingers: a drag with natural wobble in the finger gap only moves (no zoom
    // creep, no ink); a clear spread zooms.
    const level = page.getByTestId('work-zoom-level')
    const undoWasEnabled = await page.getByTestId('work-undo').isEnabled()
    await twoFingers(page, -80, 1, 0.06)
    await expect(level).toHaveText('100%')
    await twoFingers(page, 0, 1.8)
    await expect(level).not.toHaveText('100%')
    expect(await page.getByTestId('work-undo').isEnabled()).toBe(undoWasEnabled)
    await page.getByTestId('work-zoom-out').click()
    while ((await level.textContent()) !== '100%') await page.getByTestId((Number.parseInt((await level.textContent()) ?? '100') > 100) ? 'work-zoom-out' : 'work-zoom-in').click()

    // 3. Full screen covers the whole window, so the rest of the page can't be touched.
    const answerBox = (await page.getByTestId('answer-input').boundingBox())!
    await page.getByTestId('work-expand').click()
    const full = page.getByTestId('work-fullscreen')
    await expect(full).toBeVisible()
    expect(await full.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1000, height: 700 })
    await expect(page.getByTestId('work-fullscreen-heading')).toContainText('sin') // the question stays in view
    // The pad fills the window under the question and toolbar.
    const fsCanvas = (await page.getByTestId('work-canvas').boundingBox())!
    expect(fsCanvas.width).toBeGreaterThan(900)
    expect(fsCanvas.height).toBeGreaterThan(400)
    const hit = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid="work-fullscreen"]'),
      { x: answerBox.x + answerBox.width / 2, y: Math.min(answerBox.y + answerBox.height / 2, 690) },
    )
    expect(hit).toBe(true)
    await expect(page.getByTestId('work-clear')).toBeEnabled() // the same drawing, now full screen
    await page.screenshot({ path: 'test-results/workpad-fullscreen.png' })
    await page.keyboard.press('Escape')
    await expect(full).toHaveCount(0)
    await expect(page.getByTestId('work-pad')).toBeVisible()
    await expect(clear).toBeEnabled()

    // On a phone, full screen fits the width and the toolbar wraps instead of overflowing.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('work-expand').click()
    await expect(full).toBeVisible()
    expect(await full.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const phoneCanvas = (await page.getByTestId('work-canvas').boundingBox())!
    expect(phoneCanvas.height).toBeGreaterThan(500) // a tall pad, not a 4:3 strip
    // The toolbar fits on one row on a phone: every button overlaps the first one vertically.
    const oneRow = await page.getByRole('toolbar', { name: 'Drawing tools' }).evaluate((el) => {
      const first = (el.children[0] as HTMLElement).getBoundingClientRect()
      return [...el.children].every((c) => (c as HTMLElement).getBoundingClientRect().top < first.bottom)
    })
    expect(oneRow).toBe(true)
    await page.screenshot({ path: 'test-results/workpad-fullscreen-phone.png' })
    // Phone on its side: still a big pad, not a thumbnail.
    await page.setViewportSize({ width: 844, height: 390 })
    await expect.poll(async () => (await page.getByTestId('work-canvas').boundingBox())!.width).toBeGreaterThan(780)
    expect((await page.getByTestId('work-canvas').boundingBox())!.height).toBeGreaterThan(200)
    const heading = (await page.getByTestId('work-fullscreen-heading').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight })))
    expect(heading.scroll).toBeLessThanOrEqual(heading.client + 1) // the question fits, not cut off
    await page.screenshot({ path: 'test-results/workpad-fullscreen-landscape.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('work-expand').click()
    await expect(full).toHaveCount(0)
    await page.setViewportSize({ width: 1000, height: 700 })
    await canvas.scrollIntoViewIfNeeded()

    // 4. Palm rejection: after a stylus stroke, a touch doesn't draw.
    await clear.click()
    await syntheticStroke(page, 'pen', 41)
    await expect(clear).toBeEnabled()
    await page.getByTestId('work-undo').click()
    await expect(clear).toBeDisabled()
    await syntheticStroke(page, 'touch', 42)
    await expect(clear).toBeDisabled()
  } finally {
    await post(tutor, tt, '/api/actions/testCleanupPrivacyFixture', { sessionId })
  }
})
