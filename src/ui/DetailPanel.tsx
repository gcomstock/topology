import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { clockToMs } from '../lib/timeseries'
import { tierLabel, tierMeaning } from '../scene/nodeShape'
import { fmtAgo, fmtDateTime } from './format'
import { NodeHero } from './NodeHero'
import { GoldenSignals } from './GoldenSignals'
import { InfraSummary } from './InfraSummary'
import { ServiceDiagram } from './ServiceDiagram'

function Section({ title, empty, children }: { title: string; empty?: boolean; children?: ReactNode }) {
  return (
    <div className={'section' + (empty ? ' empty' : '')}>
      <div className="sh">{title}</div>
      {empty ? <div className="none">none</div> : children}
    </div>
  )
}

const EVENT_ICON: Record<string, string> = { deploy: '▲', config: '◆', scale: '⇅', incident: '✶' }
const SEV_COLOR: Record<string, string> = { SEV1: '#f85149', SEV2: '#f85149', SEV3: '#d29922', SEV4: '#58a6ff' }

export function DetailPanel() {
  const data = useStore((s) => s.data)!
  const selectedId = useStore((s) => s.selectedId)!
  const select = useStore((s) => s.select)
  const clock = useStore((s) => s.clock)
  const tsMs = useStore((s) => s.tsMs)
  const graph = useStore((s) => s.graph)!
  const priorityList = useStore((s) => s.priorityList)
  const blastSet = useStore((s) => s.blastSet)
  const positions = useStore((s) => s.positions)
  const openDiagram = useStore((s) => s.openDiagram)
  const startCompare = useStore((s) => s.startCompare)
  const theme = useTheme()

  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [multicol, setMulticol] = useState(false)

  const svc = data.topology.services.find((s) => s.id === selectedId)
  const nowMs = clockToMs(clock, tsMs)

  // Responsive: multi-column when wide.
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setMulticol(entries[0].contentRect.width > 600)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keyboard nav — re-targets in place, but traversal is LIMITED to the active
  // topology (the highlighted set). ↑/↓ walk it by priority; ←/→ walk it
  // left→right by position. Never traps the user.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!selectedId) return
      if (e.key === 'Escape') {
        select(null)
        return
      }
      // The active set is the highlighted topology (selected + its blast set).
      const active = blastSet.size ? [...blastSet] : [selectedId]
      const cycle = (order: string[], dir: 1 | -1) => {
        if (order.length < 2) return
        const i = order.indexOf(selectedId)
        if (i < 0) return
        e.preventDefault()
        select(order[(i + dir + order.length) % order.length])
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const byPriority = priorityList.map((p) => p.serviceId).filter((id) => active.includes(id))
        cycle(byPriority, e.key === 'ArrowDown' ? 1 : -1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const byX = [...active].sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))
        cycle(byX, e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, priorityList, blastSet, positions, select])

  // Reset scroll on retarget.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [selectedId])

  if (!svc) return null
  const series = data.timeseries.perService[svc.id]

  // Events for this service (what-changed): show those at-or-before now, recent first.
  const svcEvents = data.events.events
    .filter((e) => e.serviceId === svc.id && Date.parse(e.timestamp) <= nowMs + 1)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

  const activeInc = data.incidents.active.filter(
    (i) => i.serviceId === svc.id || i.impactedServices?.includes(svc.id),
  )
  const resolvedInc = data.incidents.resolved.filter(
    (i) => i.serviceId === svc.id || i.impactedServices?.includes(svc.id),
  )

  const callees = graph.downstream[svc.id] ?? []
  const byId = Object.fromEntries(data.topology.services.map((s) => [s.id, s]))

  const LIFE_COLOR: Record<string, string> = {
    active: theme.healthGood,
    maintenance: theme.warning,
    deprecated: theme.textMuted,
  }
  const lifeChip = (
    <span
      className="chip"
      style={{ color: LIFE_COLOR[svc.lifecycle] ?? theme.textMuted, borderColor: LIFE_COLOR[svc.lifecycle] ?? theme.border }}
    >
      {svc.lifecycle}
    </span>
  )

  // ←/→ walk the active topology left→right by position.
  const stepSpatial = (dir: 1 | -1) => {
    const active = blastSet.size ? [...blastSet] : [svc.id]
    const order = active.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))
    const i = order.indexOf(svc.id)
    if (order.length > 1 && i >= 0) select(order[(i + dir + order.length) % order.length])
  }

  return (
    <div className={'panel' + (multicol ? ' multicol' : '')} ref={panelRef}>
      <div className="phd">
        <span className="title">{svc.name}</span>
        <span className="tier-pill" title={`tier ${tierLabel(svc.tier)} · ${tierMeaning(svc.tier)}`}>
          {tierLabel(svc.tier)}
        </span>
        {lifeChip}
        <span className="subtle" style={{ fontSize: 11 }}>{svc.team}</span>
        <div style={{ flex: 1 }} />
        <button onClick={startCompare} title="Compare with others">compare</button>
        <div className="nav">
          <button title="Prev in active topology (←)" onClick={() => stepSpatial(-1)}>←</button>
          <button title="Next in active topology (→)" onClick={() => stepSpatial(1)}>→</button>
        </div>
        <button className="x" onClick={() => select(null)} title="Close (Esc)">✕</button>
      </div>

      <div className="body" ref={bodyRef}>
        {/* 0. This node — visual copy + traffic + why-the-color */}
        <Section title="this service">
          <NodeHero service={svc} />
        </Section>

        {/* 1. Golden signals (SLO burn first) */}
        <Section title="golden signals">
          {series ? <GoldenSignals series={series} /> : <div className="none">no telemetry</div>}
        </Section>

        {/* 2. What changed recently */}
        <Section title="what changed recently" empty={svcEvents.length === 0}>
          {svcEvents.map((e) => (
            <div className="change-row" key={e.id}>
              <div className="ic">{EVENT_ICON[e.type]}</div>
              <div className="meta">
                <div className="t">{e.title} {e.version && <span className="subtle">{e.version}</span>}</div>
                <div className="d">{e.detail} · {e.author}</div>
              </div>
              <div className="when">{fmtAgo(Date.parse(e.timestamp), nowMs)}</div>
            </div>
          ))}
        </Section>

        {/* 3. Active incidents */}
        <Section title="active incidents" empty={activeInc.length === 0}>
          {activeInc.map((i) => (
            <div className="inc-row active" key={i.id}>
              <div className="top">
                <span className="sev" style={{ background: SEV_COLOR[i.severity] ?? '#444', color: '#0a0e14' }}>{i.severity}</span>
                <span className="id">{i.id}</span>
                <span className="subtle">{i.status}</span>
              </div>
              <div className="ttl">{i.title}</div>
              <div className="sm">{i.summary}</div>
            </div>
          ))}
        </Section>

        {/* 4. Infrastructure summary */}
        <Section title="infrastructure">
          <InfraSummary service={svc} />
        </Section>

        {/* 5. Inferred service diagram */}
        <Section title="inferred service diagram">
          <div className="diagram-thumb" onClick={openDiagram} title="Click to expand">
            <ServiceDiagram service={svc} width="100%" height="100%" />
            <span className="expand-hint">⤢ expand</span>
          </div>
        </Section>

        {/* 6. Resolved / previous incidents */}
        <Section title="resolved incidents" empty={resolvedInc.length === 0}>
          {resolvedInc.map((i) => (
            <div className="inc-row" key={i.id}>
              <div className="top">
                <span className="sev" style={{ background: SEV_COLOR[i.severity] ?? '#444', color: '#0a0e14' }}>{i.severity}</span>
                <span className="id">{i.id}</span>
                <span className="subtle">resolved</span>
              </div>
              <div className="ttl">{i.title}</div>
              <div className="sm">{i.summary}</div>
            </div>
          ))}
        </Section>

        {/* 7. Ownership & contacts — clean two-column */}
        <Section title="ownership & contacts">
          <div className="kv">
            <div className="k">team</div><div className="v">{svc.team}</div>
            <div className="k">tier</div><div className="v">{tierLabel(svc.tier)} · {tierMeaning(svc.tier)}</div>
            <div className="k">lifecycle</div><div className="v"><div className="chips">{lifeChip}</div></div>
            <div className="k">owner</div><div className="v">{svc.owner.name} · {svc.owner.contact}</div>
            <div className="k">on-call</div><div className="v">{svc.onCall.name} · {svc.onCall.contact}</div>
          </div>
        </Section>

        {/* dependencies & infra — chips live in the value column */}
        <Section title="dependencies & infra">
          <div className="kv">
            <div className="k">regions</div>
            <div className="v"><div className="chips">{svc.regions.map((r) => <span className="chip" key={r}>{r}</span>)}</div></div>
            <div className="k">datastores</div>
            <div className="v">
              <div className="chips">
                {svc.datastores.length ? svc.datastores.map((d) => <span className="chip" key={d}>{d}</span>) : <span className="none">none</span>}
              </div>
            </div>
            <div className="k">calls</div>
            <div className="v">
              <div className="chips">
                {callees.length ? callees.map((d) => (
                  <span className="chip" key={d} style={{ cursor: 'pointer' }} onClick={() => select(d)}>
                    {byId[d]?.name ?? d}
                  </span>
                )) : <span className="none">none</span>}
              </div>
            </div>
            <div className="k">in-degree</div><div className="v">{svc.inDegree} callers</div>
          </div>
        </Section>

        {/* 8. Operational links */}
        <Section title="operational links">
          <div className="links-row">
            <a href={svc.links.runbook} target="_blank" rel="noreferrer">runbook ↗</a>
            <a href={svc.links.dashboard} target="_blank" rel="noreferrer">dashboard ↗</a>
            <a href={svc.links.repo} target="_blank" rel="noreferrer">repo ↗</a>
            <a href={svc.links.docs} target="_blank" rel="noreferrer">docs ↗</a>
          </div>
        </Section>

        {/* SLOs */}
        <Section title="SLOs" empty={svc.slos.length === 0}>
          <div className="kv">
            {svc.slos.map((s) => (
              <div style={{ display: 'contents' }} key={s.id}>
                <div className="k">{s.type}</div>
                <div className="v">{s.target}% / {s.window}{s.thresholdMs ? ` · ${s.thresholdMs}ms` : ''}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* about — long-form, sans-serif, always shown (calm read at the bottom) */}
        <Section title="about this service">
          <p className="about">{svc.about}</p>
        </Section>

        <div className="faint" style={{ fontSize: 10, marginTop: 8 }}>
          showing data for {fmtDateTime(nowMs)} · ← → ↑ ↓ walk the active topology · esc to exit
        </div>
      </div>
    </div>
  )
}
