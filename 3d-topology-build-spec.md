# Build Spec — 3D Observability Topology Prototype

**Audience:** Claude Code. This is a self-contained build spec; you should not need any other document.
**Goal:** A deployable-to-GitHub-Pages, frontend-only prototype of a 3D observability topology tool for incident response. No backend. All data loads at runtime from swappable JSON files. Dark mode is the demo target; light mode is a rough best-guess pass.
**Nature:** This is a *visionary prototype* to sell a concept, running on idealized dummy data. Prioritize the demo experience and visual impact over production concerns. Do not build auth, real telemetry ingestion, or live streaming.

---

## 0. Tech stack (decided)

- **Build tool:** Vite (configured for GitHub Pages — set `base` to the repo path; build outputs static assets).
- **Framework:** React + TypeScript.
- **3D:** `three`, `@react-three/fiber` (R3F), `@react-three/drei` (helpers: OrbitControls, Html, Line, shaders), `@react-three/postprocessing` (Bloom — essential for the look).
- **State:** `zustand` (single global store — ideal for R3F; holds the global clock, selection, mode, theme, comparison set).
- **Layout (graph):** `dagre` or `@dagrejs/dagre` for a layered left→right DAG layout (see §4). Compute once on load, then freeze.
- **Routing / deep links:** hash-based routing (GitHub Pages is static). Encode state in the URL hash (see §10).
- **Data:** plain `fetch` of `/data/*.json` at runtime, resolved relative to Vite `base`. Data must be trivially swappable — never import JSON into the bundle.
- **No CSS framework required.** Use CSS custom properties for the theme tokens (§3). A small utility layer is fine; avoid heavy UI kits.

If any library above proves impractical, substitute sensibly and note it, but keep the R3F + zustand + Vite spine.

---

## 1. Product concept (what we're building)

A 3D topology of microservices for an on-call incident responder. The graph is laid out on a plane (structure). The **third dimension is reserved for a single quantitative health metric rendered as a terrain surface** — the visual centerpiece. A **global time playhead** lets the user scrub through time and watch incidents propagate across the map. Clicking a node opens a dense detail inspector. The whole thing is dark, technical, IDE-flavored, data-dense.

**Primary user job:** incident response — spot the fire, understand its blast path, drill in, and correlate across services.

---

## 2. Core design rules (obey these; they resolve most ambiguity)

1. **One channel, one job.** No visual property encodes two things.
2. **Static properties → static channels; dynamic properties → dynamic channels.** Criticality (static) must never use attention-grabbing channels (glow, motion) that belong to health (dynamic).
3. **The terrain encodes health truth only** (burn severity). Importance/priority is computed separately and shown in its own overlay (sidebar + glow), never blended into the terrain.
4. **Detail-panel ordering ∝ (read-frequency × change-rate):** golden signals and "what changed" get top/prime real estate; diagram and resolved history get compressed/folded.
5. **Never trap the user.** The detail panel re-targets in place as the user traverses nodes; it does not modal-block traversal. (The one allowed exception is the diagram modal — trivially dismissable.)
6. **One global clock.** The scrubber's time governs every surface simultaneously.

---

## 3. Visual design system

### Aesthetic
Technical, futuristic, IDE-like. Dense, small type, low whitespace, strong hierarchy doing the separation that whitespace usually does. Emissive/glow + bloom for the "futuristic" register. Color is **semantic first**: it means what the data means.

### Typography
- **Monospace** for all data, numbers, metrics, service names/labels, and table-like UI. Use a modern mono: `JetBrains Mono` (preferred) with fallback to `ui-monospace, "SF Mono", "IBM Plex Mono", monospace`.
- **Sans-serif** for prose / long-form (the "about this service" narrative, descriptions). Use `Inter` with fallback `ui-sans-serif, system-ui, sans-serif`.
- Small sizes throughout. Base data size ~12px; labels ~11px; emphasize *values* over labels with weight/size, not whitespace.

### Color — semantic palette
Color conveys meaning. Health is a gradient; events have categorical hues; structure is neutral.

**Health (continuous, green→amber→red):**
- good/green `#3fb950`
- mid/amber `#d29922`
- bad/red `#f85149`
- no-data/gray `#484f58`

**Event categories:**
- neutral event (e.g. deploy/info): blue `#58a6ff`
- warning: yellow `#d29922`
- (error/critical events reuse health red `#f85149`)

**Dark theme tokens (DEFAULT — resolve these well):**
```
--bg-base:        #0a0e14   /* deep ink, scene background */
--bg-elevated:    #0d1117   /* panels */
--bg-elevated-2:  #11161f   /* nested cards, table rows */
--border:         #1c2430
--grid:           #161b22   /* faint floor grid lines */
--text-primary:   #e6edf3
--text-muted:     #7d8590
--text-faint:     #484f58
--accent:         #2dd4bf   /* teal — selection, interactive, focus ring */
--accent-blue:    #58a6ff   /* neutral events, links */
--health-good:    #3fb950
--health-mid:     #d29922
--health-bad:     #f85149
--warning:        #e3b341
--nodata:         #484f58
--glow-good:      #3fb950
--glow-bad:       #ff6a5e   /* slightly hotter for bloom */
```

**Light theme tokens (ROUGH best-guess — do not over-invest):**
```
--bg-base:        #ffffff
--bg-elevated:    #f6f8fa
--bg-elevated-2:  #eef1f4
--border:         #d0d7de
--grid:           #e6e9ec
--text-primary:   #1f2328
--text-muted:     #59636e
--text-faint:     #8c959f
--accent:         #0d9488
--accent-blue:    #0969da
--health-good:    #1a7f37
--health-mid:     #9a6700
--health-bad:     #cf222e
--warning:        #9a6700
--nodata:         #8c959f
```
Theme is toggleable; **dark is the default.** Drive all colors (including Three.js materials and bloom intensities) from these tokens via a JS theme object mirrored from the CSS variables, so the 3D scene re-themes too.

### Bloom / post-processing
Apply a Bloom pass tuned so only **emissive** elements glow (burning nodes, terrain peaks, edge highlights) — this is what sells the futuristic IDE feel. Keep threshold high enough that the dark background and neutral UI don't bloom.

---

## 4. The 3D scene

### Graph layout
- **Two layout modes, toggleable (default = flow-ordering):**
  - **Flow-ordering (default):** layered DAG, left→right. Use dagre with rank direction LR so the x-axis encodes dependency flow: **upstream services on the left, downstream on the right** (matches the domain mental model). y spreads siblings.
  - **Organic clusters:** force-directed layout (`d3-force`) that groups by connectivity/team rather than flow direction.
- Both layouts are **computed once and frozen** (stable mental map; never re-layout on state change). Toggling recomputes and re-freezes. Persist the chosen mode.
- Store computed `{x, y}` per node; nodes live on a base plane (z = 0).

### Nodes — stepped pyramids encoding criticality (tier)
- Each service is a **stepped/tiered pyramid**. **More tiers = more critical.** Map service `tier` (1–4) to that many stacked steps; higher tier = taller, more stepped pyramid. Counting steps is the read (discrete, survives perspective distortion), not absolute height.
- Pyramids point **up** from the base plane.
- Render with a subtle **emissive outline / edge** in a neutral or accent color so the node silhouette stays readable even when terrain rises around it.
- **Glow = acute health urgency only** (dynamic). A node emits a health-colored glow (bloom) when actively burning; glow intensity tracks fast-burn rate. Healthy nodes do not glow regardless of importance. (Criticality is the pyramid's static form; never the glow.)
- **Opacity = confidence/data quality.** Low-sample / low-confidence nodes render translucent ("ghostly"); no-data nodes render gray (`--nodata`).
- Use instancing where reasonable for performance, but pyramids with per-node tier + glow may be simpler as individual meshes for the prototype's node count — prioritize correctness, optimize only if it stutters.

### Edges — animated dashed lines
- Render dependency edges as **dashed lines** with an **animated dash offset** to convey flow/latency (the "dotted line animation"). Animation direction shows source→target.
  - **Dash animation speed conveys latency:** slower-crawling dashes = higher latency (data taking longer to traverse). (Tunable — expose the mapping; this is a likely iteration point.)
- **Edge color = edge health** (green/amber/red from the health palette), driven by the edge's error/latency status.
- Optional second-order: dash density or line thickness for throughput. Keep subtle.

### Labels — constant pixel size, no transforms
- Service-name labels must render at a **small, fixed screen-space pixel size that does NOT scale with zoom or pan.** As the camera moves, labels stay the same small legible size and always face the camera.
- Implement with drei `<Html>` (renders DOM at constant size — naturally meets "no transformations") **or** a sprite/`<Text>` with `sizeAttenuation={false}`. Prefer whichever performs acceptably at the dataset size.
- Labels are small monospace, `--text-primary` on a faint pill/`--bg-elevated` backing for legibility against the terrain.
- **Decluttering:** if labels overlap heavily at the default zoom, show labels for the active node + its neighbors + high-priority nodes, and reveal others on hover/zoom. Don't render thousands of DOM labels at once.

### Terrain — the centerpiece (health heightfield)
- A grid mesh (start ~128×128 segments) spanning the layout bounds, representing **burn severity** as height.
- **Height field:** `height(x, y, t) = Σ over services [ burn_i(t) · kernel(distance((x,y), pos_i)) ]`, a sum of bumps centered on each node.
  - **Acute (fast) burn → narrow, sharp kernel → tall spike.** **Chronic (slow) burn → wide, low kernel → broad plateau.** Drive kernel sharpness from each service's acute/chronic burn split.
- **Terrain color = health** (green→amber→red by local height/burn), reinforcing height redundantly (legible from bad camera angles + colorblind-safe). Make peaks emissive so they bloom.
- **Spatial relationship (DECIDED — terrain below, deforms downward):** The terrain sits **below** the node layer and deforms **downward only**.
  - **Neutral/healthy terrain height = the node base plane = z = 0.** In a calm topology the terrain is a flat plain at z=0 and nodes rest flush on it (anchored).
  - **Burn carves the surface downward from z=0** into pits/chasms. Acute burn → narrow deep spike *downward*; chronic burn → broad shallow *downward* basin. So `terrainZ(x,y,t) = -Σ services [ burn_i(t) · kernel(dist) ]` (note the negative — it only ever goes down).
  - The node layer (pyramids + labels) therefore **always sits in clear airspace above the terrain**, with zero occlusion of nodes/labels regardless of burn magnitude — this is the whole reason for downward deformation.
  - **Nodes cast drop shadows onto the terrain** (enable shadow maps: a directional light, terrain receives, pyramids cast). Shadows anchor nodes vertically and act as a depth cue — a shadow falling into a forming pit signals the chasm. Accept the modest shadow-map perf cost.
  - Color the pit walls/floor by health (deeper red the worse it is); make them emissive so they bloom from within the void.
  - Felt effect: healthy = flat stable plain; trouble = red chasms tearing open beneath services, leaving critical nodes perched over deepening voids. This matches the original "gravity well underneath the node" intent.
  - Honest tradeoff: downward pits can occlude *distant terrain behind their far walls* and occlude *each other* at low camera angles — but they **never** occlude the node layer. Net strict improvement over upward terrain.
- **Animation:** when the global clock changes, recompute the height field for that timestamp (interpolate between the two nearest time-slices for smooth scrubbing). For the prototype, recompute on time-change (not every frame) at a moderate grid resolution; move to a vertex shader if it stutters. This animated terrain is the **hero demo moment** — a flat green landscape erupting into a spreading red mountain range as the user scrubs into an incident.

### Camera
- **Default:** perspective camera at a near-isometric ¾ angle (≈45° azimuth, ≈35° elevation) for dramatic depth on the terrain. OrbitControls (drei) for rotate/pan/zoom.
- Provide a "reset view" control and (nice-to-have) a true-orthographic isometric toggle. (Perspective-vs-ortho is a flagged decision, §13.)
- Floor: a faint `--grid` ground grid under everything for the technical/IDE feel and spatial reference.

---

## 5. Priority, criticality, blast radius (computed client-side)

- **Criticality** is a static input from the data (service `tier` + optionally graph centrality). Encoded by pyramid steps.
- **Priority score** (drives "where to click", NOT the terrain): `priority ≈ criticality × fastBurnRate × blastRadius`, computed at the current time. Fixed formula, org-wide (do not make it user-tunable).
- **Ranked incident sidebar** lists top-priority nodes by this score (text — allowed to be a considered ranking). Clicking an entry selects that node.
- **Glow in the scene** is the spatial echo of urgency (acute burn), so the click-worthy node = bright glow on a tall pyramid = the intersection of dynamic urgency and static importance.
- **Blast radius / health propagation:** on selecting/hovering a node, highlight the downstream propagation path (which nodes would go red if this degrades); dim everything else. Compute via graph traversal.

---

## 6. Detail panel (re-targeting inspector)

- Overlaid on the **right**. Opening a node is a **ratio shift**: topology demotes to ~¼ width and **recenters/scales around the active node** so its neighbors are visible (do NOT redraw a new neighborhood graph for v1 — just recenter and zoom the existing scene); detail panel takes ~¾.
- **Persistent + re-targeting:** arrowing (keyboard ←/→/↑/↓) or clicking another node updates the panel *in place*; it stays open and only values change.
- **Layout stability:** fixed section order; empty sections collapse to a quiet "none" rather than disappearing (so the eye holds position across traversal).
- **Single scrolling pane** (no tabs in v1). Order by read-frequency × change-rate:
  1. **Golden signals** (latency p50/p99, traffic, errors, saturation) — top, prominent, mono, current values loud. Small sparklines ok.
  2. **What changed recently** — last deploy time/version/author, recent config/scale events. High prominence (highest-yield root-cause signal).
  3. **Active incidents** for this service.
  4. **Infrastructure summary** — isometric **cubes** representing containers/replicas, colored red/green/gray (gray = no data) to convey magnitude + health at a glance. Plus a small **per-region breakdown** viz.
  5. **Inferred service diagram** — fixed **280×280 thumbnail** (see §7). Always same size/behavior; click to expand to modal.
  6. **Resolved/previous incidents** — calmer, lower in pane.
  7. **Ownership & contacts** — team, tier, lifecycle (active/maintenance/deprecated), owner, **on-call**.
  8. **Operational links** — runbook, dashboard, repo, **docs (opens in new browser tab; not hosted in-product).**
  Also surface: **datastores**, regions/AZs/clusters, replica counts, capacity/saturation headroom, dependency list.
- **Responsive:** panel grows with window up to a **max width**; beyond a threshold, go **multi-column** (densify the signals/dashboard area; keep prose single-column for readable line length).
- **Everything in the panel reflects the global clock** — when scrubbed back, golden signals, what-changed, glow, etc. show that past moment.

---

## 7. Inferred service diagram + human-knowledge layer

- A **boundary-level** diagram (what crosses the service's edges) generated from the (dummy) telemetry — NOT a hand-drawn canvas. Keep it legible at 280×280.
- Shows: the service, its real inputs/outputs (from edge data), datastores, and for a selected dependency edge: the **contract** (operations called, sampled request/response payloads, observed latency/error on that edge).
- **Human-authored failure-behavior note, inline on the edge** (not a separate tab): one row reading e.g. `Failure behavior: serves stale 90s, then errors — @priya, INC-4471`, visibly marked as human-authored vs measured. Empty state: `Failure behavior: not yet documented` (with a dormant "+ add" affordance that is non-functional in v1 — it signals the future capture flow). Populate from the dummy data so the demo shows a filled note on a hot edge and an empty one elsewhere.
- **Modal expand:** clicking the thumbnail opens a larger pannable/zoomable modal (the one allowed user "trap") — must be trivially dismissable (Esc, click-outside, large close target). Use the modal only when the thumbnail isn't legible enough; behavior is identical regardless of diagram complexity (conditional legibility, not conditional layout).
- **Long-form "about this service" narrative** (sans-serif, educational) may live in its own collapsible section/tab — this is the calm-read content, distinct from the inline failure note.

---

## 8. Global playhead / time travel

- **Scrub bar across the top.** Default state = **live** (sticky): playhead at right edge, "current" data shown. Scrubbing left freezes time at the playhead and re-renders **every surface** to that moment (terrain, glow, edges, detail panel, sidebar).
- Increments ~5 min; interpolate terrain between slices for smooth scrubbing.
- **Event ticks on the scrub bar** — navigable markers for deploys/config/scale/incident events across the whole system; clicking a tick jumps the playhead there. Typed (colored/iconed by event category).
- **Event bubbles on nodes** — when a node has a qualifying event in the current window, a small typed-icon bubble appears above it, with **persistence-and-decay** (fade in/out, no hard strobe during fast scrubs). Deploy gets its own glyph; config, scale, incident each get one.
- **"You are in the past" state:** when not live, show a **prominent top banner** with a one-click **"Return to live"** CTA. (Desaturation/stronger full-UI treatment is a fast-follow, not v1.)
- Do **not** build live-streaming-during-time-travel. The prototype runs on fixed data.

---

## 9. Comparison view (correlation)

Build after the single-node experience (it's the heaviest piece; see build order §12). For v1 it can be a strong designed surface rather than fully general.

- **Entry:** a "Compare" action (from a selected node or a top-level toggle) → topology returns front-and-center → **multi-select staging mode** (topology-dominant, minimal chrome, a running selection tray showing picked services) → **commit** flips to a comparison-dominant view. **Suspend rendering the comparison surface until commit** (during selection the user needs the topology big).
- **Smart-seeded selection:** pre-offer the active node's unhealthy neighbors / the services seen lighting up during a scrub ("add the 3 burning services connected to this one?").
- **Comparison content (priority order):**
  1. **Aligned multi-service health timeline** — one shared x-axis (the same time domain as the global playhead), all selected services on it, so **onset order (the stagger) is legible.** This is the spine.
  2. **Change/deploy markers from all selected services on that same timeline** — the root-cause coincidence detector.
  3. **Topological relationship** of the set — chain / common-upstream / disconnected — and when disconnected, prompt: "these share no dependency path — look for a common substrate (region, datastore, deploy)."
  4. **Side-by-side golden signals** (same failure mode vs different).
  5. **Computed shared dependencies/infra** — intersect the selected services' dependencies, regions, datastores, deploy targets and show what they share.
- The shared playhead links this timeline to the topology (moving one moves the other).
- **NOT** a grid of full detail panels.

---

## 10. Entry points, URLs, cold start

Use hash-based routing (GitHub Pages safe). Encode state in the hash so links are shareable:
- `#/service/{id}?t={iso-timestamp}` — focus a service at a moment. **A deep link with a timestamp sets the playhead to that moment (the past), not live** — drops the responder in at the instant of the problem.
- `#/compare?ids={id,id,id}&t={iso}` — the **comparison view generates its own shareable URL.**
- **Cold start (no params):** the default view is **not blank.** Render the topology of the **services the system infers the user "owns"/cares about**, with a clear label like `Inferred: services you own` (from an `currentUser` block in the dummy data listing owned service ids). Playhead = live.
- A frictionless **"reset to overview"** control once focused/deep-linked.

---

## 11. Data model (dummy JSON, loaded at runtime from `/data`)

All data lives in `/public/data/*.json`, fetched at runtime, **easily swappable**, can be large. Generate a **robust, realistic dummy dataset** with mock service names, tiers, teams, regions, datastores, SLOs, time-series metrics, events, and incidents. **Bake in a scripted "hero incident"** (see §11.6) so scrubbing tells a clear propagation story.

Suggested files (consolidate or shard as sensible):

### 11.1 `topology.json` — static structure + metadata
```jsonc
{
  "currentUser": { "name": "...", "ownedServiceIds": ["svc-checkout", "..."] },
  "services": [
    {
      "id": "svc-checkout",
      "name": "checkout-api",
      "tier": 3,                       // 1–4; higher = more critical (more pyramid steps)
      "team": "Payments",
      "lifecycle": "active",           // active | maintenance | deprecated
      "regions": ["us-east-1", "us-west-2", "eu-west-1"],
      "datastores": ["pg-orders", "redis-cart"],
      "replicas": { "us-east-1": 12, "us-west-2": 8, "eu-west-1": 6 },
      "owner": { "name": "Priya N.", "contact": "priya@…" },
      "onCall": { "name": "Sam R.", "contact": "@sam / pager" },
      "links": { "runbook": "https://…", "dashboard": "https://…", "repo": "https://…", "docs": "https://…" },
      "about": "Long-form sans-serif narrative explaining what this service does and how it fits.",
      "slos": [
        { "id": "slo-checkout-avail", "type": "availability", "target": 99.95, "window": "30d" },
        { "id": "slo-checkout-lat", "type": "latency", "target": 99.9, "window": "30d", "thresholdMs": 300 }
      ],
      "dependsOn": ["svc-payments", "svc-inventory"]   // downstream services this calls
    }
  ],
  "edges": [
    {
      "id": "edge-checkout-payments",
      "source": "svc-checkout",
      "target": "svc-payments",
      "contract": {
        "operations": [{ "name": "AuthorizeCharge", "method": "gRPC" }],
        "sampleRequest":  { "amount": 4200, "currency": "USD", "token": "tok_…" },
        "sampleResponse": { "status": "authorized", "id": "ch_…" }
      },
      "failureBehavior": {                 // null when undocumented
        "mode": "serves_stale_then_errors",
        "note": "serves stale 90s, then errors",
        "author": "@priya",
        "incidentRef": "INC-4471"
      }
    }
  ]
}
```

### 11.2 `timeseries.json` — time-indexed metrics (the big file; large is OK)
```jsonc
{
  "timestamps": ["2026-06-27T13:00:00Z", "2026-06-27T13:05:00Z", "…"],  // ~5-min increments
  "perService": {
    "svc-checkout": {
      "burnFast": [0.1, 0.1, 0.2, 3.4, "…"],   // short-window burn (acute) → terrain spikes
      "burnSlow": [0.0, 0.0, 0.1, 0.3, "…"],    // long-window burn (chronic) → plateaus
      "health":   [0.98, 0.97, 0.9, 0.3, "…"],  // 0–1 for color
      "sampleCount": [5000, 5100, 5050, 4800, "…"], // low → low confidence → translucent
      "golden": {
        "latencyP50": [], "latencyP99": [], "traffic": [], "errorRate": [], "saturation": []
      },
      "perSlo": { "slo-checkout-avail": [/* burn series */], "slo-checkout-lat": [] }
    }
  },
  "perEdge": {
    "edge-checkout-payments": { "latencyMs": [], "errorRate": [], "throughput": [], "health": [] }
  }
}
```

### 11.3 `events.json`
```jsonc
{ "events": [
  { "id": "evt-1", "serviceId": "svc-payments", "timestamp": "2026-06-27T13:55:00Z",
    "type": "deploy", "title": "Deploy v412", "version": "v412", "author": "@dev",
    "detail": "Connection-pool config change" }
] }
```
`type`: `deploy | config | scale | incident`.

### 11.4 `incidents.json`
```jsonc
{
  "active":   [{ "id": "INC-5012", "serviceId": "svc-payments", "title": "…", "startedAt": "…", "severity": "SEV2", "status": "investigating" }],
  "resolved": [{ "id": "INC-4471", "serviceId": "svc-checkout", "title": "…", "startedAt": "…", "resolvedAt": "…", "summary": "…" }]
}
```

### 11.5 Dataset size
Aim for a **robust** topology — on the order of **40–80 services** with realistic dependency structure (some hubs, some leaves, multiple tiers), a 24-hour (or multi-hour) time window at 5-min resolution, and a believable spread of events/incidents. Include at least one **high-degree hub service** (see §13 — it's the legibility stress test).

### 11.6 Scripted hero incident (bake into the data)
Author a clear propagation story in the time-series so the demo lands: e.g. a **deploy to a shared platform/datastore-adjacent service at T**, followed over the next 15–30 min by **fast-burn rising first on that service, then propagating downstream** along dependency edges to 3–4 services. The terrain should visibly erupt and spread when scrubbed through this window, and the change marker should sit right at the inflection point. Also include a **disconnected common-cause** mini-story (several services in one region degrading together with no dependency path) to exercise the comparison view's "look for a shared substrate" prompt.

---

## 12. Build order (ship a runnable thing early)

- **Phase 0 — Scaffold:** Vite + React + TS + R3F + drei + zustand + postprocessing; theme tokens (dark); hash routing; runtime data loading; empty Canvas + ground grid.
- **Phase 1 — Static topology (first demoable milestone):** DAG layout, pyramid nodes by tier, dashed animated health-colored edges, constant-size labels, OrbitControls, bloom, dark theme. Loads from `topology.json`.
- **Phase 2 — Terrain:** height-field mesh driven by current-time burn, health coloring, emissive peaks.
- **Phase 3 — Detail panel:** ratio shift + recenter, re-targeting inspector, keyboard nav, golden signals, what-changed, infra cubes, region viz, ownership/links, diagram thumbnail + modal, inline failure note.
- **Phase 4 — Global playhead:** scrub bar, event ticks, node bubbles w/ decay, terrain animates on scrub, detail panel time-travels, past-state banner + return-to-live.
- **Phase 5 — Priority + blast radius:** ranked sidebar, acute-burn glow, downstream propagation highlight.
- **Phase 6 — Comparison view:** multi-select staging + comparison timeline + computed shared deps + URL.
- **Phase 7 — Polish:** light-mode pass, deep-link entry, cold-start inferred view, decluttering, perf.

Commit working state at the end of each phase. Each phase should leave the app runnable.

---

## 13. Flagged decisions (sensible defaults chosen; easy to flip — most likely iteration points)

1. **Terrain↔node spatial relationship — DECIDED (see §4):** terrain sits below nodes and deforms *downward only* (pits/chasms) from a neutral plane at z=0; nodes rest on the neutral plane and cast drop shadows. Node/label occlusion is eliminated by construction. (The earlier upward-rising alternative is rejected.)
2. **Camera:** default perspective at near-iso angle (depth drama). Alternative: true orthographic isometric. Provide as a toggle if cheap.
3. **Edge dash semantics:** default = dash speed conveys latency (slower = higher latency). Keep the mapping in one tunable place.
4. **Label rendering:** drei `<Html>` (constant size, DOM) vs sprite/`<Text>` with `sizeAttenuation={false}`. Pick by performance at the dataset size; declutter to active node + neighbors + high-priority.
5. **Light mode:** rough best-guess only; do not over-resolve.

---

## 14. Explicitly out of scope (do not build)
- Backend, auth, real telemetry ingestion.
- Live incident streaming / live-pulse-during-time-travel (talking point only).
- The human-input *capture* flow (show the note present; the "+ add" affordance is non-functional).
- A redrawn neighborhood graph for the detail view (recenter-and-scale only in v1).
- Tabs in the detail view (single scrolling pane in v1).
- Tunable priority formula.
