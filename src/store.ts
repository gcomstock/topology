import { create } from 'zustand'
import type { AppData, NodePosition } from './types'
import { themes, type ThemeName, applyThemeToDOM } from './theme'
import { computeLayout, layoutBounds, type LayoutMode } from './lib/layout'
import {
  buildGraphIndex,
  blastRadius,
  computePriority,
  type GraphIndex,
  type PriorityEntry,
} from './lib/graph'
import { timestampsToMs, msToClock } from './lib/timeseries'

export type CompareMode = 'off' | 'staging' | 'committed'

interface AppState {
  // --- data ---
  data: AppData | null
  loadError: string | null
  tsMs: number[]
  positions: Record<string, NodePosition>
  bounds: ReturnType<typeof layoutBounds>
  graph: GraphIndex | null

  // --- theme ---
  themeName: ThemeName
  toggleTheme: () => void

  // --- layout ---
  layoutMode: LayoutMode
  setLayoutMode: (m: LayoutMode) => void

  // --- clock ---
  clock: number // fractional index into timestamps
  live: boolean
  setClock: (c: number) => void
  setClockFromIso: (iso: string) => void
  goLive: () => void
  lastIndex: number

  // --- priority (recomputed on clock change) ---
  priorityList: PriorityEntry[]
  priorityTop: Set<string>

  // --- selection ---
  selectedId: string | null
  hoveredId: string | null
  blastSet: Set<string> // downstream-affected highlight set (from hover ?? selection)
  select: (id: string | null) => void
  setHovered: (id: string | null) => void

  // --- diagram modal ---
  diagramOpen: boolean
  selectedEdgeId: string | null
  setSelectedEdge: (id: string | null) => void
  openDiagram: () => void
  closeDiagram: () => void

  // --- compare ---
  compareMode: CompareMode
  compareIds: string[]
  startCompare: () => void
  toggleCompareId: (id: string) => void
  commitCompare: () => void
  exitCompare: () => void
  setCompareIds: (ids: string[]) => void

  // --- init ---
  init: (data: AppData) => void
  setError: (msg: string) => void
}

export const useStore = create<AppState>((set, get) => ({
  data: null,
  loadError: null,
  tsMs: [],
  positions: {},
  bounds: layoutBounds({}),
  graph: null,

  themeName: 'dark',
  toggleTheme: () => {
    const next: ThemeName = get().themeName === 'dark' ? 'light' : 'dark'
    applyThemeToDOM(themes[next], next)
    set({ themeName: next })
  },

  layoutMode: (localStorage.getItem('layoutMode2') as LayoutMode) || 'flow',
  setLayoutMode: (m) => {
    const data = get().data
    localStorage.setItem('layoutMode2', m)
    if (!data) {
      set({ layoutMode: m })
      return
    }
    const positions = computeLayout(data.topology, m)
    set({ layoutMode: m, positions, bounds: layoutBounds(positions) })
  },

  clock: 0,
  live: true,
  lastIndex: 0,
  priorityList: [],
  priorityTop: new Set(),
  setClock: (c) => {
    const last = get().lastIndex
    const clamped = Math.max(0, Math.min(last, c))
    const { data, graph } = get()
    let priorityList = get().priorityList
    let priorityTop = get().priorityTop
    if (data && graph) {
      priorityList = computePriority(data.topology, data.timeseries, graph, clamped)
      priorityTop = new Set(priorityList.filter((p) => p.score > 0.05).slice(0, 8).map((p) => p.serviceId))
    }
    set({ clock: clamped, live: clamped >= last - 0.001, priorityList, priorityTop })
  },
  setClockFromIso: (iso) => {
    const ms = Date.parse(iso)
    const c = msToClock(ms, get().tsMs)
    get().setClock(c)
  },
  goLive: () => set({ clock: get().lastIndex, live: true }),

  selectedId: null,
  hoveredId: null,
  blastSet: new Set(),
  select: (id) => {
    const g = get().graph
    // Selection keeps the downstream blast set bright (everything else dims).
    const blastSet = id && g ? new Set([id, ...blastRadius(g, id).keys()]) : new Set<string>()
    set({ selectedId: id, selectedEdgeId: null, blastSet })
  },
  setHovered: (id) => {
    const g = get().graph
    if (id && g) {
      // Hover isolates the directly-connected neighbors (both directions) and
      // dims everything else hard — "show me just what this touches".
      const set1 = new Set<string>([id, ...(g.downstream[id] ?? []), ...(g.upstream[id] ?? [])])
      set({ hoveredId: id, blastSet: set1 })
      return
    }
    // No hover: fall back to the selection's blast set (or clear).
    const sel = get().selectedId
    const blastSet = sel && g ? new Set([sel, ...blastRadius(g, sel).keys()]) : new Set<string>()
    set({ hoveredId: null, blastSet })
  },

  diagramOpen: false,
  selectedEdgeId: null,
  setSelectedEdge: (id) => set({ selectedEdgeId: id }),
  openDiagram: () => set({ diagramOpen: true }),
  closeDiagram: () => set({ diagramOpen: false }),

  compareMode: 'off',
  compareIds: [],
  startCompare: () => {
    const sel = get().selectedId
    set({ compareMode: 'staging', compareIds: sel ? [sel] : [] })
  },
  toggleCompareId: (id) => {
    const cur = get().compareIds
    set({
      compareIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    })
  },
  commitCompare: () => {
    if (get().compareIds.length >= 2) set({ compareMode: 'committed' })
  },
  exitCompare: () => set({ compareMode: 'off', compareIds: [] }),
  setCompareIds: (ids) => set({ compareIds: ids }),

  init: (data) => {
    const positions = computeLayout(data.topology, get().layoutMode)
    const tsMs = timestampsToMs(data.timeseries.timestamps)
    const lastIndex = tsMs.length - 1
    const graph = buildGraphIndex(data.topology)
    const priorityList = computePriority(data.topology, data.timeseries, graph, lastIndex)
    const priorityTop = new Set(
      priorityList.filter((p) => p.score > 0.05).slice(0, 8).map((p) => p.serviceId),
    )
    set({
      data,
      tsMs,
      positions,
      bounds: layoutBounds(positions),
      graph,
      lastIndex,
      clock: lastIndex,
      live: true,
      priorityList,
      priorityTop,
    })
  },
  setError: (msg) => set({ loadError: msg }),
}))
