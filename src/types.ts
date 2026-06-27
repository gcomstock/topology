// Data model types — mirror the dummy JSON in public/data/*.json

export interface SLO {
  id: string
  type: 'availability' | 'latency' | 'throughput'
  target: number
  window: string
  thresholdMs?: number
}

export interface Service {
  id: string
  name: string
  tier: 1 | 2 | 3 | 4
  team: string
  lifecycle: 'active' | 'maintenance' | 'deprecated'
  layer: number
  regions: string[]
  datastores: string[]
  replicas: Record<string, number>
  inDegree: number
  owner: { name: string; contact: string }
  onCall: { name: string; contact: string }
  links: { runbook: string; dashboard: string; repo: string; docs: string }
  about: string
  slos: SLO[]
  dependsOn: string[]
}

export interface EdgeContract {
  operations: { name: string; method: string }[]
  sampleRequest: Record<string, unknown>
  sampleResponse: Record<string, unknown>
}

export interface FailureBehavior {
  mode: string
  note: string
  author: string
  incidentRef: string
}

export interface Edge {
  id: string
  source: string
  target: string
  contract: EdgeContract
  failureBehavior: FailureBehavior | null
}

export interface Topology {
  currentUser: { name: string; ownedServiceIds: string[] }
  meta: {
    generatedAt: string
    window: { start: string; end: string; stepMinutes: number }
    regions: string[]
    teams: string[]
    tierLegend: Record<string, string>
  }
  services: Service[]
  edges: Edge[]
}

export interface Golden {
  latencyP50: number[]
  latencyP99: number[]
  traffic: number[]
  errorRate: number[]
  saturation: number[]
}

export interface ServiceSeries {
  burnFast: number[]
  burnSlow: number[]
  health: number[]
  sampleCount: number[]
  golden: Golden
  perSlo: Record<string, number[]>
}

export interface EdgeSeries {
  latencyMs: number[]
  errorRate: number[]
  throughput: number[]
  health: number[]
}

export interface Timeseries {
  timestamps: string[]
  perService: Record<string, ServiceSeries>
  perEdge: Record<string, EdgeSeries>
}

export interface SystemEvent {
  id: string
  serviceId: string
  timestamp: string
  type: 'deploy' | 'config' | 'scale' | 'incident'
  title: string
  version?: string
  author: string
  detail: string
}

export interface EventsFile {
  events: SystemEvent[]
}

export interface Incident {
  id: string
  serviceId: string
  title: string
  startedAt: string
  resolvedAt?: string
  severity: string
  status?: string
  summary: string
  impactedServices?: string[]
}

export interface IncidentsFile {
  active: Incident[]
  resolved: Incident[]
}

export interface AppData {
  topology: Topology
  timeseries: Timeseries
  events: EventsFile
  incidents: IncidentsFile
}

// Computed-at-runtime layout position
export interface NodePosition {
  x: number
  y: number
}
