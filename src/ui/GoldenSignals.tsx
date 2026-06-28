import { useMemo } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { sampleAt } from '../lib/timeseries'
import { Sparkline } from './Sparkline'
import { fmtNum } from './format'
import type { ServiceSeries } from '../types'

function Signal({
  label,
  value,
  unit,
  series,
  clock,
  color,
}: {
  label: string
  value: string
  unit?: string
  series: number[]
  clock: number
  color: string
}) {
  return (
    <div className="signal">
      <div className="lbl">{label}</div>
      <div className="val">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <Sparkline data={series} cursor={clock} color={color} fill width={150} height={26} />
    </div>
  )
}

// Golden signals — top, prominent, current values loud (spec §6.1).
export function GoldenSignals({ series }: { series: ServiceSeries }) {
  const clock = useStore((s) => s.clock)
  const theme = useTheme()
  const g = series.golden

  // Aggregate SLO burn rate = max burn across the service's SLOs (fallback to
  // the acute burn). Shown first — it's the budget-consumption signal.
  const sloBurn = useMemo(() => {
    const slos = Object.values(series.perSlo)
    if (!slos.length) return series.burnFast
    const n = slos[0].length
    const out = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (const s of slos) out[i] = Math.max(out[i], s[i] ?? 0)
    return out
  }, [series])

  return (
    <div className="signals-grid">
      <Signal label="SLO burn rate" value={`${sampleAt(sloBurn, clock).toFixed(1)}×`} series={sloBurn} clock={clock} color={theme.healthBad} />
      <Signal label="latency p50" value={fmtNum(sampleAt(g.latencyP50, clock), 0)} unit="ms" series={g.latencyP50} clock={clock} color={theme.accent} />
      <Signal label="latency p99" value={fmtNum(sampleAt(g.latencyP99, clock), 0)} unit="ms" series={g.latencyP99} clock={clock} color={theme.accentBlue} />
      <Signal label="traffic" value={fmtNum(sampleAt(g.traffic, clock), 0)} unit="rps" series={g.traffic} clock={clock} color={theme.accent} />
      <Signal
        label="error rate"
        value={(sampleAt(g.errorRate, clock) * 100).toFixed(2)}
        unit="%"
        series={g.errorRate}
        clock={clock}
        color={theme.healthBad}
      />
      <Signal
        label="saturation"
        value={(sampleAt(g.saturation, clock) * 100).toFixed(0)}
        unit="%"
        series={g.saturation}
        clock={clock}
        color={theme.warning}
      />
    </div>
  )
}
