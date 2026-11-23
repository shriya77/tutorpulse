/**
 * Sketch pad for a student's handwritten working. Plain <canvas> with
 * pointer events, so a finger, stylus or mouse all work; no extra packages.
 *
 * Strokes are stored in coordinates relative to the pad's width, so the
 * drawing survives a resize or rotation, and are redrawn on every change.
 * `exportPng()` renders them onto white at a fixed 800 px width: small
 * enough to upload quickly and to send to the clustering model.
 *
 * The drawing is private to the student and their tutor (see
 * src/server/work-routes.ts); nothing here is shared live with the room.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser, Pen, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui'

/** Height as a fraction of width (4:3 leaves room for several lines on a phone). */
const ASPECT = 0.75
const EXPORT_WIDTH = 800
const PEN_WIDTH = 0.006
const ERASER_WIDTH = 0.045
const INK = '#1d2b3a'

type Point = { x: number; y: number }
type Op = { kind: 'stroke'; tool: 'pen' | 'eraser'; points: Point[] } | { kind: 'clear' }

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
}

export const WorkPad = forwardRef<WorkPadHandle, Props>(function WorkPad({ baseUrl, disabled, onDirtyChange, onInkChange }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ops, setOps] = useState<Op[]>([])
  const [savedLength, setSavedLength] = useState(0)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [width, setWidth] = useState(0)
  const [base, setBase] = useState<HTMLCanvasElement | null>(null)
  const drawing = useRef<Op | null>(null)
  const dirty = ops.length !== savedLength
  const opsCount = useRef(0)
  opsCount.current = ops.length

  useEffect(() => onDirtyChange?.(dirty), [dirty])

  // Load the saved working as the bottom layer, unless the student has
  // already started drawing (then their strokes already include it).
  useEffect(() => {
    if (!baseUrl || opsCount.current > 0) return
    const img = new Image()
    img.onload = () => setBase(inkOnly(img))
    img.src = baseUrl
  }, [baseUrl])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Draw base + ops onto a context whose drawing area is `w` px wide. */
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

  const redraw = useCallback(
    (list: Op[]) => {
      const canvas = canvasRef.current
      if (!canvas || !width) return
      const dpr = window.devicePixelRatio || 1
      const h = Math.round(width * ASPECT)
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(ctx, width, list)
    },
    [width, paint],
  )

  useEffect(() => redraw(ops), [ops, redraw])

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

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: ((e.clientY - r.top) / r.width) }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = { kind: 'stroke', tool, points: [toPoint(e)] }
    redraw([...ops, drawing.current])
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const op = drawing.current
    if (!op || op.kind !== 'stroke') return
    // Coalesced events keep fast stylus strokes smooth.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const r = e.currentTarget.getBoundingClientRect()
    for (const ev of events) op.points.push({ x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.width })
    redraw([...ops, op])
  }
  const onPointerUp = () => {
    const op = drawing.current
    drawing.current = null
    if (op) setOps((list) => [...list, op])
  }

  return (
    <div className="grid gap-2" data-testid="work-pad">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Drawing tools">
        <Button
          type="button" size="sm" className="px-2.5" variant={tool === 'pen' ? 'secondary' : 'ghost'} aria-pressed={tool === 'pen'}
          onClick={() => setTool('pen')} disabled={disabled} data-testid="work-pen"
        >
          <Pen aria-hidden /> Pen
        </Button>
        <Button
          type="button" size="sm" className="px-2.5" variant={tool === 'eraser' ? 'secondary' : 'ghost'} aria-pressed={tool === 'eraser'}
          onClick={() => setTool('eraser')} disabled={disabled} data-testid="work-eraser"
        >
          <Eraser aria-hidden /> Eraser
        </Button>
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
      </div>
      <div ref={wrapRef} className="paper-grid overflow-hidden rounded-xl border border-input">
        <canvas
          ref={canvasRef}
          data-testid="work-canvas"
          aria-label="Working area. Draw your steps with a finger, stylus or mouse."
          role="img"
          className={`block w-full touch-none ${disabled ? 'cursor-not-allowed opacity-60' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
          style={{ height: width ? Math.round(width * ASPECT) : undefined, aspectRatio: width ? undefined : `${1 / ASPECT}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
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
