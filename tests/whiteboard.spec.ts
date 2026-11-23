/**
 * Whiteboard end to end (spends one small clustering call):
 *   RUN_AI_TESTS=1 npx deepspace test run tests/whiteboard.spec.ts
 *
 * A student on a phone writes their working on the pad and submits a wrong
 * answer. The tutor's misconception group shows that working as a thumbnail,
 * and when the student comes back, the pad still holds what they wrote.
 * Screenshots go to test-results/whiteboard-*.png.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(process.env.RUN_AI_TESTS !== '1', 'Set RUN_AI_TESTS=1 (spends one small clustering call).')
test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')

test('a student’s working reaches the tutor’s misconception group', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, student] = await users(2)
  await student.page.setViewportSize({ width: 390, height: 844 })
  for (const u of [tutor, student]) {
    await u.page.goto('/home')
    await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 20_000 })
  }
  const token = async (u: typeof tutor) => ((await (await u.context.request.post('/api/auth/token')).json()) as { token: string }).token
  const [tt, st] = [await token(tutor), await token(student)]
  const create = async (collection: string, data: Record<string, unknown>) => {
    const res = await tutor.context.request.post('/_deepspace/agent/browser/tools/records_create', {
      headers: { Authorization: `Bearer ${tt}` },
      data: { input: { collection, data } },
    })
    const body = (await res.json()) as { result: { data?: { recordId: string }; recordId?: string } }
    return (body.result.data?.recordId ?? body.result.recordId)!
  }
  const action = async (t: string, u: typeof tutor, name: string, data: Record<string, unknown>) =>
    (await (await u.context.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${t}` }, data })).json()) as {
      success: boolean
      data?: Record<string, string>
    }

  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ whiteboard` })
  const problemId = await create('problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}\\sin(3x^2)' })
  await create('answerKeys', { problemId, answer: '6x*cos(3x^2)', expectedMistakes: 'Forgetting the inner derivative' })
  try {
    const opened = await action(tt, tutor, 'openSession', { sessionId })
    expect((await action(st, student, 'joinSession', { joinCode: opened.data!.joinCode })).success).toBe(true)

    // ── The student writes "d/dx sin(u) = cos(u)" style working with a finger ──
    const page = student.page
    await page.goto(`/sessions/${sessionId}`)
    const canvas = page.getByTestId('work-canvas')
    await expect(canvas).toBeVisible({ timeout: 20_000 })
    await canvas.scrollIntoViewIfNeeded() // mouse coordinates must be inside the viewport
    const box = (await canvas.boundingBox())!
    const stroke = async (pts: Array<[number, number]>) => {
      await page.mouse.move(box.x + pts[0][0] * box.width, box.y + pts[0][1] * box.height)
      await page.mouse.down()
      for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 4 })
      await page.mouse.up()
    }
    // A few scribbled "lines" of working, then an underline.
    for (const row of [0.2, 0.4, 0.6]) {
      await stroke(Array.from({ length: 14 }, (_, i) => [0.08 + i * 0.05, row + (i % 2 ? 0.04 : -0.04)] as [number, number]))
    }
    await stroke([[0.08, 0.78], [0.7, 0.78]])
    await page.getByTestId('answer-input').fill('cos(3x^2)')
    // With working on the pad, the one-line explanation is not asked for.
    await expect(page.getByTestId('explanation-input')).toHaveCount(0)
    await page.getByTestId('submit-answer').click()
    await expect(page.getByTestId('submit-status')).toContainText('Submitted', { timeout: 20_000 })
    await page.screenshot({ path: 'test-results/whiteboard-student.png', fullPage: true })

    // ── The tutor opens the group and sees the working ──────────────────────
    await tutor.page.goto(`/sessions/${sessionId}`)
    await expect(tutor.page.getByTestId('cluster-count').first()).toHaveText('1', { timeout: 90_000 })
    await expect(tutor.page.getByTestId('cluster-toggle').first()).toContainText('with working')
    await tutor.page.getByTestId('cluster-toggle').first().click()
    const thumb = tutor.page.getByTestId('work-thumb').first()
    await expect(thumb).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() => thumb.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 15_000 })
      .toBe(800)
    await thumb.click() // enlarge
    await thumb.scrollIntoViewIfNeeded()
    await tutor.page.screenshot({ path: 'test-results/whiteboard-tutor.png' })

    // ── Coming back, the pad still shows the saved working ──────────────────
    await page.reload()
    await expect(page.getByTestId('work-canvas')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(
        () =>
          page.getByTestId('work-canvas').evaluate((c: HTMLCanvasElement) => {
            const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
            let ink = 0
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 128) ink++
            return ink
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(100)
  } finally {
    await action(tt, tutor, 'cleanupTestSession', { sessionId, problemId })
  }
})
