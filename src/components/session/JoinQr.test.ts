import { describe, expect, it } from 'vitest'
import qrcode from 'qrcode-generator'
import { joinUrl } from './JoinQr'

describe('join QR', () => {
  it('links to /join with the code', () => {
    expect(joinUrl('KQ7XMA', 'https://tutorpulse.app.space')).toBe('https://tutorpulse.app.space/join?code=KQ7XMA')
  })
  it('encodes the URL into a scannable matrix', () => {
    const qr = qrcode(0, 'M')
    qr.addData(joinUrl('KQ7XMA', 'https://tutorpulse.app.space'))
    qr.make()
    expect(qr.getModuleCount()).toBeGreaterThanOrEqual(25)
  })
})
