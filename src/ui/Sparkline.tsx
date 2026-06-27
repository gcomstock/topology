interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
  cursor?: number // fractional index to mark the current clock
  fill?: boolean
}

// Tiny inline sparkline for golden-signal trends.
export function Sparkline({ data, width = 120, height = 28, color = 'var(--accent)', cursor, fill }: Props) {
  if (!data || data.length === 0) return null
  const n = data.length
  let min = Infinity
  let max = -Infinity
  for (const v of data) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (max - min < 1e-9) max = min + 1
  const x = (i: number) => (i / (n - 1)) * width
  const y = (v: number) => height - ((v - min) / (max - min)) * (height - 2) - 1
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const areaPts = `0,${height} ${pts} ${width},${height}`

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {fill && <polygon points={areaPts} fill={color} opacity={0.12} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.3} />
      {cursor != null && (
        <line
          x1={x(Math.max(0, Math.min(n - 1, cursor)))}
          x2={x(Math.max(0, Math.min(n - 1, cursor)))}
          y1={0}
          y2={height}
          stroke="var(--text-faint)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}
    </svg>
  )
}
