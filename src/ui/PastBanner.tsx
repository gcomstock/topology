import { useStore } from '../store'
import { clockToMs } from '../lib/timeseries'
import { fmtDateTime } from './format'

// "You are in the past" — prominent banner with one-click Return to live.
export function PastBanner() {
  const live = useStore((s) => s.live)
  const clock = useStore((s) => s.clock)
  const tsMs = useStore((s) => s.tsMs)
  const goLive = useStore((s) => s.goLive)
  if (live) return null
  const nowMs = clockToMs(clock, tsMs)
  return (
    <div className="past-banner">
      <span>⏸ Viewing the past — {fmtDateTime(nowMs)}</span>
      <button onClick={goLive}>Return to live</button>
    </div>
  )
}
