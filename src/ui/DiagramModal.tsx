import { useEffect } from 'react'
import { useStore } from '../store'
import { ServiceDiagram } from './ServiceDiagram'
import { FailureNote } from './FailureNote'

export function DiagramModal() {
  const open = useStore((s) => s.diagramOpen)
  const close = useStore((s) => s.closeDiagram)
  const selectedId = useStore((s) => s.selectedId)
  const services = useStore((s) => s.data?.topology.services ?? [])
  const edges = useStore((s) => s.data?.topology.edges ?? [])
  const selectedEdgeId = useStore((s) => s.selectedEdgeId)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open || !selectedId) return null
  const svc = services.find((s) => s.id === selectedId)
  if (!svc) return null
  const edge = edges.find((e) => e.id === selectedEdgeId)

  return (
    <div className="modal-scrim" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhd">
          <strong>{svc.name}</strong>&nbsp;<span className="subtle">— inferred boundary diagram</span>
          <div style={{ flex: 1 }} />
          <button onClick={close}>✕ close</button>
        </div>
        <div className="mbody" style={{ display: 'flex' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <ServiceDiagram service={svc} width={560} height={560} interactive />
          </div>
          <div style={{ width: 300, borderLeft: '1px solid var(--border)', padding: 14, overflow: 'auto' }}>
            {edge ? (
              <>
                <div className="section">
                  <div className="sh">contract</div>
                  <div className="kv">
                    <div className="k">edge</div>
                    <div className="v">{edge.source.replace('svc-', '')} → {edge.target.replace('svc-', '')}</div>
                    {edge.contract.operations.map((op, i) => (
                      <div key={i} style={{ display: 'contents' }}>
                        <div className="k">op</div>
                        <div className="v">{op.name} <span className="subtle">({op.method})</span></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="section">
                  <div className="sh">sampled request</div>
                  <pre style={preStyle}>{JSON.stringify(edge.contract.sampleRequest, null, 2)}</pre>
                  <div className="sh" style={{ marginTop: 8 }}>sampled response</div>
                  <pre style={preStyle}>{JSON.stringify(edge.contract.sampleResponse, null, 2)}</pre>
                </div>
                <FailureNote edge={edge} />
              </>
            ) : (
              <div className="subtle" style={{ fontSize: 11 }}>
                Click an edge or boundary service to inspect its contract, sampled payloads, and human-authored
                failure behavior.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const preStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: 7,
  margin: '4px 0 0',
  overflow: 'auto',
  color: 'var(--text-primary)',
}
