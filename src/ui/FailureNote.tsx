import type { Edge } from '../types'

// Human-authored failure-behavior note, inline on the edge — visibly marked as
// human-authored vs measured. Empty state shows a dormant "+ add" affordance
// that is non-functional in v1 (signals the future capture flow).
export function FailureNote({ edge }: { edge: Edge }) {
  const fb = edge.failureBehavior
  if (fb) {
    return (
      <div className="failure-note authored">
        <span className="tag">human</span>
        Failure behavior: {fb.note} — {fb.author}, {fb.incidentRef}
      </div>
    )
  }
  return (
    <div className="failure-note empty">
      <span>Failure behavior: not yet documented</span>
      <span className="add" title="Capture flow not implemented in this prototype">
        + add
      </span>
    </div>
  )
}
