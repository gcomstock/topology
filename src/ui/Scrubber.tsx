import { useStore } from '../store'
import { clockToMs, msToClock } from '../lib/timeseries'
import { fmtDateTime } from './format'
import type { SystemEvent } from '../types'

const TICK_COLOR: Record<SystemEvent['type'], string> = {
  deploy: 'var(--accent-blue)',
  config: 'var(--warning)',
  scale: 'var(--accent)',
  incident: 'var(--health-bad)',
}
const TICK_GLYPH: Record<SystemEvent['type'], string> = {
  deploy: '▲',
  config: '◆',
  scale: '⇅',
  incident: '✶',
}

export function Scrubber() {
  const data = useStore((s) => s.data)
  const clock = useStore((s) => s.clock)
  const lastIndex = useStore((s) => s.lastIndex)
  const live = useStore((s) => s.live)
  const tsMs = useStore((s) => s.tsMs)
  const setClock = useStore((s) => s.setClock)
  const goLive = useStore((s) => s.goLive)
  const selectedId = useStore((s) => s.selectedId)
  const compareMode = useStore((s) => s.compareMode)

  if (!data) return null

  const nowMs = clockToMs(clock, tsMs)
  const pct = (clock / lastIndex) * 100
  const events = data.events.events

  const rightOffset =
    compareMode === 'committed'
      ? 'calc(50% + 12px)'
      : selectedId
      ? 'calc(var(--panel-w) + 12px)'
      : '12px'

  return (
    <div className="scrubber" style={{ right: rightOffset }}>
      <div className="row">
        <div className="clock">
          {live ? (
            <>
              <span className="live">● LIVE</span> <span className="subtle">{fmtDateTime(nowMs)}</span>
            </>
          ) : (
            <>
              <span className="past">⏸ PAST</span> <span>{fmtDateTime(nowMs)}</span>
            </>
          )}
        </div>

        <div className="track-wrap">
          <div className="ticks">
            {events.map((ev) => {
              const c = msToClock(Date.parse(ev.timestamp), tsMs)
              const left = (c / lastIndex) * 100
              return (
                <div
                  key={ev.id}
                  className="tick"
                  style={{ left: `${left}%` }}
                  onClick={() => setClock(c)}
                >
                  <span className="glyph" style={{ color: TICK_COLOR[ev.type] }}>
                    {TICK_GLYPH[ev.type]}
                  </span>
                  <span className="tip">
                    {ev.title} · {fmtDateTime(Date.parse(ev.timestamp)).slice(11)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={lastIndex}
            step={0.05}
            value={clock}
            onChange={(e) => setClock(parseFloat(e.target.value))}
          />
        </div>

        {!live && <button onClick={goLive}>return to live</button>}
      </div>
    </div>
  )
}
