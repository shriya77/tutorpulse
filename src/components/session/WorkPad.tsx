/**
 * Sketch pad for a student's handwritten working. Plain <canvas> with
 * pointer events, so a finger, stylus or mouse all work; no extra packages.
 *
 * The working lives on a "page" one unit wide and `pageH` units tall. It
 * starts 4:3 and grows downwards: writing near the bottom adds room, and so
 * does zooming out (you see more paper). Strokes are stored in page units, so
 * the drawing survives resizing, rotation, zoom and full screen. The canvas
 * only shows a window onto the page (`View`). `exportPng()` renders the used
 * part of the page onto white at 800 px wide, whatever the zoom.
 *
 * Comfort features:
 * - Zoom 50 to 400% (+/−, pinch, ctrl/⌘ + scroll); move with two fingers,
 *   scroll, or the Move tool. Two fingers only zoom once they clearly spread
 *   or pinch, so a two-finger drag is a clean move.
 * - Full screen: the pad fills the screen under the question and toolbar, so
 *   nothing else on the page can be touched.
 * - A stroke never selects page text, and once a stylus is used, finger and
 *   palm touches only move the page (palm rejection).
 *
 * The drawing is private to the student and their tutor (see
 * src/server/work-routes.ts); nothing here is shared live with the room.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownToLine, Eraser, Hand, Maximize2, Minimize2, Pen, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui'

/** The inline pad's shape (height / width), and the page's starting height. */
const ASPECT = 0.75
/** The page can grow to this many widths tall (2400 px when exported). */
export const MAX_PAGE_H = 3
/** How much room "More space" or writing near the bottom adds. */
const GROW = 0.375
const EXPORT_WIDTH = 800
const PEN_WIDTH = 0.006
const ERASER_WIDTH = 0.045
const INK = '#1d2b3a'
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 4
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
/** Grid cells across the page width. */
const GRID_CELLS = 24
/** Two fingers must change their distance by this much before they zoom. */
const PINCH_DEADZONE = 0.12

type Point = { x: number; y: number }
type Tool = 'pen' | 'eraser' | 'hand'
type Op = { kind: 'stroke'; tool: 'pen' | 'eraser'; points: Point[] } | { kind: 'clear' }
/** The window onto the page: `zoom` (1 = page width fills the pad) and its top-left corner in page units. */
export type View = { zoom: number; x: number; y: number }
type Gesture =
  | { kind: 'pan'; id: number; startX: number; startY: number; view: View }
  | { kind: 'pinch'; dist: number; midX: number; midY: number; view: View; zooming: boolean }

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

/**
 * Keep the zoom in range and the window on the page. `viewAspect` is the
 * pad's height / width on screen. A page narrower than the window is centred;
 * a page shorter than the window sits at the top.
 */
export function clampView(v: View, viewAspect: number, pageH: number): View {
  const zoom = clamp(v.zoom, MIN_ZOOM, MAX_ZOOM)
  const vw = 1 / zoom
  const vh = viewAspect / zoom
  return {
    zoom,
    x: vw > 1 ? -(vw - 1) / 2 : clamp(v.x, 0, 1 - vw),
    y: vh >= pageH ? 0 : clamp(v.y, 0, pageH - vh),
  }
}

/** Zoom to `zoom`, keeping the page point under (sx, sy) where it is. (sx, sy) are fractions of the pad's width. */
export function zoomAround(v: View, zoom: number, sx: number, sy: number, viewAspect: number, pageH: number): View {
  const px = v.x + sx / v.zoom
  const py = v.y + sy / v.zoom
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  return clampView({ zoom: z, x: px - sx / z, y: py - sy / z }, viewAspect, pageH)
}

/** Page height needed so zooming out shows paper, not a void: at least what's on screen. */
export function grownPage(pageH: number, zoom: number, viewAspect: number): number {
  return clamp(Math.max(pageH, viewAspect / zoom), ASPECT, MAX_PAGE_H)
}

/** How tall the exported image needs to be to hold the ink (rounded up, between 4:3 and the page). */
export function exportHeight(maxInkY: number, pageH: number): number {
  return clamp(Math.ceil((maxInkY + 0.06) / 0.125) * 0.125, ASPECT, Math.max(ASPECT, pageH))
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
  /** The pad's size on screen, in CSS px. */
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [base, setBase] = useState<HTMLCanvasElement | null>(null)
  const [pageH, setPageH] = useState(ASPECT)
  const [rawView, setRawView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const viewAspect = size.w ? size.h / size.w : ASPECT
  const view = clampView(rawView, viewAspect, pageH)
  const live = useRef({ view, viewAspect, pageH })
  live.current = { view, viewAspect, pageH }
  const drawing = useRef<{ id: number; op: Extract<Op, { kind: 'stroke' }> } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const gesture = useRef<Gesture | null>(null)
  const penSeen = useRef(false)
  const dirty = ops.length !== savedLength
  const opsCount = useRef(0)
  opsCount.current = ops.length

  /** Set the view; zooming out grows the page so there is paper to see and write on. */
  const setView = useCallback((v: View) => {
    const { viewAspect: a, pageH: h } = live.current
    const zoom = clamp(v.zoom, MIN_ZOOM, MAX_ZOOM)
    const grown = grownPage(h, zoom, a)
    if (grown !== h) setPageH(grown)
    setRawView(clampView({ ...v, zoom }, a, grown))
  }, [])

  useEffect(() => onDirtyChange?.(dirty), [dirty])

  // Load the saved working as the bottom layer, unless the student has
  // already started drawing (then their strokes already include it).
  useEffect(() => {
    if (!baseUrl || opsCount.current > 0) return
    const img = new Image()
    img.onload = () => {
      const b = inkOnly(img)
      setBase(b)
      setPageH((h) => clamp(Math.max(h, b.height / b.width), ASPECT, MAX_PAGE_H))
    }
    img.src = baseUrl
  }, [baseUrl])

  // Track the pad's size. Inline it is 4:3 at the column's width; in full
  // screen it fills the space under the toolbar. Re-observe after the portal swap.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      setSize({ w, h: expanded ? Math.round(entry.contentRect.height) : Math.round(w * ASPECT) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [expanded])

  // A tall window (full screen on a phone, or zoomed out) always shows paper, never a void.
  useEffect(() => {
    const grown = grownPage(pageH, view.zoom, viewAspect)
    if (grown !== pageH) setPageH(grown)
  }, [viewAspect, view.zoom, pageH])

  // Move only makes sense when there is somewhere to move to.
  const canPan = view.zoom > 1 || viewAspect / view.zoom < pageH - 1e-6
  useEffect(() => {
    if (!canPan && tool === 'hand') setTool('pen')
  }, [canPan, tool])

  /** Draw base + ink onto a context whose page is `s` px wide. Ink outside the page is clipped. */
  const paintInk = useCallback(
    (ctx: CanvasRenderingContext2D, s: number, list: Op[], h: number) => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, s, s * h)
      ctx.clip()
      ctx.clearRect(0, 0, s, s * h)
      const lastClear = list.map((o) => o.kind).lastIndexOf('clear')
      if (base && lastClear === -1) ctx.drawImage(base, 0, 0, s, (s * base.height) / base.width)
      for (const op of list.slice(lastClear + 1)) {
        if (op.kind !== 'stroke' || op.points.length === 0) continue
        ctx.globalCompositeOperation = op.tool === 'eraser' ? 'destination-out' : 'source-over'
        ctx.strokeStyle = INK
        ctx.fillStyle = INK
        ctx.lineWidth = (op.tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH) * s
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const [first, ...rest] = op.points
        if (rest.length === 0) {
          ctx.beginPath()
          ctx.arc(first.x * s, first.y * s, ctx.lineWidth / 2, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.beginPath()
        ctx.moveTo(first.x * s, first.y * s)
        for (const p of rest) ctx.lineTo(p.x * s, p.y * s)
        ctx.stroke()
      }
      ctx.restore()
    },
    [base],
  )

  /** Paint the visible window: ink, then the grid and paper behind it. */
  const redraw = useCallback(
    (list: Op[]) => {
      const canvas = canvasRef.current
      if (!canvas || !size.w) return
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
        canvas.width = Math.round(size.w * dpr)
        canvas.height = Math.round(size.h * dpr)
      }
      const ctx = canvas.getContext('2d')!
      const { view: v, pageH: h } = live.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const s = size.w * v.zoom
      ctx.setTransform(dpr, 0, 0, dpr, -v.x * s * dpr, -v.y * s * dpr)
      paintInk(ctx, s, list, h)
      // Paper and grid go *behind* the ink, so the eraser never erases them.
      const css = getComputedStyle(document.documentElement)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.strokeStyle = css.getPropertyValue('--color-grid').trim() || '#ece6da'
      ctx.lineWidth = 1
      ctx.beginPath()
      const cell = s / GRID_CELLS
      for (let x = cell; x < s - 0.5; x += cell) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, s * h)
      }
      for (let y = cell; y < s * h - 0.5; y += cell) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(s, Math.round(y) + 0.5)
      }
      ctx.stroke()
      ctx.fillStyle = css.getPropertyValue('--color-background').trim() || '#faf8f3'
      ctx.fillRect(0, 0, s, s * h)
      ctx.globalCompositeOperation = 'source-over'
    },
    [size, paintInk],
  )

  useEffect(
    () => redraw(drawing.current ? [...ops, drawing.current.op] : ops),
    [ops, redraw, view.zoom, view.x, view.y, pageH, expanded],
  )

  const isEmpty = (list: Op[]) => {
    const lastClear = list.map((o) => o.kind).lastIndexOf('clear')
    const strokes = list.slice(lastClear + 1).some((o) => o.kind === 'stroke' && o.tool === 'pen')
    return !strokes && !(base && lastClear === -1)
  }
  const hasInk = !isEmpty(ops)
  useEffect(() => onInkChange?.(hasInk), [hasInk])

  /** Lowest point with ink (page units), for trimming the export. */
  const inkBottom = (list: Op[]) => {
    const lastClear = list.map((o) => o.kind).lastIndexOf('clear')
    let y = base && lastClear === -1 ? base.height / base.width : 0
    for (const op of list.slice(lastClear + 1)) if (op.kind === 'stroke' && op.tool === 'pen') for (const p of op.points) y = Math.max(y, p.y)
    return y
  }

  useImperativeHandle(
    ref,
    () => ({
      dirty,
      markSaved: () => setSavedLength(ops.length),
      exportPng: async () => {
        if (isEmpty(ops)) return null
        const h = exportHeight(inkBottom(ops), pageH)
        const ink = document.createElement('canvas')
        ink.width = EXPORT_WIDTH
        ink.height = Math.round(EXPORT_WIDTH * h)
        paintInk(ink.getContext('2d')!, EXPORT_WIDTH, ops, h)
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
    [dirty, ops, paintInk, base, pageH],
  )

  /** Screen position as a fraction of the pad's width. */
  const screenFrac = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { sx: (clientX - r.left) / r.width, sy: (clientY - r.top) / r.width }
  }
  /** Screen position → page coordinates. */
  const toPage = (clientX: number, clientY: number): Point => {
    const { sx, sy } = screenFrac(clientX, clientY)
    const v = live.current.view
    return { x: v.x + sx / v.zoom, y: v.y + sy / v.zoom }
  }
  const touches = () => [...pointers.current.values()].filter((p) => p.type === 'touch')

  const startPinch = () => {
    const [a, b] = touches()
    const m = screenFrac((a.x + b.x) / 2, (a.y + b.y) / 2)
    gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, midX: m.sx, midY: m.sy, view: live.current.view, zooming: false }
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

    // A second finger: drop the half-started stroke and move (or zoom) instead.
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
      gesture.current = { kind: 'pan', id: e.pointerId, startX: e.clientX, startY: e.clientY, view: live.current.view }
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
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / g.dist
      // A two-finger drag moves; only a clear spread or pinch zooms.
      if (!g.zooming && Math.abs(ratio - 1) > PINCH_DEADZONE) g.zooming = true
      const zoom = g.zooming ? clamp(g.view.zoom * ratio, MIN_ZOOM, MAX_ZOOM) : g.view.zoom
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
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
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
      // Writing near the bottom of the page adds room below.
      const lowest = Math.max(...d.op.points.map((p) => p.y))
      if (d.op.tool === 'pen' && lowest > live.current.pageH - 0.15) setPageH((h) => Math.min(MAX_PAGE_H, h + GROW))
    }
  }

  // ctrl/⌘ + scroll (and trackpad pinch) zooms; plain scroll moves the page
  // when there's somewhere to go, otherwise it scrolls the screen as usual.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      const { view: v, viewAspect: a, pageH: h } = live.current
      const r = canvas.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM)
        const grown = grownPage(h, zoom, a)
        if (grown !== h) setPageH(grown)
        setRawView(zoomAround(v, zoom, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, a, grown))
        return
      }
      const next = clampView({ ...v, x: v.x + e.deltaX / r.width / v.zoom, y: v.y + e.deltaY / r.width / v.zoom }, a, h)
      if (Math.abs(next.x - v.x) > 1e-6 || Math.abs(next.y - v.y) > 1e-6) {
        e.preventDefault()
        setRawView(next)
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

  /** Step the zoom from the buttons, keeping the middle of the view in place. */
  const stepZoom = (dir: 1 | -1) => {
    const { view: v, viewAspect: a, pageH: h } = live.current
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > v.zoom + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < v.zoom - 0.01)
    const zoom = next ?? v.zoom
    const grown = grownPage(h, zoom, a)
    if (grown !== h) setPageH(grown)
    setRawView(zoomAround(v, zoom, 0.5, a / 2, a, grown))
  }

  const iconButton = (props: { label: string; icon: ReactNode; testId: string; onClick: () => void; pressed?: boolean; disabled?: boolean; variant?: 'secondary' | 'ghost' | 'outline' | 'default'; className?: string }) => (
    <Button
      type="button" size="sm" className={`px-2 sm:px-2.5 ${props.className ?? ''}`} variant={props.variant ?? 'ghost'} aria-pressed={props.pressed}
      onClick={props.onClick} disabled={props.disabled} data-testid={props.testId} aria-label={props.label} title={props.label}
    >
      {props.icon}
      <span className="hidden sm:inline">{props.label}</span>
    </Button>
  )

  const toolbar = (
    <div className={`flex flex-wrap items-center gap-0.5 sm:gap-1 ${expanded ? 'mx-auto w-full max-w-6xl' : ''}`} role="toolbar" aria-label="Drawing tools">
      {iconButton({ label: 'Pen', icon: <Pen aria-hidden />, testId: 'work-pen', onClick: () => setTool('pen'), pressed: tool === 'pen', disabled, variant: tool === 'pen' ? 'secondary' : 'ghost' })}
      {iconButton({ label: 'Eraser', icon: <Eraser aria-hidden />, testId: 'work-eraser', onClick: () => setTool('eraser'), pressed: tool === 'eraser', disabled, variant: tool === 'eraser' ? 'secondary' : 'ghost' })}
      {canPan && iconButton({ label: 'Move', icon: <Hand aria-hidden />, testId: 'work-hand', onClick: () => setTool('hand'), pressed: tool === 'hand', variant: tool === 'hand' ? 'secondary' : 'ghost' })}
      <span className="mx-0.5 inline-flex items-center rounded-lg border border-input">
        <Button type="button" size="sm" variant="ghost" className="px-1.5 sm:px-2" onClick={() => stepZoom(-1)} disabled={view.zoom <= MIN_ZOOM + 0.01} aria-label="Zoom out" title="Zoom out" data-testid="work-zoom-out">
          <ZoomOut aria-hidden />
        </Button>
        <span className="w-9 text-center text-xs tabular-nums text-muted-foreground sm:w-10" aria-live="polite" data-testid="work-zoom-level">
          {Math.round(view.zoom * 100)}%
        </span>
        <Button type="button" size="sm" variant="ghost" className="px-1.5 sm:px-2" onClick={() => stepZoom(1)} disabled={view.zoom >= MAX_ZOOM - 0.01} aria-label="Zoom in" title="Zoom in" data-testid="work-zoom-in">
          <ZoomIn aria-hidden />
        </Button>
      </span>
      {iconButton({
        label: 'More space', icon: <ArrowDownToLine aria-hidden />, testId: 'work-more-space', disabled: disabled || pageH >= MAX_PAGE_H - 1e-6,
        onClick: () => {
          const { view: v, viewAspect: a } = live.current
          const h = Math.min(MAX_PAGE_H, pageH + GROW)
          setPageH(h)
          // Show the new room: scroll to the bottom of the page.
          setRawView(clampView({ ...v, y: h }, a, h))
        },
      })}
      {iconButton({ label: 'Undo', icon: <Undo2 aria-hidden />, testId: 'work-undo', onClick: () => setOps((l) => l.slice(0, -1)), disabled: disabled || ops.length === 0, className: 'ml-auto' })}
      {iconButton({ label: 'Clear', icon: <Trash2 aria-hidden />, testId: 'work-clear', onClick: () => setOps((l) => [...l, { kind: 'clear' }]), disabled: disabled || isEmpty(ops) })}
      {iconButton({
        label: expanded ? 'Done' : 'Full screen', icon: expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />, testId: 'work-expand',
        onClick: () => setExpanded((x) => !x), pressed: expanded, variant: expanded ? 'default' : 'outline',
      })}
    </div>
  )

  const canvas = (
    <canvas
      ref={canvasRef}
      data-testid="work-canvas"
      aria-label="Working area. Draw your steps with a finger, stylus or mouse."
      role="img"
      className={`block touch-none ${
        disabled ? 'cursor-not-allowed opacity-60' : tool === 'hand' ? 'cursor-grab' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
      }`}
      style={{ width: size.w || '100%', height: size.h || undefined, aspectRatio: size.w ? undefined : `${1 / ASPECT}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  )

  const hint = 'Zoom with + and −, a pinch, or ctrl/⌘ + scroll; zoom out or tap More space for more room. Move with two fingers or the Move tool.'

  if (!expanded) {
    return (
      <div className="grid select-none gap-2 [-webkit-touch-callout:none]" data-testid="work-pad">
        {toolbar}
        <div ref={wrapRef} className="overflow-hidden rounded-xl border border-input bg-muted/60">
          {canvas}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    )
  }

  return (
    <>
      <div className="paper-grid grid place-items-center rounded-xl border border-dashed border-input text-sm text-muted-foreground" style={{ aspectRatio: `${1 / ASPECT}` }}>
        Drawing in full screen…
      </div>
      {createPortal(
        <div
          className="fixed inset-0 z-50 flex touch-none select-none flex-col gap-2 overscroll-contain bg-background p-2 sm:p-3 [-webkit-touch-callout:none]"
          role="dialog"
          aria-modal="true"
          aria-label="Working, full screen"
          data-testid="work-fullscreen"
        >
          {fullScreenHeading && (
            <div
              className="mx-auto max-h-20 w-full max-w-6xl shrink-0 overflow-y-auto text-center text-sm text-foreground [&_.katex-display]:my-0 [@media(max-height:500px)]:max-h-14 [@media(max-height:500px)]:text-xs"
              data-testid="work-fullscreen-heading"
            >
              {fullScreenHeading}
            </div>
          )}
          {toolbar}
          {/* The pad takes every pixel that's left. */}
          <div ref={wrapRef} className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl border border-input bg-muted/60">
            {canvas}
          </div>
          <p className="shrink-0 text-center text-xs text-muted-foreground [@media(max-height:500px)]:hidden">
            {hint} Done or Esc to go back.
          </p>
        </div>,
        document.body,
      )}
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
