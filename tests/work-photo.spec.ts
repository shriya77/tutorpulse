/**
 * Photo of paper working, end to end (one small clustering call when
 * RUN_AI_TESTS=1; without it the AI part is skipped):
 *   RUN_AI_TESTS=1 npx deepspace test run tests/work-photo.spec.ts
 *
 * The "phone photo" carries an EXIF block (where GPS would live). The app
 * re-encodes it on the phone, so what reaches the tutor has no EXIF; the raw
 * photo uploaded straight to the student's folder is refused by submitAnswer.
 * Screenshots: test-results/work-photo-student.png, work-photo-tutor.png.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts.')
const AI = process.env.RUN_AI_TESTS === '1'

/** Insert an APP1 "Exif" segment (fake GPS payload) right after the JPEG's SOI marker. */
function withExif(jpeg: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), Buffer.from('GPS 30.2672N 97.7431W')])
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload])
  return Buffer.concat([jpeg.subarray(0, 2), seg, jpeg.subarray(2)])
}

test('a photo of paper working reaches the tutor without its EXIF', async ({ users }) => {
  test.setTimeout(180_000)
  const [tutor, student] = await users(2)
  await student.page.setViewportSize({ width: 390, height: 844 })
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
  const sessionId = await create('sessions', { title: `__test-${Date.now()}__ photo` })
  const problemId = await create('problems', { sessionId, order: 1, prompt: '\\frac{d}{dx}\\sin(3x^2)' })
  await create('answerKeys', { problemId, answer: '6x*cos(3x^2)' })
  try {
    const opened = await post(tutor, tt, '/api/actions/openSession', { sessionId })
    expect((await post(student, st, '/api/actions/joinSession', { joinCode: opened.data.joinCode })).success).toBe(true)

    // A "phone photo" of working on paper, with EXIF added.
    const page = student.page
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 1600
      c.height = 1200
      const g = c.getContext('2d')!
      g.fillStyle = '#f4f1ea'
      g.fillRect(0, 0, c.width, c.height)
      g.fillStyle = '#1d2b3a'
      g.font = 'italic 90px cursive'
      ;['d/dx sin(3x²)', '= cos(3x²)'].forEach((l, i) => g.fillText(l, 120, 300 + i * 200))
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]
    })
    const raw = withExif(Buffer.from(b64, 'base64'))
    expect(raw.includes(Buffer.from('Exif'))).toBe(true)

    await page.goto(`/sessions/${sessionId}`)
    await expect(page.getByTestId('work-canvas')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('work-photo-input').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: raw })
    await expect(page.getByTestId('work-photo')).toBeVisible()
    await expect(page.getByTestId('work-canvas')).toHaveCount(0)
    await expect(page.getByTestId('explanation-input')).toHaveCount(0)
    await page.getByTestId('answer-input').fill('cos(3x^2)')
    await page.getByTestId('submit-answer').click()
    await expect(page.getByTestId('submit-status')).toContainText('Submitted', { timeout: 20_000 })
    await page.screenshot({ path: 'test-results/work-photo-student.png', fullPage: true })

    // What the tutor receives is a JPEG with no EXIF.
    const subs = await post(tutor, tt, '/_deepspace/agent/browser/tools/records_query', { input: { collection: 'submissions', where: { problemId } } })
    const sub = (subs.result.data?.records ?? subs.result.records)[0] as { recordId: string; data: { workKey: string } }
    expect(sub.data.workKey).toMatch(/-photo\.jpg$/)
    const res = await tutor.context.request.get(`/api/submissions/${sub.recordId}/work`, { headers: { Authorization: `Bearer ${tt}` } })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/jpeg')
    const got = await res.body()
    expect(got.subarray(0, 2).toString('hex')).toBe('ffd8')
    expect(got.includes(Buffer.from('Exif')), 'EXIF stripped').toBe(false)
    expect(got.includes(Buffer.from('GPS 30.2672N')), 'location stripped').toBe(false)

    // The raw photo, uploaded straight to the student's own folder, is refused.
    const up = await student.context.request.post(`/api/files/upload?scope=self&key=${encodeURIComponent(`work/${problemId}-raw.jpg`)}`, {
      headers: { Authorization: `Bearer ${st}` },
      multipart: { file: { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: raw } },
    })
    const rawKey = ((await up.json()) as { key: string }).key
    expect(await post(student, st, '/api/actions/submitAnswer', { problemId, answer: 'cos(3x^2)', workKey: rawKey })).toEqual({
      success: false,
      error: 'Your working must be a drawing or photo from the app',
    })

    // Coming back, the saved photo is shown instead of the pad.
    await page.reload()
    await expect(page.getByTestId('work-photo')).toBeVisible({ timeout: 20_000 })

    if (AI) {
      const tp = tutor.page
      await tp.goto(`/sessions/${sessionId}`)
      await expect(tp.getByTestId('cluster-count').first()).toHaveText('1', { timeout: 90_000 })
      await expect(tp.getByTestId('cluster-toggle').first()).toContainText('with working')
      await tp.getByTestId('cluster-toggle').first().click()
      const img = tp.getByTestId('work-thumb').first().locator('img')
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth), { timeout: 15_000 }).toBe(1400)
      await tp.getByTestId('work-thumb').first().click()
      await tp.getByTestId('work-thumb').first().scrollIntoViewIfNeeded()
      await tp.screenshot({ path: 'test-results/work-photo-tutor.png' })
      console.log('[photo] group:', await tp.getByTestId('cluster-label').first().textContent(), '|', await tp.getByTestId('cluster').first().locator('p').first().textContent())
    }
  } finally {
    await post(tutor, tt, '/api/actions/testCleanupPrivacyFixture', { sessionId, problemId })
  }
})
