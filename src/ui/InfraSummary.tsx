import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { sampleAt, nearestIndex } from '../lib/timeseries'
import { instancesFor, fmtUptime, type Instance, type InstanceStatus } from '../lib/instances'
import type { Service } from '../types'

// Infrastructure — instances grouped by region. Each square is a discrete,
// clickable instance (doubling as the magnitude infographic); clicking shows its
// id / uptime / version / status. Status colors come from the health palette so
// they match the topology viz.
export function InfraSummary({ service }: { service: Service }) {
  const theme = useTheme()
  const data = useStore((s) => s.data)!
  const clock = useStore((s) => s.clock)
  const [sel, setSel] = useState<Instance | null>(null)

  const series = data.timeseries.perService[service.id]
  const health = sampleAt(series?.health, clock)
  const sampleCount = series ? series.sampleCount[nearestIndex(clock, series.sampleCount.length)] : 1
  const hasData = sampleCount > 15
  const sat = sampleAt(series?.golden.saturation, clock)

  const statusColor: Record<InstanceStatus, string> = {
    up: theme.healthGood,
    rebooting: theme.warning,
    down: theme.healthBad,
  }

  const regions = useMemo(
    () =>
      Object.entries(service.replicas).map(([region, n]) => ({
        region,
        instances: instancesFor(service.id, region, n, hasData ? health : 1),
      })),
    [service.id, service.replicas, health, hasData],
  )
  const total = regions.reduce((a, r) => a + r.instances.length, 0)

  return (
    <div>
      <div className="inst-hd">
        <span className="subtle">{(sat * 100).toFixed(0)}% saturation</span>
        <span className="inst-total">
          {total} <span className="subtle">instances</span>
        </span>
      </div>

      <div className="inst-regions">
        {regions.map(({ region, instances }) => (
          <div className="inst-region" key={region}>
            <div className="inst-region-nm">{region}</div>
            <div className="inst-cubes">
              {instances.map((inst) => (
                <button
                  key={inst.id}
                  className={'inst-cube' + (sel?.id === inst.id ? ' sel' : '')}
                  style={{ background: hasData ? statusColor[inst.status] : theme.nodata }}
                  title={`${inst.id} · ${inst.status}`}
                  onClick={() => setSel(sel?.id === inst.id ? null : inst)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="inst-detail">
          <div className="inst-detail-hd">
            <span className="inst-dot" style={{ background: statusColor[sel.status] }} />
            <span className="inst-id">{sel.id}</span>
            <span className="inst-status" style={{ color: statusColor[sel.status] }}>
              {sel.status}
            </span>
            <div style={{ flex: 1 }} />
            <span className="inst-x" onClick={() => setSel(null)}>
              ✕
            </span>
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <div className="k">region</div>
            <div className="v">{sel.region}</div>
            <div className="k">uptime</div>
            <div className="v">{sel.status === 'down' ? '—' : fmtUptime(sel.uptimeHours)}</div>
            <div className="k">version</div>
            <div className="v">{sel.version}</div>
            <div className="k">node</div>
            <div className="v">ip-10-{(sel.index * 7 + 11) % 250}-{(sel.index * 13 + 4) % 250}</div>
          </div>
        </div>
      )}
    </div>
  )
}
