/**
 * QR code for the projector: opens /join?code=XXXXXX, which signs the
 * student in (if needed) and joins them. Rendered as plain React SVG from the
 * module matrix — no HTML strings. Always dark-on-white so phones can scan it
 * even in dark mode.
 */

import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

export function joinUrl(code: string, origin = window.location.origin): string {
  return `${origin}/join?code=${encodeURIComponent(code)}`
}

export function JoinQr({ code, size = 168 }: { code: string; size?: number }) {
  const url = joinUrl(code)
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { path: d, count: n }
  }, [url])

  const quiet = 4
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        role="img"
        aria-label={`QR code to join with code ${code.split('').join(' ')}`}
        width={size}
        height={size}
        viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
        shapeRendering="crispEdges"
        className="rounded-md"
        data-testid="join-qr"
      >
        <rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
      <figcaption className="max-w-[12rem] break-all text-center text-xs text-muted-foreground">{url.replace(/^https?:\/\//, '')}</figcaption>
    </figure>
  )
}
