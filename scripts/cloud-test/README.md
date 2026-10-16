# CRM06 local synthetic application

Run the **actual React CRM**, the existing ERP TEST HTTP order adapter and the
existing customer product request service/router with fictional provider/ERP
boundaries:

```sh
node scripts/cloud-test/server.mjs --synthetic --port 0
```

The command prints its ephemeral `http://127.0.0.1:<port>` address and writes
`work/cloud-test/server.json`. The execution environment must allow loopback
listeners. No fixed or public port is opened. The development offline guard
rejects outbound HTTP, external sockets, database ports and fixed listeners;
Vite runs in the same process with WebSockets disabled. Deployment environment
and credential files are not loaded.

Vite's CSS-module client is replaced by a local stylesheet-only runtime, because
the normal development client otherwise attempts an HMR WebSocket even with
HMR disabled. Application modules and API code are unchanged by this fixture;
source changes require a full page reload.

Use CRM `manager`, `assigned` or `stranger`; ERP `erp-test` or `erp-other`.
Every account uses the clearly fictional password `synthetic-only`. These are
local fixture identities and grants only, with no connection to real accounts.

The two fictional customers and two TRY products support customer selection →
catalogue product selection → quantity → draft create → independent readback.
The actual CRM browser journal supports reopening the same draft after refresh.
`work/cloud-test/native-orders.json` is an atomic file journal that also survives
server restart. It is not ERP/SQL persistence. Identical UUID/payload retries
return the same record; changed payloads or another ERP actor are rejected.

The manager may also prepare a `/katalog` capability via the normal staff UI.
This uses the existing customer request service and HTTP routes, including
assignment checks, revision conflicts and one saved interest request. These
records live in `work/cloud-test/customer-requests.json`.

Every response carries `x-melisa-synthetic: 1`. `/api/health` reports the mode.
The manager-only `/api/live/__synthetic/status` returns native create/read
counters and saved UUIDs for browser evidence. No route sends messages, calls
paid AI, creates sales/payments/reservations or connects to Vega/SQL/LIVE.

```sh
node --test scripts/cloud-test/server.test.mjs
node --test apps/gateway/src/routes/customerProductRequestCloudE2E.test.mjs
```

The first command verifies HTTP authorization, customer/price binding,
idempotency, conflicting retries, wrong ERP actor, no outbound access and
restart persistence. The second **reuses PR16's existing HTTP acceptance** for
the customer request flow instead of copying it. Cloud synthetic evidence is
separate from real ERP database, normal deployed session and human acceptance.
