#!/usr/bin/env python3
"""Deterministic dummy-data generator for the 3D topology prototype.

Outputs four JSON files into ./data:
  topology.json   - static structure + metadata + edges/contracts
  timeseries.json - per-service / per-edge metrics at 5-min increments
  events.json     - deploys / config / scale / incident events
  incidents.json  - active + resolved incidents

Bakes in:
  * a HUB service (auth-service) many things depend on (legibility stress test)
  * a scripted HERO incident: deploy to payments-api -> propagates upstream
  * a disconnected COMMON-CAUSE story: eu-west-1 services degrade together
"""
import json, math, random, os, hashlib

random.seed(42)

# Services rendered translucent/gray (very low sample) — also get a low baseline.
LOW_SAMPLE = ("svc-wishlist", "svc-review", "svc-sms-gateway")

# ----------------------------------------------------------------------------
# Time axis: 2026-06-27 00:00Z .. 12:00Z at 5-min steps (145 points). Live = last.
# ----------------------------------------------------------------------------
import datetime as dt
START = dt.datetime(2026, 6, 27, 0, 0, 0, tzinfo=dt.timezone.utc)
STEP = dt.timedelta(minutes=5)
N = 145  # 00:00 .. 12:00 inclusive
timestamps = [(START + i * STEP).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(N)]

def idx_for_hours(h):
    return int(round(h * 60 / 5))

# Key moments (in hours from START)
HERO_DEPLOY_H = 9.5            # payments-api deploy
REGION_START_H, REGION_END_H = 5.0, 5.75   # eu-west-1 common-cause window
FLASH_START_H, FLASH_END_H = 7.0, 8.5      # flash-sale traffic spike (health stays OK)

REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
TEAMS = ["Payments", "Identity", "Catalog", "Fulfillment", "Growth",
         "Platform", "Search", "Data", "Comms"]

# ----------------------------------------------------------------------------
# Service definitions, organized in dependency layers (caller -> callee).
# layer index increases toward downstream (callee) side; dagre LR puts low layers left.
# Each tuple: (id, name, tier, team, layer, [regions], [datastores], lifecycle)
# ----------------------------------------------------------------------------
SVC = [
    # Layer 0 - edge / BFF
    ("svc-api-gateway", "api-gateway", 4, "Platform", 0, ["us-east-1","us-west-2","eu-west-1","ap-southeast-1"], [], "active"),
    ("svc-web-bff", "web-bff", 3, "Growth", 0, ["us-east-1","eu-west-1"], [], "active"),
    ("svc-mobile-bff", "mobile-bff", 3, "Growth", 0, ["us-east-1","us-west-2","ap-southeast-1"], [], "active"),

    # Layer 1 - user-facing orchestration APIs
    ("svc-checkout", "checkout-api", 3, "Payments", 1, ["us-east-1","us-west-2","eu-west-1"], ["redis-cart"], "active"),
    ("svc-order-orchestrator", "order-orchestrator", 4, "Fulfillment", 1, ["us-east-1","us-west-2","eu-west-1"], ["pg-orders"], "active"),
    ("svc-account-api", "account-api", 3, "Identity", 1, ["us-east-1","eu-west-1"], ["pg-users"], "active"),
    ("svc-catalog-api", "catalog-api", 2, "Catalog", 1, ["us-east-1","us-west-2","eu-west-1","ap-southeast-1"], ["pg-catalog"], "active"),
    ("svc-search-api", "search-api", 2, "Search", 1, ["us-east-1","eu-west-1"], ["es-products"], "active"),
    ("svc-cart-service", "cart-service", 3, "Payments", 1, ["us-east-1","us-west-2"], ["redis-cart"], "active"),

    # Layer 2 - domain services
    ("svc-payments", "payments-api", 4, "Payments", 2, ["us-east-1","us-west-2","eu-west-1"], ["pg-ledger","redis-idemp"], "active"),
    ("svc-inventory", "inventory-service", 3, "Fulfillment", 2, ["us-east-1","us-west-2"], ["pg-inventory"], "active"),
    ("svc-pricing", "pricing-service", 3, "Catalog", 2, ["us-east-1","eu-west-1"], ["pg-catalog"], "active"),
    ("svc-shipping", "shipping-api", 2, "Fulfillment", 2, ["us-east-1","eu-west-1"], ["pg-shipping"], "active"),
    ("svc-fraud", "fraud-detection", 3, "Payments", 2, ["us-east-1","us-west-2"], ["pg-fraud","redis-fraud"], "active"),
    ("svc-subscription", "subscription-billing", 3, "Payments", 2, ["us-east-1","eu-west-1"], ["pg-billing"], "active"),
    ("svc-recommendation", "recommendation-engine", 1, "Growth", 2, ["us-east-1","eu-west-1"], ["redis-reco"], "active"),
    ("svc-promo", "promo-engine", 2, "Growth", 2, ["us-east-1"], ["pg-promo"], "active"),
    ("svc-tax", "tax-service", 2, "Payments", 2, ["us-east-1","eu-west-1"], [], "active"),
    ("svc-review", "review-service", 1, "Catalog", 2, ["us-east-1"], ["pg-reviews"], "active"),
    ("svc-wishlist", "wishlist-service", 1, "Growth", 2, ["us-east-1"], ["pg-wishlist"], "deprecated"),

    # Layer 3 - platform / data-access (auth = HUB)
    ("svc-auth", "auth-service", 4, "Identity", 3, ["us-east-1","us-west-2","eu-west-1","ap-southeast-1"], ["pg-users","redis-sessions"], "active"),
    ("svc-feature-flags", "feature-flags", 2, "Platform", 3, ["us-east-1","eu-west-1"], ["redis-flags"], "active"),
    ("svc-config", "config-service", 3, "Platform", 3, ["us-east-1","us-west-2","eu-west-1"], ["pg-config"], "active"),
    ("svc-secrets", "secrets-manager", 4, "Platform", 3, ["us-east-1","us-west-2"], [], "active"),
    ("svc-ledger", "ledger-service", 4, "Payments", 3, ["us-east-1","eu-west-1"], ["pg-ledger"], "active"),
    ("svc-audit", "audit-log", 2, "Platform", 3, ["us-east-1"], ["pg-audit"], "active"),
    ("svc-notification", "notification-service", 2, "Comms", 3, ["us-east-1","eu-west-1"], ["pg-notif"], "active"),
    ("svc-search-indexer", "search-indexer", 1, "Search", 3, ["us-east-1"], ["es-products"], "active"),
    ("svc-warehouse-sync", "warehouse-sync", 2, "Data", 3, ["us-east-1"], ["pg-inventory"], "active"),

    # Layer 4 - async workers / sinks
    ("svc-order-worker", "order-events-worker", 2, "Fulfillment", 4, ["us-east-1","us-west-2"], ["kafka-orders"], "active"),
    ("svc-email-dispatch", "email-dispatch", 1, "Comms", 4, ["us-east-1","eu-west-1"], ["pg-notif"], "active"),
    ("svc-sms-gateway", "sms-gateway", 1, "Comms", 4, ["us-east-1"], [], "active"),
    ("svc-analytics-ingest", "analytics-ingest", 1, "Data", 4, ["us-east-1"], ["kafka-events"], "active"),
    ("svc-email-worker", "email-worker", 1, "Comms", 4, ["us-east-1"], ["kafka-events"], "maintenance"),
]

# --- stress-test fillers: densify each shelf (added to ~2x the service count) ---
SVC += [
    # Layer 0 - edge / BFF
    ("svc-partner-api", "partner-api", 3, "Platform", 0, ["us-east-1","eu-west-1"], [], "active"),
    ("svc-admin-bff", "admin-bff", 2, "Platform", 0, ["us-east-1"], [], "active"),
    ("svc-graphql-gateway", "graphql-gateway", 3, "Platform", 0, ["us-east-1","us-west-2"], [], "active"),

    # Layer 1 - orchestration APIs
    ("svc-returns-api", "returns-api", 2, "Fulfillment", 1, ["us-east-1"], ["pg-orders"], "active"),
    ("svc-gifting-api", "gifting-api", 2, "Growth", 1, ["us-east-1"], [], "active"),
    ("svc-loyalty-api", "loyalty-api", 2, "Growth", 1, ["us-east-1","eu-west-1"], ["pg-loyalty"], "active"),
    ("svc-address-api", "address-api", 2, "Identity", 1, ["us-east-1"], ["pg-users"], "active"),
    ("svc-storefront-api", "storefront-api", 3, "Catalog", 1, ["us-east-1","eu-west-1"], ["pg-catalog"], "active"),

    # Layer 2 - domain services (the densest shelf)
    ("svc-shipping-rates", "shipping-rates", 2, "Fulfillment", 2, ["us-east-1"], [], "active"),
    ("svc-currency", "currency-service", 2, "Payments", 2, ["us-east-1","eu-west-1"], [], "active"),
    ("svc-allocator", "inventory-allocator", 3, "Fulfillment", 2, ["us-east-1","us-west-2"], ["pg-inventory"], "active"),
    ("svc-media", "catalog-media", 1, "Catalog", 2, ["us-east-1"], ["s3-media"], "active"),
    ("svc-ratings", "ratings-service", 1, "Catalog", 2, ["us-east-1"], ["pg-reviews"], "active"),
    ("svc-giftcard", "gift-card-service", 3, "Payments", 2, ["us-east-1"], ["pg-billing"], "active"),
    ("svc-refund", "refund-service", 3, "Payments", 2, ["us-east-1","eu-west-1"], ["pg-ledger"], "active"),
    ("svc-dispute", "dispute-service", 2, "Payments", 2, ["us-east-1"], ["pg-fraud"], "active"),
    ("svc-loyalty-engine", "loyalty-engine", 1, "Growth", 2, ["us-east-1"], ["pg-loyalty"], "active"),

    # Layer 3 - platform / data-access
    ("svc-kms", "kms-proxy", 4, "Platform", 3, ["us-east-1","us-west-2"], [], "active"),
    ("svc-ratelimit", "rate-limiter", 3, "Platform", 3, ["us-east-1","eu-west-1"], ["redis-flags"], "active"),
    ("svc-schema-registry", "schema-registry", 2, "Data", 3, ["us-east-1"], ["pg-config"], "active"),
    ("svc-geo", "geo-service", 2, "Platform", 3, ["us-east-1","eu-west-1"], [], "active"),
    ("svc-metrics-agg", "metrics-aggregator", 1, "Data", 3, ["us-east-1"], ["pg-audit"], "active"),
    ("svc-token-cache", "token-cache", 3, "Identity", 3, ["us-east-1","us-west-2"], ["redis-sessions"], "active"),

    # Layer 4 - async workers / sinks
    ("svc-push-dispatch", "push-dispatch", 1, "Comms", 4, ["us-east-1"], [], "active"),
    ("svc-webhook-sender", "webhook-sender", 1, "Platform", 4, ["us-east-1"], ["kafka-events"], "active"),
    ("svc-export-worker", "export-worker", 1, "Data", 4, ["us-east-1"], ["kafka-events"], "active"),
    ("svc-reindex-worker", "reindex-worker", 1, "Search", 4, ["us-east-1"], ["es-products"], "active"),
    ("svc-ledger-archiver", "ledger-archiver", 2, "Payments", 4, ["us-east-1"], ["pg-ledger"], "maintenance"),
]

svc_by_id = {s[0]: s for s in SVC}

# ----------------------------------------------------------------------------
# Dependencies (caller dependsOn callee). Keep acyclic. auth is the hub.
# ----------------------------------------------------------------------------
DEPS = {
    "svc-api-gateway": ["svc-web-bff","svc-mobile-bff","svc-auth"],
    "svc-web-bff": ["svc-checkout","svc-catalog-api","svc-search-api","svc-account-api","svc-recommendation","svc-auth"],
    "svc-mobile-bff": ["svc-checkout","svc-catalog-api","svc-account-api","svc-cart-service","svc-auth"],

    "svc-checkout": ["svc-payments","svc-cart-service","svc-inventory","svc-tax","svc-promo","svc-auth"],
    "svc-order-orchestrator": ["svc-payments","svc-inventory","svc-shipping","svc-order-worker","svc-ledger","svc-auth"],
    "svc-account-api": ["svc-auth","svc-subscription","svc-notification"],
    "svc-catalog-api": ["svc-pricing","svc-review","svc-search-indexer","svc-auth"],
    "svc-search-api": ["svc-search-indexer","svc-catalog-api","svc-auth"],
    "svc-cart-service": ["svc-pricing","svc-promo","svc-auth"],

    "svc-payments": ["svc-fraud","svc-ledger","svc-tax","svc-config","svc-secrets","svc-auth"],
    "svc-inventory": ["svc-warehouse-sync","svc-config","svc-auth"],
    "svc-pricing": ["svc-config","svc-auth"],
    "svc-shipping": ["svc-config","svc-notification","svc-auth"],
    "svc-fraud": ["svc-config","svc-secrets","svc-auth"],
    "svc-subscription": ["svc-payments","svc-ledger","svc-notification","svc-auth"],
    "svc-recommendation": ["svc-feature-flags","svc-auth"],
    "svc-promo": ["svc-feature-flags","svc-config"],
    "svc-tax": ["svc-config"],
    "svc-review": ["svc-auth"],
    "svc-wishlist": ["svc-auth"],

    "svc-auth": ["svc-secrets","svc-config","svc-audit"],
    "svc-ledger": ["svc-config","svc-audit"],
    "svc-subscription": ["svc-payments","svc-ledger","svc-notification","svc-auth"],
    "svc-notification": ["svc-email-dispatch","svc-sms-gateway"],
    "svc-search-indexer": ["svc-config"],
    "svc-warehouse-sync": ["svc-config"],
    "svc-config": ["svc-secrets"],
    "svc-order-worker": ["svc-analytics-ingest","svc-config"],
    "svc-email-dispatch": ["svc-email-worker"],
    "svc-feature-flags": ["svc-config"],
}

# Filler dependencies (downstream/acyclic) + a few new callers for the fillers.
DEPS.update({
    "svc-partner-api": ["svc-order-orchestrator","svc-catalog-api","svc-auth"],
    "svc-admin-bff": ["svc-account-api","svc-config","svc-auth"],
    "svc-graphql-gateway": ["svc-catalog-api","svc-search-api","svc-account-api","svc-auth"],
    "svc-returns-api": ["svc-order-orchestrator","svc-refund","svc-auth"],
    "svc-gifting-api": ["svc-giftcard","svc-catalog-api","svc-auth"],
    "svc-loyalty-api": ["svc-loyalty-engine","svc-auth"],
    "svc-address-api": ["svc-geo","svc-auth"],
    "svc-storefront-api": ["svc-catalog-api","svc-pricing","svc-media","svc-auth"],
    "svc-shipping-rates": ["svc-config","svc-geo"],
    "svc-currency": ["svc-config"],
    "svc-allocator": ["svc-warehouse-sync","svc-config","svc-auth"],
    "svc-media": ["svc-config"],
    "svc-ratings": ["svc-auth"],
    "svc-giftcard": ["svc-ledger","svc-config","svc-auth"],
    "svc-refund": ["svc-payments","svc-ledger","svc-auth"],
    "svc-dispute": ["svc-fraud","svc-auth"],
    "svc-loyalty-engine": ["svc-config"],
    "svc-kms": ["svc-audit"],
    "svc-ratelimit": ["svc-config"],
    "svc-schema-registry": ["svc-config"],
    "svc-geo": ["svc-config"],
    "svc-metrics-agg": ["svc-audit"],
    "svc-token-cache": ["svc-secrets","svc-config"],
    "svc-push-dispatch": ["svc-config"],
    "svc-webhook-sender": ["svc-config"],
    "svc-export-worker": ["svc-analytics-ingest"],
    "svc-reindex-worker": ["svc-config"],
    "svc-ledger-archiver": ["svc-audit"],
})
DEPS["svc-notification"] = DEPS["svc-notification"] + ["svc-push-dispatch","svc-webhook-sender"]
DEPS["svc-payments"] = DEPS["svc-payments"] + ["svc-currency"]
DEPS["svc-auth"] = DEPS["svc-auth"] + ["svc-token-cache","svc-kms"]
DEPS["svc-order-orchestrator"] = DEPS["svc-order-orchestrator"] + ["svc-allocator"]
DEPS["svc-catalog-api"] = DEPS["svc-catalog-api"] + ["svc-media","svc-ratings"]

for s in SVC:
    DEPS.setdefault(s[0], [])

# in-degree for centrality flavor
indeg = {s[0]: 0 for s in SVC}
for caller, callees in DEPS.items():
    for c in callees:
        indeg[c] = indeg.get(c, 0) + 1

# ----------------------------------------------------------------------------
# Per-service baseline traffic/latency by tier+layer for plausible golden signals
# ----------------------------------------------------------------------------
# Deterministic per-service jitter (stable regardless of call order), so the
# baked "expectedTraffic" baseline exactly matches the traffic series baseline.
def _svc_jitter(sid, lo=0.7, hi=1.3):
    h = int(hashlib.md5(sid.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h

# Stable steady-state (diurnal-free) baseline traffic — drives the "expected"
# cage that actual traffic is read against.
def expected_traffic(sid, tier, layer):
    base = {0: 9000, 1: 6000, 2: 3500, 3: 2500, 4: 800}[layer]
    base *= (0.6 + 0.2 * tier)
    base *= _svc_jitter(sid)
    if sid in LOW_SAMPLE:
        base *= 0.03
    return base

def baseline_traffic(s):
    return expected_traffic(s["id"], s["tier"], s["layer"])

def baseline_latency(s):
    return random.uniform(8, 45)  # p50 ms

owner_names = ["Priya N.","Sam R.","Dana K.","Wei L.","Marco T.","Aisha B.",
               "Jonas P.","Lena H.","Omar S.","Tariq A.","Mei C.","Ruth G."]

def mk_service(s):
    sid, name, tier, team, layer, regions, datastores, lifecycle = s
    replicas = {}
    for r in regions:
        replicas[r] = max(1, int({0:14,1:10,2:8,3:6,4:3}[layer] * random.uniform(0.6,1.3)))
    slos = [{"id": f"{sid}-avail", "type": "availability", "target": 99.95, "window": "30d"}]
    if layer <= 2:
        slos.append({"id": f"{sid}-lat", "type": "latency", "target": 99.9, "window": "30d",
                     "thresholdMs": random.choice([200, 300, 500])})
    if team in ("Payments","Fulfillment"):
        slos.append({"id": f"{sid}-tput", "type": "throughput", "target": 99.0, "window": "7d"})
    owner = random.choice(owner_names); oncall = random.choice(owner_names)
    return {
        "id": sid, "name": name, "tier": tier, "team": team,
        "lifecycle": lifecycle, "layer": layer,
        "regions": regions, "datastores": datastores, "replicas": replicas,
        "inDegree": indeg.get(sid, 0),
        "expectedTraffic": round(expected_traffic(sid, tier, layer)),
        "owner": {"name": owner, "contact": owner.split()[0].lower() + "@acme.example"},
        "onCall": {"name": oncall, "contact": "@" + oncall.split()[0].lower() + " · pager-duty"},
        "links": {
            "runbook": f"https://runbooks.acme.example/{name}",
            "dashboard": f"https://grafana.acme.example/d/{name}",
            "repo": f"https://github.com/acme/{name}",
            "docs": f"https://docs.acme.example/services/{name}",
        },
        "about": ABOUT.get(sid, f"{name} is owned by the {team} team. It participates in the "
                                f"request path as a layer-{layer} service. See the linked docs for detail."),
        "slos": slos,
        "dependsOn": DEPS.get(sid, []),
    }

ABOUT = {
    "svc-auth": "auth-service issues and validates session tokens for every authenticated "
                "request across the platform. It is low-traffic relative to its blast radius "
                "and is depended on by nearly every user-facing service, which makes it tier-4 "
                "despite modest QPS.",
    "svc-payments": "payments-api authorizes and captures charges. It calls fraud-detection, "
                    "the ledger, and tax, and is on the critical checkout path. A connection pool "
                    "sized for steady-state load is its known capacity ceiling.",
    "svc-checkout": "checkout-api orchestrates the buy flow: cart pricing, tax, promotions, and "
                    "payment authorization. It degrades to a 'serve stale, then error' mode when "
                    "payments-api is unavailable.",
    "svc-order-orchestrator": "order-orchestrator coordinates order placement, inventory hold, "
                              "shipping, and ledger writes. Tier-4 because a failure here can drop "
                              "confirmed orders.",
}

services = [mk_service(s) for s in SVC]

# ----------------------------------------------------------------------------
# Edges + contracts + (some) human failure-behavior notes
# ----------------------------------------------------------------------------
OP_VERBS = {
    "svc-auth": [("ValidateToken","gRPC")], "svc-payments": [("AuthorizeCharge","gRPC"),("CaptureCharge","gRPC")],
    "svc-inventory": [("ReserveStock","gRPC")], "svc-pricing": [("GetPrice","gRPC")],
    "svc-tax": [("CalculateTax","REST")], "svc-fraud": [("ScoreTransaction","gRPC")],
    "svc-ledger": [("PostEntry","gRPC")], "svc-config": [("GetConfig","REST")],
    "svc-secrets": [("FetchSecret","gRPC")], "svc-notification": [("Enqueue","REST")],
    "svc-shipping": [("CreateLabel","REST")], "svc-catalog-api": [("GetProduct","REST")],
    "svc-search-indexer": [("Query","gRPC")], "svc-cart-service": [("GetCart","gRPC")],
}
FAIL_NOTES = {
    ("svc-checkout","svc-payments"): {
        "mode": "serves_stale_then_errors",
        "note": "serves cached authorization for 90s, then returns 503 to the BFF",
        "author": "@priya", "incidentRef": "INC-4471"},
    ("svc-order-orchestrator","svc-payments"): {
        "mode": "fails_closed",
        "note": "blocks order placement; does NOT retry to avoid double-charge",
        "author": "@dana", "incidentRef": "INC-4471"},
    ("svc-web-bff","svc-checkout"): {
        "mode": "degrades_gracefully",
        "note": "renders catalog-only browse mode; hides the buy button",
        "author": "@lena", "incidentRef": None},
    ("svc-checkout","svc-auth"): {
        "mode": "fails_closed",
        "note": "rejects the request; no anonymous checkout path exists",
        "author": "@omar", "incidentRef": None},
    ("svc-payments","svc-fraud"): {
        "mode": "fails_open",
        "note": "proceeds without a fraud score under a 200ms timeout (risk-accepted)",
        "author": "@sam", "incidentRef": "INC-3902"},
}

def sample_payload(target):
    samples = {
        "svc-payments": ({"amount": 4299, "currency": "USD", "token": "tok_9f2a…", "idempotencyKey": "idem_7b…"},
                          {"status": "authorized", "chargeId": "ch_1Kf…", "latencyMs": 38}),
        "svc-auth": ({"token": "eyJhbGci…", "scope": "checkout:write"},
                     {"valid": True, "subject": "usr_4471", "expiresIn": 540}),
        "svc-inventory": ({"sku": "SKU-22841", "qty": 2, "warehouse": "us-east-1"},
                          {"reserved": True, "holdId": "hold_88a…"}),
        "svc-pricing": ({"sku": "SKU-22841", "currency": "USD"},
                        {"price": 4299, "discounts": ["promo_summer"]}),
    }
    return samples.get(target, ({"id": "req_…"}, {"ok": True}))

edges = []
for caller, callees in DEPS.items():
    for callee in callees:
        eid = f"edge-{caller.replace('svc-','')}-{callee.replace('svc-','')}"
        req, resp = sample_payload(callee)
        ops = OP_VERBS.get(callee, [("Call", "REST")])
        edges.append({
            "id": eid, "source": caller, "target": callee,
            "contract": {
                "operations": [{"name": n, "method": m} for n, m in ops],
                "sampleRequest": req, "sampleResponse": resp,
            },
            "failureBehavior": FAIL_NOTES.get((caller, callee)),
        })

topology = {
    "currentUser": {"name": "You (Payments on-call)",
                    "ownedServiceIds": ["svc-checkout","svc-payments","svc-cart-service",
                                        "svc-fraud","svc-subscription","svc-tax"]},
    "meta": {"generatedAt": "2026-06-27T12:00:00Z",
             "window": {"start": timestamps[0], "end": timestamps[-1], "stepMinutes": 5},
             "regions": REGIONS, "teams": TEAMS,
             "tierLegend": {"1": "non-critical", "2": "standard", "3": "important", "4": "tier-0 / critical"}},
    "services": services,
    "edges": edges,
}

# ----------------------------------------------------------------------------
# Time series. burnFast/burnSlow drive terrain; health derived; golden derived.
# ----------------------------------------------------------------------------
def noise(scale=1.0):
    return random.gauss(0, scale)

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

# propagation schedule for the HERO incident: service -> (onset_hours_after_deploy, severity_peak)
HERO = {
    "svc-payments":           (0.0,  4.2),   # root: pool exhaustion
    "svc-checkout":           (0.12, 2.8),   # caller, ~7 min later
    "svc-order-orchestrator": (0.18, 3.1),   # caller, ~11 min later
    "svc-subscription":       (0.25, 1.9),   # caller, ~15 min later
    "svc-web-bff":            (0.30, 1.6),   # edge feels it
    "svc-mobile-bff":         (0.33, 1.5),
    "svc-api-gateway":        (0.40, 1.2),   # top of funnel, ~24 min later
}
# disconnected common-cause: eu-west-1 services degrade together (no dep path)
REGION_HIT = ["svc-search-api","svc-recommendation","svc-email-dispatch","svc-pricing"]

def hero_burn(sid, t_h):
    if sid not in HERO:
        return 0.0
    onset, peak = HERO[sid]
    start = HERO_DEPLOY_H + onset
    if t_h < start:
        return 0.0
    # rise over ~12 min, plateau, partial recovery after ~1.5h, still elevated at live
    dt_h = t_h - start
    rise = clamp(dt_h / 0.2, 0, 1)
    recov = clamp((dt_h - 1.5) / 2.0, 0, 0.6)  # recovers up to 60%
    return peak * rise * (1 - recov)

# Traffic anomalies (multiply the baseline). These move TRAFFIC only, not burn,
# so the height/cage read tells a story the health color does not.
FLASH_SALE = ("svc-storefront-api", "svc-catalog-api")  # spike, SLOs stay green
SHED_LOAD = ("svc-payments", "svc-checkout")          # dip as they degrade
def traffic_mult(sid, t_h):
    m = 1.0
    # Flash sale: ~2.6x plateau with smooth ramps; health unaffected (no burn).
    if sid in FLASH_SALE and FLASH_START_H <= t_h <= FLASH_END_H:
        up = clamp((t_h - FLASH_START_H) / 0.25, 0, 1)
        down = clamp((FLASH_END_H - t_h) / 0.25, 0, 1)
        m *= 1 + 1.6 * min(up, down)
    # Load-shedding: traffic sinks below the cage as the hero incident bites.
    if sid in SHED_LOAD:
        hb = hero_burn(sid, t_h)
        if hb > 0.5:
            m *= clamp(1 - 0.12 * hb, 0.45, 1.0)
    return m

def region_burn(sid, t_h):
    if sid not in REGION_HIT:
        return 0.0
    if t_h < REGION_START_H or t_h > REGION_END_H + 0.25:
        return 0.0
    mid = (REGION_START_H + REGION_END_H) / 2
    span = (REGION_END_H - REGION_START_H) / 2
    bell = math.exp(-((t_h - mid) ** 2) / (2 * (span * 0.6) ** 2))
    return 1.8 * bell

perService = {}
for s in services:
    sid = s["id"]
    bt = s["expectedTraffic"]  # stable baseline == the rendered "expected" cage
    bl = baseline_latency(s)
    low_sample = sid in LOW_SAMPLE  # demo confidence/translucency (already in bt)
    burnFast, burnSlow, health, sampleCount = [], [], [], []
    g_p50, g_p99, g_traf, g_err, g_sat = [], [], [], [], []
    for i in range(N):
        t_h = i * 5 / 60
        # baseline noise + chronic background for a couple services
        base = abs(noise(0.06))
        chronic = 0.0
        if sid == "svc-search-indexer":      # a quiet chronic slow-burn (a leak)
            chronic = 0.35 + 0.05 * math.sin(i / 12)
        bf = base + hero_burn(sid, t_h) + region_burn(sid, t_h)
        bs = chronic + 0.25 * (hero_burn(sid, t_h) > 0.5)  # chronic component when sustained
        burnFast.append(round(bf, 3))
        burnSlow.append(round(bs, 3))
        # health 0..1 from burn
        h = clamp(1.0 - 0.18 * bf - 0.10 * bs - abs(noise(0.01)), 0.02, 0.999)
        health.append(round(h, 3))
        # golden signals — traffic breathes mildly (diurnal) around the baseline
        # cage, with anomaly multipliers for the flash-sale spike / incident dip.
        diurnal = 1 + 0.12 * math.sin((i / N) * 2 * math.pi - 1.2)
        traf = bt * diurnal * traffic_mult(sid, t_h) * (1 + noise(0.03))
        g_traf.append(int(max(1, traf)))
        sampleCount.append(int(max(1, traf * 5 / 60)))  # ~ requests per 5-min window proxy
        lat50 = bl * (1 + 1.8 * bf) * (1 + noise(0.05))
        lat99 = lat50 * (2.4 + 2.5 * bf) * (1 + noise(0.05))
        g_p50.append(round(lat50, 1)); g_p99.append(round(lat99, 1))
        err = clamp(0.001 + 0.06 * bf + abs(noise(0.0008)), 0, 0.6)
        g_err.append(round(err, 4))
        sat = clamp(0.35 + 0.12 * math.sin(i/20) + 0.10 * bf + noise(0.02), 0.05, 0.99)
        g_sat.append(round(sat, 3))
    perSlo = {}
    for slo in s["slos"]:
        # SLO burn loosely tracks burnFast, scaled by type
        scale = {"availability": 1.0, "latency": 0.8, "throughput": 0.6}[slo["type"]]
        perSlo[slo["id"]] = [round(scale * bf, 3) for bf in burnFast]
    perService[sid] = {
        "burnFast": burnFast, "burnSlow": burnSlow, "health": health,
        "sampleCount": sampleCount,
        "golden": {"latencyP50": g_p50, "latencyP99": g_p99, "traffic": g_traf,
                   "errorRate": g_err, "saturation": g_sat},
        "perSlo": perSlo,
    }

# per-edge series: latency/error/health follow the callee's burn + a bit of caller
perEdge = {}
for e in edges:
    sc, tg = e["source"], e["target"]
    sh = perService[sc]["burnFast"]; th = perService[tg]["burnFast"]
    lat, err, tput, hth = [], [], [], []
    base = random.uniform(6, 30)
    cap = max(perService[sc]["golden"]["traffic"])
    for i in range(N):
        b = 0.7 * th[i] + 0.3 * sh[i]
        lat.append(round(base * (1 + 2.0 * b) * (1 + noise(0.05)), 1))
        err.append(round(clamp(0.001 + 0.05 * b, 0, 0.6), 4))
        tput.append(int(max(1, cap * 0.2 * (1 + noise(0.05)))))
        hth.append(round(clamp(1 - 0.2 * b, 0.02, 0.999), 3))
    perEdge[e["id"]] = {"latencyMs": lat, "errorRate": err, "throughput": tput, "health": hth}

timeseries = {"timestamps": timestamps, "perService": perService, "perEdge": perEdge}

# ----------------------------------------------------------------------------
# Events
# ----------------------------------------------------------------------------
def ts(h):
    return timestamps[idx_for_hours(h)]

events = {"events": [
    {"id": "evt-deploy-payments", "serviceId": "svc-payments", "timestamp": ts(HERO_DEPLOY_H),
     "type": "deploy", "title": "Deploy payments-api v412", "version": "v412", "author": "@dev-ml",
     "detail": "Reduced DB connection-pool max from 200 to 80 (config cleanup). Root cause of INC-5012."},
    {"id": "evt-scale-checkout", "serviceId": "svc-checkout", "timestamp": ts(HERO_DEPLOY_H + 0.22),
     "type": "scale", "title": "Autoscale checkout-api +6 pods", "author": "system",
     "detail": "HPA reacted to rising latency; did not resolve (downstream-bound)."},
    {"id": "evt-deploy-search", "serviceId": "svc-search-api", "timestamp": ts(2.0),
     "type": "deploy", "title": "Deploy search-api v88", "version": "v88", "author": "@wei",
     "detail": "Routine deploy, no incident."},
    {"id": "evt-config-flags", "serviceId": "svc-feature-flags", "timestamp": ts(7.4),
     "type": "config", "title": "Flag rollout: reco_v2 = 25%", "author": "@growth",
     "detail": "Gradual rollout of new recommendation model."},
    {"id": "evt-incident-region", "serviceId": "svc-search-api", "timestamp": ts(REGION_START_H),
     "type": "incident", "title": "eu-west-1 elevated errors (multi-service)", "author": "system",
     "detail": "Region-correlated degradation across unrelated services. See INC-4990."},
    {"id": "evt-deploy-ledger", "serviceId": "svc-ledger", "timestamp": ts(4.1),
     "type": "deploy", "title": "Deploy ledger-service v203", "version": "v203", "author": "@sam",
     "detail": "Schema migration, no impact."},
    {"id": "evt-config-payments-postmortem", "serviceId": "svc-payments", "timestamp": ts(HERO_DEPLOY_H + 1.6),
     "type": "config", "title": "Mitigation: pool max raised 80 -> 160", "author": "@priya",
     "detail": "Partial mitigation applied during INC-5012."},
]}

# ----------------------------------------------------------------------------
# Incidents
# ----------------------------------------------------------------------------
incidents = {
    "active": [
        {"id": "INC-5012", "serviceId": "svc-payments", "title": "payments-api connection-pool exhaustion",
         "startedAt": ts(HERO_DEPLOY_H + 0.05), "severity": "SEV2", "status": "mitigating",
         "summary": "v412 lowered the DB pool ceiling; checkout and order-orchestrator degraded downstream.",
         "impactedServices": list(HERO.keys())},
    ],
    "resolved": [
        {"id": "INC-4990", "serviceId": "svc-search-api", "title": "eu-west-1 multi-service error spike",
         "startedAt": ts(REGION_START_H), "resolvedAt": ts(REGION_END_H + 0.2), "severity": "SEV3",
         "summary": "Region-local networking blip degraded several unrelated eu-west-1 services simultaneously.",
         "impactedServices": REGION_HIT},
        {"id": "INC-4471", "serviceId": "svc-checkout", "title": "checkout failures during payments outage",
         "startedAt": "2026-06-20T14:02:00Z", "resolvedAt": "2026-06-20T15:18:00Z", "severity": "SEV2",
         "summary": "Prior payments incident; origin of the documented checkout->payments failure behavior."},
        {"id": "INC-3902", "serviceId": "svc-payments", "title": "fraud-detection timeout storm",
         "startedAt": "2026-06-11T09:40:00Z", "resolvedAt": "2026-06-11T10:05:00Z", "severity": "SEV3",
         "summary": "payments fail-open under fraud timeouts; documented on the payments->fraud edge."},
    ],
}

# ----------------------------------------------------------------------------
# Write files
# ----------------------------------------------------------------------------
os.makedirs("data", exist_ok=True)
def dump(name, obj):
    with open(f"data/{name}", "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    sz = os.path.getsize(f"data/{name}")
    print(f"  data/{name:22s} {sz/1024:8.1f} KB")

print("Wrote:")
dump("topology.json", topology)
dump("timeseries.json", timeseries)
dump("events.json", events)
dump("incidents.json", incidents)
print(f"\nServices: {len(services)}  Edges: {len(edges)}  Timesteps: {N}")
print(f"Hub (auth-service) in-degree: {indeg['svc-auth']}")
print(f"Max in-degree service: {max(indeg, key=indeg.get)} ({max(indeg.values())})")
