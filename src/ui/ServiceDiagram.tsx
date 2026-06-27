import { useStore } from '../store'
import { useTheme } from '../hooks'
import { healthColorHex } from '../lib/color'
import { sampleAt } from '../lib/timeseries'
import type { Service } from '../types'

interface Props {
  service: Service
  width: number
  height: number
  interactive?: boolean
}

// Boundary-level diagram generated from the (dummy) telemetry: the service, its
// real inputs (callers) and outputs (callees) from edge data, plus datastores.
// Legible at 280×280; identical behavior at modal size (conditional legibility,
// not conditional layout).
export function ServiceDiagram({ service, width, height, interactive }: Props) {
  const theme = useTheme()
  const data = useStore((s) => s.data)!
  const clock = useStore((s) => s.clock)
  const graph = useStore((s) => s.graph)!
  const selectedEdgeId = useStore((s) => s.selectedEdgeId)
  const setSelectedEdge = useStore((s) => s.setSelectedEdge)

  const byId = Object.fromEntries(data.topology.services.map((s) => [s.id, s]))
  const callers = (graph.upstream[service.id] ?? []).slice(0, 6)
  const callees = (graph.downstream[service.id] ?? []).slice(0, 6)

  const vb = 280
  const cx = vb / 2
  const cy = vb / 2
  const inX = 30
  const outX = vb - 30

  const edgeId = (src: string, tgt: string) => graph.edgeBySrcTgt[`${src}->${tgt}`]
  const edgeHealth = (id?: string) =>
    id ? sampleAt(data.timeseries.perEdge[id]?.health, clock) : 1

  const slot = (i: number, count: number) => {
    if (count <= 1) return cy
    return 50 + (i / (count - 1)) * (vb - 100)
  }

  const node = (id: string, x: number, y: number, key: string, eid?: string) => {
    const svc = byId[id]
    const sel = eid && eid === selectedEdgeId
    return (
      <g
        key={key}
        style={{ cursor: interactive && eid ? 'pointer' : 'default' }}
        onClick={interactive && eid ? () => setSelectedEdge(eid) : undefined}
      >
        <rect
          x={x - 38}
          y={y - 11}
          width={76}
          height={22}
          rx={4}
          fill={theme.bgElevated2}
          stroke={sel ? theme.accent : theme.border}
        />
        <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fill={theme.textPrimary} fontFamily="var(--mono)">
          {svc?.name?.slice(0, 13) ?? id}
        </text>
      </g>
    )
  }

  const link = (x1: number, y1: number, x2: number, y2: number, eid: string | undefined, key: string) => {
    const h = edgeHealth(eid)
    const sel = eid && eid === selectedEdgeId
    const fb = eid ? data.topology.edges.find((e) => e.id === eid)?.failureBehavior : null
    return (
      <g key={key}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={healthColorHex(h, theme)}
          strokeWidth={sel ? 2.4 : 1.4}
          opacity={0.85}
          style={{ cursor: interactive && eid ? 'pointer' : 'default' }}
          onClick={interactive && eid ? () => setSelectedEdge(eid) : undefined}
        />
        {fb && <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={3} fill={theme.accent} />}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${vb} ${vb}`} width={width} height={height}>
      <rect x={0} y={0} width={vb} height={vb} fill={theme.bgElevated} />
      {/* labels */}
      <text x={inX} y={20} fontSize={8} fill={theme.textMuted} fontFamily="var(--mono)">
        inputs ›
      </text>
      <text x={outX} y={20} textAnchor="end" fontSize={8} fill={theme.textMuted} fontFamily="var(--mono)">
        › outputs
      </text>

      {/* links first (behind) */}
      {callers.map((c, i) => {
        const y = slot(i, callers.length)
        return link(inX + 38, y, cx - 44, cy, edgeId(c, service.id), 'l-in-' + c)
      })}
      {callees.map((c, i) => {
        const y = slot(i, callees.length)
        return link(cx + 44, cy, outX - 38, y, edgeId(service.id, c), 'l-out-' + c)
      })}

      {/* center service */}
      <rect
        x={cx - 44}
        y={cy - 16}
        width={88}
        height={32}
        rx={5}
        fill={theme.bgElevated2}
        stroke={theme.accent}
        strokeWidth={1.5}
      />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill={theme.accent} fontFamily="var(--mono)">
        {service.name.slice(0, 14)}
      </text>

      {/* boundary nodes */}
      {callers.map((c, i) => node(c, inX, slot(i, callers.length), 'in-' + c, edgeId(c, service.id)))}
      {callees.map((c, i) => node(c, outX, slot(i, callees.length), 'out-' + c, edgeId(service.id, c)))}

      {/* datastores along the bottom */}
      {service.datastores.slice(0, 5).map((ds, i) => {
        const n = Math.min(5, service.datastores.length)
        const x = cx + (i - (n - 1) / 2) * 52
        return (
          <g key={'ds-' + ds}>
            <line x1={cx} y1={cy + 16} x2={x} y2={vb - 22} stroke={theme.border} strokeWidth={1} strokeDasharray="2 2" />
            <rect x={x - 22} y={vb - 32} width={44} height={16} rx={8} fill={theme.bgElevated2} stroke={theme.border} />
            <text x={x} y={vb - 21} textAnchor="middle" fontSize={7.5} fill={theme.textMuted} fontFamily="var(--mono)">
              {ds.slice(0, 9)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
