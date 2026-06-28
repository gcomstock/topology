import { useMemo } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColorHex } from '../lib/color'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import { trafficToHeight } from '../lib/traffic'
import { fmtNum } from './format'
import type { Service } from '../types'

// Explains the node itself: a visual copy of its topology bar (fill = current
// traffic, cage = expected) colored by health, plus avg/current traffic and why
// the color is what it is (the SLO/health read).
export function NodeHero({ service }: { service: Service }) {
  const theme = useTheme()
  const data = useStore((s) => s.data)!
  const clock = useStore((s) => s.clock)
  const domain = useStore((s) => s.trafficDomain)

  const priorityList = useStore((s) => s.priorityList)
  const priIdx = priorityList.findIndex((p) => p.serviceId === service.id)
  const priority = priIdx >= 0 ? priorityList[priIdx] : null

  const series = data.timeseries.perService[service.id]
  const health = sampleAt(series?.health, clock)
  const current = sampleAt(series?.golden.traffic, clock)
  const expected = service.expectedTraffic
  const sampleCount = series ? series.sampleCount[nearestIndex(clock, series.sampleCount.length)] : 1
  const hasData = sampleCount > 15

  const sloBurn = useMemo(() => {
    const slos = Object.values(series?.perSlo ?? {})
    if (!slos.length) return sampleAt(series?.burnFast, clock)
    let m = 0
    for (const s of slos) m = Math.max(m, sampleAt(s, clock))
    return m
  }, [series, clock])

  // Bar geometry mirrors the 3D (log scale), mapped to pixels.
  const PX = 30
  const fillPx = Math.max(4, trafficToHeight(current, domain) * PX)
  const cagePx = Math.max(4, trafficToHeight(expected, domain) * PX)
  const boxH = Math.max(fillPx, cagePx) + 8
  const color = hasData ? healthColorHex(health, theme) : theme.nodata

  const state = !hasData
    ? 'no data'
    : health > 0.85
    ? 'healthy'
    : health > 0.5
    ? 'degraded'
    : 'critical'

  const delta = expected > 0 ? current / expected : 1
  const trafficNote =
    delta > 1.4 ? `${delta.toFixed(1)}× above expected` : delta < 0.7 ? `${delta.toFixed(1)}× below expected` : 'near expected'

  return (
    <div className="node-hero">
      <div className="node-hero-viz" style={{ height: boxH }}>
        {/* cage = expected */}
        <div className="nh-cage" style={{ height: cagePx }} />
        {/* fill = current, colored by health */}
        <div className="nh-fill" style={{ height: fillPx, background: color }} />
      </div>
      <div className="node-hero-info">
        <div className="nh-row">
          <span className="nh-state" style={{ color }}>
            ● {state}
          </span>
          <span className="subtle">
            {hasData ? `health ${(health * 100).toFixed(0)}%` : 'low sample'}
          </span>
        </div>
        <div className="nh-traffic">
          <div>
            <div className="nh-big">{fmtNum(current, 0)}<span className="unit">rps</span></div>
            <div className="nh-lbl">current traffic · {trafficNote}</div>
          </div>
          <div>
            <div className="nh-big subtle">{fmtNum(expected, 0)}<span className="unit">rps</span></div>
            <div className="nh-lbl">avg (expected)</div>
          </div>
        </div>
        <div className="nh-why">
          Color = aggregate SLO health.{' '}
          {hasData ? (
            sloBurn > 0.5 ? (
              <>Burning error budget at <b style={{ color }}>{sloBurn.toFixed(1)}×</b> → {state}.</>
            ) : (
              <>SLOs within budget → healthy.</>
            )
          ) : (
            <>Too few samples to trust — rendered gray.</>
          )}
        </div>

        {priority && (
          <div className="nh-priority">
            <div className="nh-pri-score">{priority.score.toFixed(1)}</div>
            <div className="nh-pri-text">
              <div className="nh-pri-lbl">
                priority score · rank #{priIdx + 1} of {priorityList.length}
              </div>
              <div className="nh-pri-explain">
                criticality × acute burn rate × blast radius — where to look first during an incident
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
