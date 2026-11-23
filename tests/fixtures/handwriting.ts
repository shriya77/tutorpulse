/**
 * A tiny single-stroke "handwriting" font for the demo video, so Maya can
 * write her working on the real sketch pad with pointer strokes, the way a
 * finger would. Only the glyphs the demo needs. Coordinates are in em:
 * x from the glyph's left edge, y from the top (x-height starts at 0.45,
 * baseline at 1).
 */
type Pt = [number, number]
type Glyph = { advance: number; strokes: Pt[][] }

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 14): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 - (i / n) * Math.PI * 2 + 0.6
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

const GLYPHS: Record<string, Glyph> = {
  s: { advance: 0.5, strokes: [[[0.45, 0.52], [0.3, 0.45], [0.13, 0.49], [0.1, 0.61], [0.25, 0.71], [0.4, 0.79], [0.45, 0.9], [0.35, 0.99], [0.15, 1], [0.04, 0.94]]] },
  i: { advance: 0.3, strokes: [[[0.15, 0.45], [0.15, 1]], [[0.15, 0.26], [0.16, 0.28]]] },
  n: { advance: 0.55, strokes: [[[0.08, 0.45], [0.08, 1]], [[0.08, 0.62], [0.2, 0.48], [0.35, 0.45], [0.45, 0.55], [0.46, 1]]] },
  c: { advance: 0.5, strokes: [[[0.45, 0.52], [0.3, 0.45], [0.12, 0.5], [0.05, 0.72], [0.12, 0.93], [0.3, 1], [0.45, 0.95]]] },
  o: { advance: 0.52, strokes: [ellipse(0.25, 0.725, 0.2, 0.275)] },
  x: { advance: 0.5, strokes: [[[0.05, 0.45], [0.45, 1]], [[0.45, 0.45], [0.05, 1]]] },
  '(': { advance: 0.35, strokes: [[[0.3, 0.1], [0.15, 0.35], [0.12, 0.6], [0.17, 0.9], [0.3, 1.15]]] },
  ')': { advance: 0.35, strokes: [[[0.05, 0.1], [0.2, 0.35], [0.23, 0.6], [0.18, 0.9], [0.05, 1.15]]] },
  '3': { advance: 0.5, strokes: [[[0.05, 0.15], [0.2, 0.05], [0.38, 0.1], [0.4, 0.28], [0.2, 0.45], [0.4, 0.55], [0.45, 0.78], [0.35, 0.97], [0.15, 1], [0.03, 0.92]]] },
  '6': { advance: 0.5, strokes: [[[0.4, 0.06], [0.2, 0.25], [0.08, 0.55], [0.1, 0.85], [0.25, 1], [0.4, 0.95], [0.45, 0.78], [0.35, 0.62], [0.18, 0.62], [0.08, 0.75]]] },
  '²': { advance: 0.42, strokes: [[[0.09, 0.12], [0.17, 0.03], [0.29, 0.04], [0.33, 0.14], [0.25, 0.26], [0.09, 0.42], [0.36, 0.42]]] },
  '=': { advance: 0.55, strokes: [[[0.05, 0.62], [0.45, 0.62]], [[0.05, 0.82], [0.45, 0.82]]] },
  ' ': { advance: 0.3, strokes: [] },
}

/**
 * Strokes for one line of text, in the pad's normalised coordinates
 * (0..1 of its width and height). `em` is the glyph size as a fraction of
 * the pad's width; `aspect` is height / width. A little deterministic wobble
 * keeps it from looking typeset.
 */
export function handwrittenLine(text: string, left: number, top: number, em: number, aspect: number, seed = 1): Pt[][] {
  const out: Pt[][] = []
  let x = left
  let n = seed
  const wobble = () => {
    n = (n * 9301 + 49297) % 233280
    return (n / 233280 - 0.5) * 0.05
  }
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) throw new Error(`No handwriting glyph for "${ch}"`)
    for (const s of g.strokes) out.push(s.map(([gx, gy]) => [x + (gx + wobble()) * em, (top + (gy + wobble()) * em) / aspect]))
    x += g.advance * em
  }
  return out
}
