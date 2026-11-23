import { describe, expect, it } from 'vitest'
import { clampView, zoomAround } from './WorkPad'

describe('pad zoom maths', () => {
  it('keeps the visible window inside the page', () => {
    expect(clampView({ zoom: 2, x: 0.9, y: -1 })).toEqual({ zoom: 2, x: 0.5, y: 0 })
    expect(clampView({ zoom: 9, x: 0, y: 0 }).zoom).toBe(4)
    expect(clampView({ zoom: 0.5, x: 0.3, y: 0.3 })).toEqual({ zoom: 1, x: 0, y: 0 })
  })

  it('zooms around a point, keeping it under the cursor', () => {
    const v = zoomAround({ zoom: 1, x: 0, y: 0 }, 2, 0.5, 0.375)
    expect(v).toEqual({ zoom: 2, x: 0.25, y: 0.1875 })
    // The page point under the cursor is unchanged: x + sx / zoom.
    expect(v.x + 0.5 / v.zoom).toBeCloseTo(0.5)
    expect(v.y + 0.375 / v.zoom).toBeCloseTo(0.375)
  })

  it('zooming out to 100% shows the whole page again', () => {
    expect(zoomAround({ zoom: 3, x: 0.4, y: 0.3 }, 1, 0.2, 0.2)).toEqual({ zoom: 1, x: 0, y: 0 })
  })
})
