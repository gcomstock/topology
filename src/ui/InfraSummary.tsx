import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColorHex } from '../lib/color'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import type { Service } from '../types'

// Infrastructure summary — isometric cubes = containers/replicas, colored by
// health (gray = no data) for magnitude + health at a glance, plus per-region
// breakdown (spec §6.4).
export function InfraSummary({ service }: { service: Service }) {
  const theme = useTheme()
  const data = useStore((s) => s.data)!
  const clock = useStore((s) => s.clock)

  const series = data.timeseries.perService[service.id]
  const health = sampleAt(series?.health, clock)
  const sampleCount = series ? series.sampleCount[nearestIndex(clock, series.sampleCount.length)] : 1
  const hasData = sampleCount > 0
  const sat = sampleAt(series?.golden.saturation, clock)

  const regions = Object.entries(service.replicas)
  const total = regions.reduce((a, [, n]) => a + n, 0)
  const maxR = Math.max(1, ...regions.map(([, n]) => n))

  // Distribute "burning" replicas roughly by (1-health) for the cube coloring.
  const cubeColor = (idx: number, count: number) => {
    if (!hasData) return theme.nodata
    const badFrac = 1 - health
    const badCount = Math.round(badFrac * count)
    return idx < badCount ? healthColorHex(0.2, theme) : healthColorHex(0.95, theme)
  }

  return (
    <div>
      <div className="infra">
        <div className="region-block">
          <div className="rlbl">{total} replicas · {(sat * 100).toFixed(0)}% saturation</div>
          <div className="cubes">
            {regions.flatMap(([region, n]) =>
              Array.from({ length: n }).map((_, i) => (
                <div
                  key={region + i}
                  className="cube"
                  style={{ background: cubeColor(i, n) }}
                  title={region}
                />
              )),
            )}
          </div>
        </div>
      </div>

      <div className="region-bars" style={{ marginTop: 12 }}>
        {regions.map(([region, n]) => (
          <div className="region-bar" key={region}>
            <div className="nm">{region}</div>
            <div className="track">
              <div
                className="fl"
                style={{ width: `${(n / maxR) * 100}%`, background: healthColorHex(health, theme) }}
              />
            </div>
            <div className="ct">{n}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
