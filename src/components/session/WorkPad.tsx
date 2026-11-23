/**
 * Sketch pad for a student's handwritten working. Plain <canvas> with
 * pointer events, so a finger, stylus or mouse all work; no extra packages.
 *
 * Strokes are stored in "page" coordinates relative to the pad's width, so
 * the drawing survives a resize, a rotation, zooming and full screen, and is
 * redrawn on every change. `exportPng()` renders the whole page onto white at
 * a fixed 800 px width, whatever the zoom: small enough to upload quickly and
 * to send to the clustering model.
 *
 * Comfort features:
 * - Zoom (+/−, pinch, ctrl/⌘ + scroll) and moving around a zoomed page (Move
 *   tool, two fingers, scroll). Writing zoomed in gives finer strokes.
 * - Full screen: the pad covers the page, so nothing else can be touched.
 * - A stroke never selects page text, and once a stylus is used, finger and
 *   palm touches only move the page instead of drawing (palm rejection).
 *
 * The drawing is private to the student and their tutor (see
 * src/server/work-routes.ts); nothing here is shared live with the room.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eraser, Hand, Maximize2, Minimize2, Pen, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui'

/** Height as a fraction of width (4:3 leaves room for several lines on a phone). */
const ASPECT = 0.75
const EXPORT_WIDTH = 800
const PEN_WIDTH = 0.006
const ERASER_WIDTH = 0.045
const INK = '#1d2b3a'
const ZOOM_STEPS = [1, 1.5, 2, 3, 4]
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]
/** Grid cell of the `paper-grid` background, in CSS px at 100%. */
const GRID = 32

type Point = { x: number; y: number }
type Tool = 'pen' | 'eraser' | 'hand'
type Op = { kind: 'stroke'; tool: 'pen' | 'eraser'; points: Point[] } | { kind: 'clear' }
/** What part of the page is on screen: `zoom`, and the top-left corner in page units. */
export type View = { zoom: number; x: number; y: number }
type Gesture =
  | { kind: 'pan'; id: number; startX: number; startY: number; view: View }
  | { kind: 'pinch'; dist: number; midX: number; midY: number; view: View }

export interface WorkPadHandle {
  /** True once the student has drawn, erased, undone or cleared since the last save. */
  dirty: boolean
  /** The drawing as a PNG, or null when the pad is empty. */
  exportPng: () => Promise<Blob | null>
  /** After a save: keep the current drawing but mark it as saved. */
  markSaved: () => void
}

interface Props {
  /** Saved working to start from (a blob URL), drawn underneath new strokes. */
  baseUrl?: string | null
  disabled?: boolean
  onDirtyChange?: (dirty: boolean) => void
  /** Whether the pad shows any working (saved or new). */
  onInkChange?: (hasInk: boolean) => void
  /** Shown above the pad in full screen, so the question stays in view. */
  fullScreenHeading?: ReactNode
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Keep the zoom in range and the visible window inside the page. */
export function clampView(v: View): View {
  const zoom = clamp(v.zoom, 1, MAX_ZOOM)
  return { zoom, x: clamp(v.x, 0, 1 - 1 / zoom), y: clamp(v.y, 0, ASPECT * (1 - 1 / zoom)) }
}

/**
 * Zoom to `zoom`, keeping the page point under (sx, sy) where it is on screen.
 * (sx, sy) are screen positions as a fraction of the pad's width.
 */
export function zoomAround(v: View, zoom: number, sx: number, sy: number): View {
  const px = v.x + sx / v.zoom
  const py = v.y + sy / v.zoom
  const z = clamp(zoom, 1, MAX_ZOOM)
  return clampView({ zoom: z, x: px - sx / z, y: py - sy / z })
}

/**
 * While a stroke is in progress (and briefly after), the whole page refuses to
 * start a text selection. Some browsers (Safari, touch screens) begin selecting
 * nearby text when a stroke leaves the pad or a palm rests on the page.
 */
const selectionLock = (() => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let on = false
  const block = (e: Event) => e.preventDefault()
  const set = (lock: boolean) => {
    if (lock === on) return
    on = lock
    const st = document.documentElement.style as CSSStyleDeclaration & { webkitUserSelect: string }
    st.userSelect = lock ? 'none' : ''
    st.webkitUserSelect = lock ? 'none' : ''
    if (lock) document.addEventListener('selectstart', block, true)
    else document.removeEventListener('selectstart', block, true)
  }
  return {
    hold() {
      clearTimeout(timer)
      set(true)
      window.getSelection()?.removeAllRanges()
    },
    releaseSoon(ms = 800) {
      clearTimeout(timer)
      timer = setTimeout(() => set(false), ms)
    },
  }
})()

export const WorkPad = forwardRef<WorkPadHandle, Props>(function WorkPad({ baseUrl, disabled, onDirtyChange, onInkChange, fullScreenHeading }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ops, setOps] = useState<Op[]>([])
  const [savedLength, setSavedLength] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [width, setWidth] = useState(0)
  const [base, setBase] = useState<HTMLCanvasElement | null>(null)
  const [view, setViewState] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const viewRef = useRef(view)
  viewRef.current = view
  const setView = (v: View) => setViewState(clampView(v))
  const drawing = useRef<{ id: number; op: Extract<Op, { kind: 'stroke' }> } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const gesture = useRef<Gesture | null>(null)
  const penSeen = useRef(false)
  const dirty = ops.length !== savedLength
  const opsCount = useRef(0)
  opsCount.current = ops.length

  useEffect(() => onDirtyChange?.(dirty), [dirty])
  // Move only makes sense zoomed in (its button hides at 100%): fall back to the pen.
  useEffect(() => {
    if (view.zoom <= 1 && tool === 'hand') setTool('pen')
  }, [view.zoom, tool])

  // Load the saved working as the bottom layer, unless the student has
  // already started drawing (then their strokes already include it).
  useEffect(() => {
    if (!baseUrl || opsCount.current > 0) return
    const img = new Image()
    img.onload = () => setBase(inkOnly(img))
    img.src = baseUrl
  }, [baseUrl])

  // The pad moves into a portal in full screen, so re-observe the new element.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [expanded])

  /** Draw base + ops onto a context whose page is `w` px wide. */
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, list: Op[]) => {
      const h = w * ASPECT
      ctx.clearRect(0, 0, w, h)
      const lastClear = list.map((o) => o.kind).lastIndexOf('clear')
      if (base && lastClear === -1) ctx.drawImage(base, 0, 0, w, h)
      for (const op of list.slice(lastClear + 1)) {
        if (op.kind !== 'stroke' || op.points.length === 0) continue
        ctx.globalCompositeOperation = op.tool === 'eraser' ? 'destination-out' : 'source-over'
        ctx.strokeStyle = INK
        ctx.fillStyle = INK
        ctx.lineWidth = (op.tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH) * w
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const [first, ...rest] = op.points
        if (rest.length === 0) {
          ctx.beginPath()
          ctx.arc(first.x * w, first.y * w, ctx.lineWidth / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.beginPath()
        ctx.moveTo(first.x * w, first.y * w)
        for (const p of rest) ctx.lineTo(p.x * w, p.y * w)
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    [base],
  )

  /** Paint the visible part of the page at the current zoom. */
  const redraw = useCallback(
    (list: Op[]) => {
      const canvas = canvasRef.current
      if (!canvas || !width) return
      const dpr = window.devicePixelRatio || 1
      const h = Math.round(width * ASPECT)
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')!
      const v = viewRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const page = width * v.zoom
      ctx.setTransform(dpr, 0, 0, dpr, -v.x * page * dpr, -v.y * page * dpr)
      paint(ctx, page, list)
    },
    [width, paint],
  )

  useEffect(() => redraw(drawing.current ? [...ops, drawing.current.op] : ops), [ops, redraw, view, expanded])

  const isEmpty = (list: Op[]) => {
    const lastClear = list.map((o) => o.kind).lastIndexOf('clear')
    const strokes = list.slice(lastClear + 1).some((o) => o.kind === 'stroke' && o.tool === 'pen')
    return !strokes && !(base && lastClear === -1)
  }
  const hasInk = !isEmpty(ops)
  useEffect(() => onInkChange?.(hasInk), [hasInk])

  useImperativeHandle(
    ref,
    () => ({
      dirty,
      markSaved: () => setSavedLength(ops.length),
      exportPng: async () => {
        if (isEmpty(ops)) return null
        const ink = document.createElement('canvas')
        ink.width = EXPORT_WIDTH
        ink.height = Math.round(EXPORT_WIDTH * ASPECT)
        paint(ink.getContext('2d')!, EXPORT_WIDTH, ops)
        // Erased pixels are transparent: put the ink on white paper.
        const out = document.createElement('canvas')
        out.width = ink.width
        out.height = ink.height
        const ctx = out.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(ink, 0, 0)
        return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'))
      },
    }),
    [dirty, ops, paint, base],
  )

  /** Screen position as a fraction of the pad's width. */
  const screenFrac = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { sx: (clientX - r.left) / r.width, sy: (clientY - r.top) / r.width }
  }
  /** Screen position → page coordinates. */
  const toPage = (clientX: number, clientY: number): Point => {
    const { sx, sy } = screenFrac(clientX, clientY)
    const v = viewRef.current
    return { x: v.x + sx / v.zoom, y: v.y + sy / v.zoom }
  }
  const touches = () => [...pointers.current.values()].filter((p) => p.type === 'touch')

  const startPinch = () => {
    const [a, b] = touches()
    const m = screenFrac((a.x + b.x) / 2, (a.y + b.y) / 2)
    gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, midX: m.sx, midY: m.sy, view: viewRef.current }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    // No text selection, no focus change, no page scroll from a stroke.
    e.preventDefault()
    selectionLock.hold()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-released pointers can't be captured; drawing still works.
    }
    if (e.pointerType === 'pen') penSeen.current = true
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })

    // A second finger turns the gesture into pinch-zoom / two-finger move.
    if (e.pointerType === 'touch' && touches().length === 2) {
      drawing.current = null
      redraw(ops)
      startPinch()
      return
    }
    if (pointers.current.size > 1 || drawing.current) return // a palm or extra finger: ignore

    // With a stylus in use, fingers and palms only move the page.
    const moveOnly = disabled || tool === 'hand' || e.button === 1 || (e.pointerType === 'touch' && penSeen.current)
    if (moveOnly) {
      gesture.current = { kind: 'pan', id: e.pointerId, startX: e.clientX, startY: e.clientY, view: viewRef.current }
      return
    }
    drawing.current = { id: e.pointerId, op: { kind: 'stroke', tool: tool === 'eraser' ? 'eraser' : 'pen', points: [toPage(e.clientX, e.clientY)] } }
    redraw([...ops, drawing.current.op])
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    const g = gesture.current
    if (g?.kind === 'pinch') {
      const pair = touches()
      if (pair.length < 2) return
      const [a, b] = pair
      const m = screenFrac((a.x + b.x) / 2, (a.y + b.y) / 2)
      const zoom = clamp((g.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist, 1, MAX_ZOOM)
      // Keep the page point that was under the fingers' midpoint under it now.
      const px = g.view.x + g.midX / g.view.zoom
      const py = g.view.y + g.midY / g.view.zoom
      setView({ zoom, x: px - m.sx / zoom, y: py - m.sy / zoom })
      return
    }
    if (g?.kind === 'pan' && g.id === e.pointerId) {
      const r = canvasRef.current!.getBoundingClientRect()
      setView({ ...g.view, x: g.view.x - (e.clientX - g.startX) / r.width / g.view.zoom, y: g.view.y - (e.clientY - g.startY) / r.width / g.view.zoom })
      return
    }
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    // Coalesced events keep fast stylus strokes smooth.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events.length ? events : [e.nativeEvent]) d.op.points.push(toPage(ev.clientX, ev.clientY))
    redraw([...ops, d.op])
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) selectionLock.releaseSoon()
    const g = gesture.current
    if (g?.kind === 'pinch' && touches().length < 2) gesture.current = null
    if (g?.kind === 'pan' && g.id === e.pointerId) gesture.current = null
    const d = drawing.current
    if (d && d.id === e.pointerId) {
      drawing.current = null
      setOps((list) => [...list, d.op])
    }
  }

  // ctrl/⌘ + scroll (and trackpad pinch) zooms; plain scroll moves a zoomed page.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current
      const r = canvas.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const { sx, sy } = { sx: (e.clientX - r.left) / r.width, sy: (e.clientY - r.top) / r.width }
        setViewState(zoomAround(v, v.zoom * Math.exp(-e.deltaY * 0.01), sx, sy))
      } else if (v.zoom > 1) {
        e.preventDefault()
        setViewState(clampView({ ...v, x: v.x + e.deltaX / r.width / v.zoom, y: v.y + e.deltaY / r.width / v.zoom }))
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [expanded])

  // Never leave the page unable to select text.
  useEffect(() => () => selectionLock.releaseSoon(0), [])

  // Esc leaves full screen.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  /** Step the zoom from the buttons, keeping the centre of the view in place. */
  const stepZoom = (dir: 1 | -1) => {
    const v = viewRef.current
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > v.zoom + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < v.zoom - 0.01)
    setViewState(zoomAround(v, next ?? v.zoom, 0.5, ASPECT / 2))
  }

  const page = width * view.zoom
  const toolButton = (t: Tool, label: string, Icon: typeof Pen, testId: string) => (
    <Button
      type="button" size="sm" className="px-2.5" variant={tool === t ? 'secondary' : 'ghost'} aria-pressed={tool === t}
      onClick={() => setTool(t)} disabled={disabled && t !== 'hand'} data-testid={testId}
    >
      <Icon aria-hidden /> {label}
    </Button>
  )

  const pad = (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-50 flex touch-none select-none flex-col gap-2 overscroll-contain bg-background p-3 [-webkit-touch-callout:none]'
          : 'grid select-none gap-2 [-webkit-touch-callout:none]'
      }
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? 'Working, full screen' : undefined}
      data-testid={expanded ? 'work-fullscreen' : 'work-pad'}
    >
      {expanded && fullScreenHeading && (
        <div className="mx-auto max-h-24 w-full max-w-5xl overflow-y-auto text-center text-foreground" data-testid="work-fullscreen-heading">
          {fullScreenHeading}
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-1 ${expanded ? 'mx-auto w-full max-w-5xl' : ''}`} role="toolbar" aria-label="Drawing tools">
        {toolButton('pen', 'Pen', Pen, 'work-pen')}
        {toolButton('eraser', 'Eraser', Eraser, 'work-eraser')}
        {view.zoom > 1 && toolButton('hand', 'Move', Hand, 'work-hand')}
        <span className="mx-1 inline-flex items-center rounded-lg border border-input">
          <Button type="button" size="sm" variant="ghost" className="px-2" onClick={() => stepZoom(-1)} disabled={view.zoom <= 1} aria-label="Zoom out" data-testid="work-zoom-out">
            <ZoomOut aria-hidden />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite" data-testid="work-zoom-level">
            {Math.round(view.zoom * 100)}%
          </span>
          <Button type="button" size="sm" variant="ghost" className="px-2" onClick={() => stepZoom(1)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in" data-testid="work-zoom-in">
            <ZoomIn aria-hidden />
          </Button>
        </span>
        <Button
          type="button" size="sm" variant="ghost" className="ml-auto px-2.5" onClick={() => setOps((l) => l.slice(0, -1))}
          disabled={disabled || ops.length === 0} data-testid="work-undo"
        >
          <Undo2 aria-hidden /> Undo
        </Button>
        <Button
          type="button" size="sm" variant="ghost" className="px-2.5" onClick={() => setOps((l) => [...l, { kind: 'clear' }])}
          disabled={disabled || isEmpty(ops)} data-testid="work-clear"
        >
          <Trash2 aria-hidden /> Clear
        </Button>
        <Button
          type="button" size="sm" variant={expanded ? 'default' : 'outline'} className="px-2.5" onClick={() => setExpanded((x) => !x)}
          aria-pressed={expanded} data-testid="work-expand"
        >
          {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />} {expanded ? 'Done' : 'Full screen'}
        </Button>
      </div>
      <div
        ref={wrapRef}
        className={`paper-grid overflow-hidden rounded-xl border border-input ${expanded ? 'mx-auto' : ''}`}
        // In full screen, the biggest 4:3 pad that fits under the toolbar.
        style={{
          width: expanded ? `min(100%, calc((100dvh - ${fullScreenHeading ? 13 : 7.5}rem) / 0.75))` : undefined,
          backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
          backgroundPosition: `${-view.x * page - 1}px ${-view.y * page - 1}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="work-canvas"
          aria-label="Working area. Draw your steps with a finger, stylus or mouse."
          role="img"
          className={`block w-full touch-none ${
            disabled ? 'cursor-not-allowed opacity-60' : tool === 'hand' ? 'cursor-grab' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
          }`}
          style={{ height: width ? Math.round(width * ASPECT) : undefined, aspectRatio: width ? undefined : `${1 / ASPECT}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <p className={`text-xs text-muted-foreground ${expanded ? 'text-center' : ''}`}>
        Zoom with + and −, a pinch, or ctrl/⌘ + scroll. Move around with two fingers or the Move tool.
        {expanded ? ' Press Done (or Esc) to go back.' : ''}
      </p>
      {expanded && (
        <p className="hidden text-center text-sm font-medium text-foreground portrait:block" data-testid="work-rotate-tip">
          Tip: turn your phone sideways for a bigger pad.
        </p>
      )}
    </div>
  )

  if (!expanded) return pad
  return (
    <>
      <div className="paper-grid grid place-items-center rounded-xl border border-dashed border-input text-sm text-muted-foreground" style={{ aspectRatio: `${1 / ASPECT}` }}>
        Drawing in full screen…
      </div>
      {createPortal(pad, document.body)}
    </>
  )
})

/**
 * The saved PNG is ink on white paper. Turn the paper transparent so the
 * pad's grid shows through and new strokes sit on the same page.
 */
function inkOnly(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const darkness = 255 - Math.min(px[i], px[i + 1], px[i + 2])
    px[i + 3] = Math.min(255, darkness * 1.4)
  }
  ctx.putImageData(data, 0, 0)
  return c
}
