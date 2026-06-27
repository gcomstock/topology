import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { useTheme } from '../hooks'
import { clockToMs } from '../lib/timeseries'
import { fmtAgo, fmtDateTime } from './format'
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
  const openDiagram = useStore((s) => s.openDiagram)
  const startCompare = useStore((s) => s.startCompare)
  const theme = useTheme()

  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [multicol, setMulticol] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

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

  // Keyboard nav — re-targets in place (←/→ traverse dependency graph,
  // ↑/↓ traverse the priority ranking). Never traps the user.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!selectedId) return
      if (e.key === 'ArrowLeft') {
        const up = graph.upstream[selectedId]?.[0]
        if (up) { e.preventDefault(); select(up) }
      } else if (e.key === 'ArrowRight') {
        const down = graph.downstream[selectedId]?.[0]
        if (down) { e.preventDefault(); select(down) }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const order = priorityList.map((p) => p.serviceId)
        const idx = order.indexOf(selectedId)
        if (idx >= 0) {
          e.preventDefault()
          const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
          const wrapped = (next + order.length) % order.length
          select(order[wrapped])
        }
      } else if (e.key === 'Escape') {
        select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, graph, priorityList, select])

  // Reset scroll + about-collapse on retarget.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    setAboutOpen(false)
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

  return (
    <div className={'panel' + (multicol ? ' multicol' : '')} ref={panelRef}>
      <div className="phd">
        <span className="title">{svc.name}</span>
        <span className="tier-pill" title={data.topology.meta.tierLegend[String(svc.tier)]}>
          T{svc.tier}
        </span>
        <span className="life-pill">{svc.lifecycle}</span>
        <span className="subtle" style={{ fontSize: 11 }}>{svc.team}</span>
        <div style={{ flex: 1 }} />
        <button onClick={startCompare} title="Compare with others">compare</button>
        <div className="nav">
          <button title="Prev (↑)" onClick={() => {
            const order = priorityList.map((p) => p.serviceId)
            const idx = order.indexOf(svc.id)
            if (idx >= 0) select(order[(idx - 1 + order.length) % order.length])
          }}>↑</button>
          <button title="Next (↓)" onClick={() => {
            const order = priorityList.map((p) => p.serviceId)
            const idx = order.indexOf(svc.id)
            if (idx >= 0) select(order[(idx + 1) % order.length])
          }}>↓</button>
        </div>
        <button className="x" onClick={() => select(null)} title="Close (Esc)">✕</button>
      </div>

      <div className="body" ref={bodyRef}>
        {/* 1. Golden signals */}
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
            <ServiceDiagram service={svc} width={280} height={280} />
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

        {/* 7. Ownership & contacts */}
        <Section title="ownership & contacts">
          <div className="kv">
            <div className="k">team</div><div className="v">{svc.team}</div>
            <div className="k">tier</div><div className="v">T{svc.tier} · {data.topology.meta.tierLegend[String(svc.tier)]}</div>
            <div className="k">lifecycle</div><div className="v">{svc.lifecycle}</div>
            <div className="k">owner</div><div className="v">{svc.owner.name} · {svc.owner.contact}</div>
            <div className="k">on-call</div><div className="v">{svc.onCall.name} · {svc.onCall.contact}</div>
          </div>
        </Section>

        {/* datastores / regions / dependencies */}
        <Section title="dependencies & infra detail">
          <div className="kv" style={{ marginBottom: 8 }}>
            <div className="k">in-degree</div><div className="v">{svc.inDegree} callers</div>
            <div className="k">depends on</div><div className="v">{callees.length} services</div>
          </div>
          <div className="rlbl subtle" style={{ marginBottom: 3 }}>regions</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {svc.regions.map((r) => <span className="chip" key={r}>{r}</span>)}
          </div>
          <div className="rlbl subtle" style={{ marginBottom: 3 }}>datastores</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {svc.datastores.length ? svc.datastores.map((d) => <span className="chip" key={d}>{d}</span>) : <span className="none">none</span>}
          </div>
          <div className="rlbl subtle" style={{ marginBottom: 3 }}>calls (downstream)</div>
          <div className="chips">
            {callees.length ? callees.map((d) => (
              <span className="chip" key={d} style={{ cursor: 'pointer' }} onClick={() => select(d)}>
                {byId[d]?.name ?? d}
              </span>
            )) : <span className="none">none</span>}
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

        {/* about — long-form, sans-serif, collapsible (calm read) */}
        <Section title="about this service">
          <div className="collapse-hd subtle" onClick={() => setAboutOpen((o) => !o)}>
            {aboutOpen ? '▾ hide' : '▸ read'} narrative
          </div>
          {aboutOpen && <p className="about">{svc.about}</p>}
        </Section>

        <div className="faint" style={{ fontSize: 10, marginTop: 8 }}>
          showing data for {fmtDateTime(nowMs)} · use ← → to walk dependencies, ↑ ↓ to walk priority
        </div>
      </div>
    </div>
  )
}
