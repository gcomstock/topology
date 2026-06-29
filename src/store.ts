import { create } from 'zustand'
import type { AppData, NodePosition } from './types'
import { themes, type ThemeName, applyThemeToDOM } from './theme'
import {
  computeLayout,
  groupedLayout,
  layoutBounds,
  type LayoutMode,
  type GroupAnchor,
} from './lib/layout'
import {
  buildGraphIndex,
  blastRadius,
  computePriority,
  type GraphIndex,
  type PriorityEntry,
} from './lib/graph'
import { timestampsToMs, msToClock } from './lib/timeseries'
import { trafficDomain, type TrafficDomain } from './lib/traffic'

export type CompareMode = 'off' | 'staging' | 'committed'

// Compute node positions for a mode, plus team zone anchors when grouped (else []).
function layoutFor(topo: AppData['topology'], mode: LayoutMode) {
  if (mode === 'grouped') {
    const { positions, anchors } = groupedLayout(topo)
    return { positions, groupAnchors: anchors }
  }
  return { positions: computeLayout(topo, mode), groupAnchors: [] as GroupAnchor[] }
}

interface AppState {
  // --- data ---
  data: AppData | null
  loadError: string | null
  tsMs: number[]
  positions: Record<string, NodePosition>
  bounds: ReturnType<typeof layoutBounds>
  graph: GraphIndex | null
  trafficDomain: TrafficDomain

  // --- theme ---
  themeName: ThemeName
  toggleTheme: () => void

  // --- layout ---
  layoutMode: LayoutMode
  setLayoutMode: (m: LayoutMode) => void
  groupAnchors: GroupAnchor[] // team zone anchors, populated only in grouped mode

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
  trafficDomain: { logMin: 0, logMax: 1 },

  themeName: 'dark',
  toggleTheme: () => {
    const next: ThemeName = get().themeName === 'dark' ? 'light' : 'dark'
    applyThemeToDOM(themes[next], next)
    set({ themeName: next })
  },

  layoutMode: ((): LayoutMode => {
    const stored = localStorage.getItem('layoutMode2')
    return stored === 'grouped' ? 'grouped' : 'flow' // ignore retired modes
  })(),
  setLayoutMode: (m) => {
    const data = get().data
    localStorage.setItem('layoutMode2', m)
    if (!data) {
      set({ layoutMode: m })
      return
    }
    const { positions, groupAnchors } = layoutFor(data.topology, m)
    set({ layoutMode: m, positions, groupAnchors, bounds: layoutBounds(positions) })
  },
  groupAnchors: [],

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
    if (!id) {
      set({ selectedId: null, selectedEdgeId: null, blastSet: new Set<string>() })
      return
    }
    const g = get().graph
    // Retargeting WITHIN the current active topology (arrowing / clicking an
    // already-highlighted node) keeps that set anchored, so traversal stays put.
    // Selecting a node outside it (sidebar, fresh click) establishes a new set.
    const cur = get().blastSet
    if (get().selectedId && cur.has(id)) {
      set({ selectedId: id, selectedEdgeId: null })
      return
    }
    const blastSet = g ? new Set([id, ...blastRadius(g, id).keys()]) : new Set<string>([id])
    set({ selectedId: id, selectedEdgeId: null, blastSet })
  },
  setHovered: (id) => {
    const g = get().graph
    // While a node is selected, the active topology is LOCKED to the selection's
    // set — hover only changes emphasis, never the dim/active set. (This is what
    // keeps traversal limited to the active topology.)
    if (get().selectedId) {
      set({ hoveredId: id })
      return
    }
    if (id && g) {
      // No selection: preview the SAME topology that clicking would commit — the
      // node + its blast radius — so hover and click never disagree.
      const set1 = new Set<string>([id, ...blastRadius(g, id).keys()])
      set({ hoveredId: id, blastSet: set1 })
      return
    }
    set({ hoveredId: null, blastSet: new Set<string>() })
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
    const { positions, groupAnchors } = layoutFor(data.topology, get().layoutMode)
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
      groupAnchors,
      bounds: layoutBounds(positions),
      graph,
      trafficDomain: trafficDomain(data.topology),
      lastIndex,
      clock: lastIndex,
      live: true,
      priorityList,
      priorityTop,
    })
  },
  setError: (msg) => set({ loadError: msg }),
}))
