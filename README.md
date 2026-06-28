# 3D Observability Topology — Prototype Data & Repo Guide

A frontend-only, deploy-to-GitHub-Pages prototype of a **3D service topology for incident response**. The 3D scene renders microservices as **bars on a grid** — **height = relative traffic** (with a wireframe "cage" marking expected traffic so spikes/dips read), **color = aggregate SLO health** — all governed by a **global time playhead** you can scrub to watch incidents propagate.

This README documents the **dummy dataset** (the four JSON files) and how it fits the build. For the full product/build spec — tech stack, components, visual design tokens, build order — see **`3d-topology-build-spec.md`**, which is the authoritative implementation document.

---

## Quick start

1. Place the four JSON files in **`public/data/`**:
   - `topology.json` · `timeseries.json` · `events.json` · `incidents.json`
2. Load them at runtime with `fetch` (resolved relative to the Vite `base`). **Never import them into the bundle** — they must stay swappable so the demo data can be replaced without a rebuild.
3. Build the app per `3d-topology-build-spec.md` (Vite + React + TypeScript + react-three-fiber + drei + zustand + postprocessing). Follow the phased build order in §12 of that spec — Phase 1 (static topology) is the first demoable milestone.

To regenerate or reshape the data, edit and run **`gen_data.py`** (`python3 gen_data.py`). The random seed is fixed (`42`), so output is deterministic and the baked-in incident stays stable.

---

## Dataset at a glance

| Property | Value |
|---|---|
| Services | 62, across 5 dependency layers |
| Edges | 142 (caller → callee), with contracts |
| Time window | `2026-06-27T00:00:00Z` → `12:00:00Z` |
| Resolution | 5-minute steps · 145 timesteps · **live = last index (12:00)** |
| Hub service | `svc-auth` (auth-service), **in-degree 31** — the legibility stress test |
| Baked stories | hero propagation · regional common-cause · chronic slow-burn · low-sample nodes |

All time-series arrays are **index-aligned to `timeseries.timestamps`** — element `i` of every series corresponds to `timestamps[i]`.

---

## Files & schema (data dictionary)

### `topology.json` — static structure + metadata

```jsonc
{
  "currentUser":  { "name", "ownedServiceIds": [serviceId] },   // drives cold-start "services you own" view
  "meta":         { "generatedAt", "window": {start,end,stepMinutes}, "regions": [], "teams": [],
                    "tierLegend": { "1":"non-critical", ... "4":"tier-0 / critical" } },
  "services":     [ Service ],
  "edges":        [ Edge ]
}
```

**Service**

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `svc-payments` — the stable key used everywhere |
| `name` | string | display name, e.g. `payments-api` (render as the node label) |
| `tier` | 1–4 | **criticality → number of pyramid steps** (4 = tier-0, tallest) |
| `team` | string | owning team |
| `lifecycle` | enum | `active` \| `maintenance` \| `deprecated` |
| `layer` | 0–4 | dependency depth; 0 = edge/BFF, 4 = async workers. Useful for layout / debugging |
| `regions` | string[] | AWS-style regions the service runs in |
| `datastores` | string[] | DBs/caches/queues it talks to (e.g. `pg-ledger`, `redis-cart`) |
| `replicas` | object | `{ region: count }` — feeds the infra "cubes" viz |
| `inDegree` | int | how many services depend on this one — a centrality/criticality signal |
| `expectedTraffic` | int | stable baseline rps; renders as the bar-height "cage" actual traffic is read against |
| `owner` | object | `{ name, contact }` |
| `onCall` | object | `{ name, contact }` |
| `links` | object | `{ runbook, dashboard, repo, docs }` — **docs opens in a new tab; not hosted in-product** |
| `about` | string | long-form, sans-serif "what is this service" narrative |
| `slos` | SLO[] | `{ id, type, target, window, thresholdMs? }`; `type` ∈ `availability\|latency\|throughput` |
| `dependsOn` | string[] | downstream services this one calls (defines the edges) |

**Edge**

| Field | Type | Notes |
|---|---|---|
| `id` | string | `edge-{source}-{target}` |
| `source` / `target` | serviceId | caller → callee |
| `contract.operations` | array | `{ name, method }` — observed ops (e.g. `AuthorizeCharge` / `gRPC`) |
| `contract.sampleRequest` / `sampleResponse` | object | "real captured" example payloads for the diagram panel |
| `failureBehavior` | object \| **null** | the **human-authored** note: `{ mode, note, author, incidentRef }`. `null` = "not yet documented" (render the empty state). Populated on 5 edges; null elsewhere — by design, so you get both states. |

### `timeseries.json` — time-indexed metrics (the large file, ~557 KB)

```jsonc
{
  "timestamps": [ISO8601, ...],                 // 145 entries; index-aligns every series below
  "perService": {
    "<serviceId>": {
      "burnFast":    [number],   // acute / short-window burn → SHARP terrain spikes; drives glow
      "burnSlow":    [number],   // chronic / long-window burn → BROAD shallow terrain basins
      "health":      [0..1],     // derived; drives health color (green→amber→red)
      "sampleCount": [int],      // low values → low confidence → node opacity/translucency
      "golden":      { "latencyP50":[], "latencyP99":[], "traffic":[], "errorRate":[], "saturation":[] },
      "perSlo":      { "<sloId>": [burn] }       // per-SLO burn; aggregate node height = MAX across these
    }
  },
  "perEdge": {
    "<edgeId>": { "latencyMs":[], "errorRate":[], "throughput":[], "health":[] }  // edge color + dash speed
  }
}
```

> **Terrain note:** height at `(x,y,t)` ≈ `-Σ services [ burn_i(t) · kernel(dist) ]` — note the negative; the surface only ever deforms **downward** from the z=0 neutral plane. Use `burnFast` for sharp narrow pits (acute) and `burnSlow` for broad shallow ones (chronic). Interpolate between adjacent timesteps for smooth scrubbing.

### `events.json` — deploys / config / scale / incident markers

```jsonc
{ "events": [
  { "id", "serviceId", "timestamp", "type", "title", "version?", "author", "detail" }
]}
```
`type` ∈ `deploy | config | scale | incident`. Render as **ticks on the scrub bar** (navigable, colored by type) and as **decaying bubbles on nodes** when within the current window.

### `incidents.json` — active + resolved

```jsonc
{
  "active":   [ { "id", "serviceId", "title", "startedAt", "severity", "status", "summary", "impactedServices":[] } ],
  "resolved": [ { "id", "serviceId", "title", "startedAt", "resolvedAt", "severity", "summary", "impactedServices?":[] } ]
}
```

---

## Baked-in demo stories (what the data is designed to show)

Build and tune the visuals against these — they're the moments the prototype exists to sell.

**1. Hero incident — propagating deploy (the centerpiece)**
A deploy to **`payments-api` (v412)** at **09:30** lowers a DB connection-pool ceiling. `burnFast` rises on payments first, then **propagates upstream to its callers** in a clear stagger: checkout-api & order-orchestrator (~09:45), subscription-billing (~10:00), the BFFs and api-gateway (~09:55–10:10). A mitigation config event at **~11:06** raises the pool; burn partially recovers but is still elevated at the live edge. Active incident **INC-5012** (SEV2, mitigating). Scrub through 09:25→10:30 to watch the terrain tear open and spread.

**2. Regional common-cause (for the comparison view)**
Four **unrelated** eu-west-1 services — `search-api`, `recommendation-engine`, `email-dispatch`, `pricing-service` — degrade **together** at **05:00–05:45** with **no dependency path** between them. This exercises the comparison view's "these share no dependency path — look for a common substrate" prompt (the shared thing is the **region**). Resolved incident **INC-4990** (SEV3).

**3. Chronic slow-burn (plateau, not spike)**
`search-indexer` carries a sustained low `burnSlow` (~0.38) throughout — a "leak" that should render as a **broad shallow basin**, visually distinct from the hero's sharp pits. Tests the acute-vs-chronic terrain distinction.

**4. Low-sample / low-confidence nodes**
`wishlist-service`, `review-service`, `sms-gateway` have very low `sampleCount` (and a low `expectedTraffic`) — render them **gray** ("no data") to show the missing-data state.

**5. Flash-sale traffic spike (health stays green)**
`storefront-api` + `catalog-api` traffic jumps ~2.5–2.8× over their `expectedTraffic` cage at **07:00–08:30** while SLOs stay healthy — the "traffic is noteworthy, health is fine" case the bar-height + cage encoding exists to show. Paired with a traffic **dip** on `payments-api`/`checkout-api` during the hero incident (load-shedding while they redden).

**Documented failure behaviors** live on 5 edges, including the hero path (`checkout→payments`, `order-orchestrator→payments`) — so the diagram panel shows both filled human-authored notes and empty "not yet documented" states.

---

## Derived at runtime (NOT in the data — compute client-side)

These are intentionally absent from the JSON; the app computes them:

- **Layout positions** `{x,y}` — via dagre (flow-ordering) or d3-force (organic clusters); computed once, frozen.
- **Priority score** — `criticality × fastBurnRate × blastRadius` at the current time; drives the ranked sidebar + glow. Fixed formula, org-wide.
- **Blast radius** — downstream propagation set via graph traversal; drives the path highlight.
- **Terrain height field** — from `burnFast`/`burnSlow` per the formula above.
- **Criticality centrality** — optionally refine tier using `inDegree` / graph centrality.

---

## Regenerating / customizing the data

Everything lives in **`gen_data.py`**:

- **More services:** extend the `SVC` list and `DEPS` map (keep it acyclic for clean dagre layout). Re-run.
- **Different / additional incident:** edit the `HERO` propagation schedule (service → onset-delay, peak) and `HERO_DEPLOY_H`, or add to the `REGION_HIT` list / `region_burn`.
- **Longer window or finer resolution:** change `N` and `STEP` (note: file size scales with `services × timesteps`).
- **Human-readable JSON for debugging:** in the `dump()` function, swap `separators=(",",":")` for `indent=2` (larger files, still backend-free).
- The seed (`random.seed(42)`) keeps regenerations stable; change it to re-roll the noise.

---

## Running the app (the built frontend)

The prototype is a Vite + React + TypeScript + react-three-fiber app. The four
JSON files are served from `public/data/` and fetched at runtime (never bundled).

```bash
npm install        # one-time
npm run dev         # local dev server (http://localhost:5173)
npm run build       # typecheck + production build into dist/
npm run preview     # serve the production build locally
```

**Deep links / shareable URLs (hash routing):**
- `#/service/{id}?t={iso}` — focus a service at a past moment (drops you in at the problem)
- `#/compare?ids={a,b,c}&t={iso}` — the comparison view (also self-generates this URL)
- `#/` — cold-start overview (live), labelled "Inferred: services you own"

Try the **hero incident**: `#/service/svc-payments?t=2026-06-27T10:15:00Z`
and the **regional common-cause** comparison:
`#/compare?ids=svc-search-api,svc-recommendation,svc-email-dispatch,svc-pricing&t=2026-06-27T05:20:00Z`

**Deploy to GitHub Pages:** push to `main` — `.github/workflows/deploy.yml` builds
and publishes `dist/` to Pages. The Vite `base` is taken from the repo name via
`VITE_BASE` (defaults to `/topology/` for local builds). Enable Pages →
"GitHub Actions" in the repo settings once.

### App architecture (where things live)
- `src/store.ts` — single zustand store: global clock, selection, theme, layout mode, compare set, priority, blast radius.
- `src/lib/` — pure logic: `layout` (dagre/d3-force, frozen), `timeseries` (clock↔index interpolation), `graph` (blast radius + priority score), `color` (health ramp), `hashRoute`, `data` (runtime fetch).
- `src/scene/` — the R3F scene: `Terrain` (downward health heightfield — see the sign note in that file), `Nodes` (stepped pyramids), `Edges` (animated dashed health lines), `Labels`, `EventBubbles`, `CameraRig`, `Scene` (lights + bloom + controls).
- `src/ui/` — DOM overlay: `DetailPanel`, `Sidebar` (priority ranking), `Scrubber`, `PastBanner`, `CompareTray`/`CompareView`, `DiagramModal`, `ServiceDiagram`.
- `src/theme.ts` + `src/index.css` — theme tokens mirrored to both CSS vars and the 3D materials.

## Out of scope (don't build — talking points only)

Backend, auth, real telemetry ingestion, live-incident streaming during time-travel, and the human-input *capture* flow (the "+ add" affordance on failure notes is intentionally non-functional in v1). See spec §14.
