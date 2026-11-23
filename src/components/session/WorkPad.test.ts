import { describe, expect, it } from 'vitest'
import { clampView, exportHeight, grownPage, MAX_PAGE_H, zoomAround } from './WorkPad'

const A = 0.75 // the inline pad's shape

describe('pad view maths', () => {
  it('keeps the visible window on the page', () => {
    expect(clampView({ zoom: 2, x: 0.9, y: -1 }, A, A)).toEqual({ zoom: 2, x: 0.5, y: 0 })
    expect(clampView({ zoom: 9, x: 0, y: 0 }, A, A).zoom).toBe(4)
  })

  it('centres a page narrower than the window when zoomed out, top-aligned', () => {
    expect(clampView({ zoom: 0.5, x: 0.3, y: 0.3 }, A, 1.5)).toEqual({ zoom: 0.5, x: -0.5, y: 0 })
  })

  it('lets a tall page scroll at 100%', () => {
    expect(clampView({ zoom: 1, x: 0, y: 0.5 }, A, 1.5)).toEqual({ zoom: 1, x: 0, y: 0.5 })
    expect(clampView({ zoom: 1, x: 0, y: 5 }, A, 1.5).y).toBeCloseTo(0.75) // bottom of the page
  })

  it('zooms around a point, keeping it under the cursor', () => {
    const v = zoomAround({ zoom: 1, x: 0, y: 0 }, 2, 0.5, 0.375, A, A)
    expect(v).toEqual({ zoom: 2, x: 0.25, y: 0.1875 })
    expect(v.x + 0.5 / v.zoom).toBeCloseTo(0.5)
  })

  it('zooming out grows the page so there is paper to write on, up to a limit', () => {
    expect(grownPage(A, 1, A)).toBe(A)
    expect(grownPage(A, 0.5, A)).toBe(1.5)
    expect(grownPage(A, 0.5, 2)).toBe(MAX_PAGE_H) // a tall full-screen window
  })

  it('exports only as much of the page as the ink uses', () => {
    expect(exportHeight(0.3, 3)).toBe(0.75) // never shorter than 4:3
    expect(exportHeight(1.2, 3)).toBe(1.375)
    expect(exportHeight(2.99, 3)).toBe(3)
  })
})
