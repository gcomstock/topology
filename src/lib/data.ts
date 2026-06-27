import type { AppData } from '../types'

// Runtime fetch of the swappable dummy data. Never imported into the bundle.
// Resolved relative to Vite's base URL so it works on GitHub Pages subpaths.
export async function loadData(): Promise<AppData> {
  const base = import.meta.env.BASE_URL // e.g. "/" in dev, "/topology/" in prod
  const url = (f: string) => `${base}data/${f}`.replace(/\/{2,}/g, '/')

  const [topology, timeseries, events, incidents] = await Promise.all([
    fetch(url('topology.json')).then((r) => r.json()),
    fetch(url('timeseries.json')).then((r) => r.json()),
    fetch(url('events.json')).then((r) => r.json()),
    fetch(url('incidents.json')).then((r) => r.json()),
  ])

  return { topology, timeseries, events, incidents }
}
