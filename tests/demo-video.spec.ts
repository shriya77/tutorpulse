/**
 * Records the ~2-minute demo on the LIVE app with 8 real test accounts:
 *   RECORD_DEMO=1 npx playwright test -c tests/playwright.live.config.ts tests/demo-video.spec.ts
 * then `bash scripts/make-demo-video.sh` stitches the two recordings
 * (tutor laptop + Maya's phone) side by side into docs/demo/tutorpulse-demo.mp4.
 *
 * Story: students join, Maya writes her working on the sketch pad, answers
 * arrive, the wrong ones are grouped by misconception live (reading the
 * working too), the tutor opens a student's working, takes the biggest group
 * to the board, students revise, and that group's count falls while
 * "Correct" climbs.
 * Four students act through the same server actions the app's buttons call;
 * Maya acts on her (recorded) phone. The others' working is rendered in a
 * handwriting font and uploaded to their own folders, like the pad does. Captions are injected into the recorded
 * tutor page only — they are not part of the app. Spends a few AI credits.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { ensureStorageState, findTestAccountByName } from 'deepspace/testing'
import { DEMO_PROBLEMS, DEMO_TITLE } from './fixtures/chain-rule-demo'
import { handwrittenLine } from './fixtures/handwriting'

test.skip(process.env.RECORD_DEMO !== '1', 'Set RECORD_DEMO=1 to record the demo video (spends a few AI credits).')

const OUT = 'test-results/demo-raw'
const LAPTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Smoothly bring an element to the middle of the tutor's screen. */
async function focusOn(page: Page, testId: string) {
  await page.getByTestId(testId).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await pause(900)
}

type Actor = { name: string; ctx: BrowserContext; page: Page; token: string }

/** The other students' working: a handwriting-font PNG, like the eval uses. */
async function renderWorking(page: Page, lines: string[], seed: number): Promise<Buffer> {
  const html = `<!doctype html><html><head>
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=block" rel="stylesheet">
    <style>
      body{margin:0;background:#fff}
      #pad{width:800px;height:600px;box-sizing:border-box;padding:56px 48px;font:500 76px/1.45 Caveat,cursive;color:#1d2b3a}
      div.l{white-space:pre;transform:rotate(${((seed % 3) - 1) * 0.8}deg)}
    </style></head><body><div id="pad">${lines
      .map((l, i) => `<div class="l" style="margin-left:${((seed + i) * 13) % 28}px">${l}</div>`)
      .join('')}</div></body></html>`
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page.locator('#pad').screenshot({ type: 'png' })
}

/** Maya writes on the real pad with pointer strokes, a line at a time. */
async function writeOnPad(page: Page, lines: Array<{ text: string; row: number }>) {
  const canvas = page.getByTestId('work-canvas')
  await canvas.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await pause(900)
  const box = (await canvas.boundingBox())!
  const aspect = box.height / box.width
  const em = 0.11
  for (const [i, { text, row }] of lines.entries()) {
    for (const stroke of handwrittenLine(text, 0.07, 0.05 + row * em * 1.5, em, aspect, i + 3)) {
      const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const
      await page.mouse.move(...at(stroke[0]))
      await page.mouse.down()
      for (const p of stroke.slice(1)) {
        await page.mouse.move(...at(p), { steps: 3 })
        await pause(14)
      }
      await page.mouse.up()
      await pause(60)
    }
    await pause(250)
  }
}

async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'demo-caption'
      el.setAttribute('style', [
        'position:fixed', 'left:50%', 'top:68px', 'transform:translateX(-50%)', 'z-index:99999',
        'background:rgba(29,43,58,0.92)', 'color:#fff', 'font:600 20px/1.3 "Source Sans 3",system-ui,sans-serif',
        'padding:12px 22px', 'border-radius:999px', 'box-shadow:0 6px 24px rgba(0,0,0,.18)', 'max-width:90%', 'text-align:center',
      ].join(';'))
      document.body.appendChild(el)
    }
    el.textContent = t
  }, text)
}

test('record the TutorPulse demo', async ({ browser, baseURL }) => {
  test.setTimeout(420_000)
  mkdirSync(OUT, { recursive: true })
  const base = baseURL!

  // ── Cast (accounts created for the demo) ────────────────────────────────
  const names = ['Tutor', 'Maya', 'Jordan', 'Priya', 'Leo', 'Sam']
  const states = await Promise.all(names.map((n) => ensureStorageState(browser, findTestAccountByName(n), base)))
  const t0 = Date.now()
  const actors: Actor[] = []
  for (const [i, name] of names.entries()) {
    const recorded = name === 'Tutor' || name === 'Maya'
    const size = name === 'Maya' ? PHONE : LAPTOP
    const ctx = await browser.newContext({
      storageState: states[i],
      viewport: size,
      deviceScaleFactor: 1,
      ...(recorded ? { recordVideo: { dir: `${OUT}/${name.toLowerCase()}`, size } } : {}),
    })
    const page = await ctx.newPage()
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 30_000 })
    const { token } = (await (await ctx.request.post('/api/auth/token')).json()) as { token: string }
    actors.push({ name, ctx, page, token })
  }
  const [tutor, maya, ...others] = actors
  const by = (n: string) => actors.find((a) => a.name === n)!
  const act = async (who: Actor, name: string, data: Record<string, unknown>) => {
    const res = await who.ctx.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${who.token}` }, data })
    const body = (await res.json()) as { success: boolean; data?: Record<string, string>; error?: string }
    expect(body.success, `${who.name} ${name}: ${body.error}`).toBe(true)
    return body.data!
  }
  const create = async (collection: string, data: Record<string, unknown>) => {
    const res = await tutor.ctx.request.post('/_deepspace/agent/browser/tools/records_create', {
      headers: { Authorization: `Bearer ${tutor.token}` },
      data: { input: { collection, data } },
    })
    const body = (await res.json()) as { result?: { data?: { recordId?: string } } }
    return body.result!.data!.recordId!
  }

  // ── Off-camera setup: the tutor's prepared session ──────────────────────
  const sessionId = await create('sessions', { title: DEMO_TITLE })
  for (const [i, p] of DEMO_PROBLEMS.entries()) {
    const problemId = await create('problems', { sessionId, order: i + 1, prompt: p.prompt })
    await create('answerKeys', { problemId, answer: p.answer, expectedMistakes: p.mistakes })
  }
  const { joinCode } = await act(tutor, 'openSession', { sessionId })
  const problemId = await (async () => {
    const res = await tutor.ctx.request.post('/_deepspace/agent/browser/tools/records_query', {
      headers: { Authorization: `Bearer ${tutor.token}` },
      data: { input: { collection: 'problems', where: { sessionId, order: 1 } } },
    })
    const body = (await res.json()) as { result: { data: { records: Array<{ recordId: string }> } } }
    return body.result.data.records[0].recordId
  })()

  // Off camera: the other students' working, uploaded to their own folders.
  const painter = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage()
  const upload = async (who: Actor, png: Buffer) => {
    const res = await who.ctx.request.post(`/api/files/upload?scope=self&key=${encodeURIComponent(`work/${problemId}.png`)}`, {
      headers: { Authorization: `Bearer ${who.token}` },
      multipart: { file: { name: 'working.png', mimeType: 'image/png', buffer: png } },
    })
    const body = (await res.json()) as { key?: string; error?: string }
    expect(body.key, `${who.name} upload: ${body.error}`).toBeTruthy()
    return body.key!
  }
  const working: Record<string, string[]> = {
    Jordan: ['d/dx sin(3x²)', 'sin -> cos', '= cos(3x²)'],
    Leo: ['outside: sin -> cos(3x²)', "inside: (3x²)' = 6x", 'multiply: 6x cos(3x²)'],
    Priya: ["(sin 3x²)' = cos 3x²"],
    Sam: ["(sin u)' = -cos u", "u = 3x²,  u' = 6x", '= -6x cos(3x²)'],
  }
  const keys: Record<string, string> = {}
  for (const [i, [who, lines]] of Object.entries(working).entries()) keys[who] = await upload(by(who), await renderWorking(painter, lines, i + 2))
  // Jordan's revised working is uploaded when he revises (same file, so not before).
  const revisedPng = await renderWorking(painter, ["sin -> cos, times the inside", "(3x²)' = 6x", '= 6x cos(3x²)'], 7)
  await painter.context().close()

  // ── Scene 1: the room joins (0:00) ──────────────────────────────────────
  await tutor.page.goto(`/sessions/${sessionId}`)
  await expect(tutor.page.getByTestId('join-qr')).toBeVisible({ timeout: 20_000 })
  await maya.page.goto('/home')
  const sceneStart = Date.now()
  await caption(tutor.page, 'TutorPulse: a live room for group tutoring.')
  await pause(4500)
  await caption(tutor.page, 'A Calc I chain rule session. Students scan the QR code to join.')
  await pause(3000)
  await maya.page.getByTestId('join-code-input').pressSequentially(joinCode, { delay: 140 })
  await maya.page.getByTestId('join-submit').click()
  for (const s of others) {
    await pause(1600)
    await act(s, 'joinSession', { joinCode })
    await s.page.goto(`/sessions/${sessionId}`) // like a real student: on the session screen, so the roster shows them online
  }
  await expect(tutor.page.getByTestId('joined-count')).toHaveText('5 students joined', { timeout: 20_000 })
  await focusOn(tutor.page, 'roster')
  await caption(tutor.page, 'The roster fills in live as students arrive.')
  await expect(tutor.page.getByTestId('roster')).toContainText('5 online', { timeout: 20_000 })
  await pause(4000)

  // ── Scene 2: answers arrive, checked instantly (≈0:15) ──────────────────
  await focusOn(tutor.page, 'board-problem')
  const answers: Array<[string, string, string]> = [
    ['Jordan', 'cos(3x²)', 'sin goes to cos'],
    ['Leo', '6x cos(3x²)', 'chain rule, outside derivative times inside derivative'],
    ['Priya', 'cos(3x^2)', 'just took the derivative of the sin part'],
    ['Sam', '-6x*cos(3x^2)', 'derivative of sin is negative cos'],
  ]
  await caption(tutor.page, 'Students show their working on a sketch pad, with a finger or stylus.')
  await writeOnPad(maya.page, [
    { text: 'sin(3x²)', row: 0 },
    { text: '= cos(3x²)', row: 1 },
  ])
  await pause(600)
  await caption(tutor.page, 'Then type the final answer. Each one is checked exactly by maths, not by AI.')
  await maya.page.getByTestId('answer-input').scrollIntoViewIfNeeded()
  await maya.page.getByTestId('answer-input').pressSequentially('cos(3x^2)', { delay: 90 })
  await maya.page.getByTestId('submit-answer').click()
  for (const [who, answer, explanation] of answers) {
    await pause(2200)
    await act(by(who), 'submitAnswer', { problemId, answer, explanation, workKey: keys[who] })
  }
  await expect(tutor.page.getByTestId('stat-submitted').first()).toHaveText('5', { timeout: 20_000 })

  // ── Scene 3: the misconception radar (≈0:35) ────────────────────────────
  await caption(tutor.page, 'The wrong answers are grouped by why they are wrong, reading the working too.')
  const topCount = tutor.page.getByTestId('cluster-count').first()
  await expect(topCount).toHaveText('3', { timeout: 90_000 })
  await focusOn(tutor.page, 'cluster')
  await pause(8000)
  const topLabel = (await tutor.page.getByTestId('cluster-label').first().textContent())!.trim()
  await caption(tutor.page, `“${topLabel}”: 3 of 5 students. One explanation can fix most of the room.`)
  await pause(3000)
  await tutor.page.getByTestId('cluster-toggle').first().click()
  await focusOn(tutor.page, 'cluster')
  await caption(tutor.page, 'The tutor sees the answers and working behind it, without names.')
  await pause(5000)
  const thumb = tutor.page.getByTestId('work-thumb').first()
  await expect(thumb.locator('img')).toBeVisible({ timeout: 15_000 })
  await thumb.click()
  await focusOn(tutor.page, 'work-thumb')
  await caption(tutor.page, 'Tap the working to enlarge it: the inner derivative never appears.')
  await pause(7000)
  await thumb.click()
  await focusOn(tutor.page, 'cluster')

  // ── Scene 4: take it to the board (≈1:00) ───────────────────────────────
  await caption(tutor.page, 'Take it to the board: every student sees the topic on their screen.')
  await tutor.page.getByTestId('take-to-board').first().click()
  await expect(maya.page.getByTestId('focus-banner')).toContainText(topLabel, { timeout: 15_000 })
  await pause(9000)

  // ── Scene 5: students revise, the count drops (≈1:10) ───────────────────
  await caption(tutor.page, 'After the explanation, students revise. Watch the count fall.')
  await writeOnPad(maya.page, [{ text: '= 6x cos(3x²)', row: 2 }])
  await maya.page.getByTestId('answer-input').scrollIntoViewIfNeeded()
  await maya.page.getByTestId('answer-input').fill('')
  await maya.page.getByTestId('answer-input').pressSequentially('6x*cos(3x^2)', { delay: 90 })
  await maya.page.getByTestId('submit-answer').click()
  for (const [who, answer] of [['Jordan', '6x cos(3x^2)']] as const) {
    await pause(3500)
    const workKey = await upload(by(who), revisedPng)
    await act(by(who), 'submitAnswer', { problemId, answer, explanation: 'multiplied by the inside derivative', workKey })
  }
  await expect(tutor.page.getByTestId('stat-correct').first()).toHaveText('3', { timeout: 20_000 })
  await expect(topCount).toHaveText('1', { timeout: 30_000 })
  await focusOn(tutor.page, 'board-problem')
  await pause(3000)
  await caption(tutor.page, 'Correct went from 1 to 3. The group shrank from 3 students to 1.')
  await pause(9000)
  await caption(tutor.page, 'TutorPulse: see why, teach once, watch it land.')
  await pause(5000)
  const sceneEnd = Date.now()

  for (const a of actors) await a.ctx.close()
  writeFileSync(
    `${OUT}/timing.json`,
    JSON.stringify({ startSeconds: (sceneStart - t0) / 1000, durationSeconds: (sceneEnd - sceneStart) / 1000, topLabel, sessionId }, null, 1),
  )
  console.log('[demo] recorded', JSON.stringify({ seconds: Math.round((sceneEnd - sceneStart) / 1000), topLabel }))
})
