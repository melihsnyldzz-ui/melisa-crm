# CRM completion TEST runtime

Current source branch: codex/crm-agents-on-completion-20261003, PR3, based on feature/crm-completion. Existing LIVE runtimes remain separate. Current acceptance is in CRM_STATUS.md; historical evidence below keeps its original date/scope.

## Windows user-logon startup — 2026-10-04

The installed `Melisa-CRM-TEST-Completion` task runs `test-session-launcher.ps1` as the existing user with an interactive LOGON trigger, Limited privilege, one-instance policy and bounded startup recovery. It adopts only processes matching the configured owner SID, pinned Node executable/hash, exact script/config, creation time and loopback ports. The launcher watches the CRM supervisor and the separate native ERP draft process; it does not restart LIVE services. Native `/test-health` must identify the configured package/source and the exact bounded TEST database before adoption. An identity mismatch fails closed; a transient connection failure has a readiness window before an identically revalidated process may be recovered.

The existing private JSON config stays outside Git at `C:\Sirket\CRM\runtime\test-completion\startup-config.json`. Required absolute path fields: RepoRoot, NodePath, BaselineEnv, ErpApiRoot, ErpBaselineEnv, PhotoRoot, RuntimeDir, LogDir, NativeRelease and NativeConfig. Required identity fields: OwnerSid, NodeSha256, NativeSourceCommit, NativePackageId, ExpectedDatabase and TaskName. These are references/public identity metadata, never credential values. Runtime, logs, protected env files and native private config cannot be inside the checkout. Verify current owner and the signed/installed Node executable before preparing this file; a Node update requires deliberate hash refresh after identity verification.

Operator commands, already executed for the current installation:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\deploy\manage-test-startup.ps1 -Action Install -ConfigPath C:\Sirket\CRM\runtime\test-completion\startup-config.json
powershell.exe -NoProfile -NonInteractive -File .\deploy\manage-test-startup.ps1 -Action Inspect -ConfigPath C:\Sirket\CRM\runtime\test-completion\startup-config.json
```

`Remove` unregisters only the exact named task/action/owner; it does not stop an existing launcher or runtime. A separate verified process stop is needed when retiring the watchdog. Repeated task starts reuse the existing launcher and processes rather than creating duplicates.

The existing official, signed Docker Desktop executable was added to the current user's standard Windows `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry `Docker Desktop`. No daemon, service or container restart was performed. The previous absent entry, exact configured value and rollback instructions are recorded outside Git in `logs/acceptance-20261004/docker-logon-startup-proof.json`; remove only the unchanged owned entry, restoring the previous value if one existed. Docker's application settings file was not rewritten. Chatwoot's existing container restart policy is `always`. The CRM incoming reader retries every45s and the visible inbox every20s if Chatwoot becomes ready later; the launcher does not manage Docker or Chatwoot itself.

Current acceptance: native ERP and CRM supervisor were stopped separately after ownership verification and recovered automatically; the normal authenticated CRM inbox and real AI suggestion worked afterwards. **A real Windows logon/reboot acceptance is still pending.** These are user-session tasks, not pre-logon/headless operation; sleep, power loss and logoff can interrupt availability. Do not reboot or log the user off merely to prove startup while other work is open.

## Human-reviewed AI TEST setting

`AISalesMode` in the outside-Git startup config defaults to `off`; only `off` and `copilot` are allowed. The user authorized reuse of the existing server-side OpenAI key for the7733 TEST suggestion scope. The installed config selects `copilot`; the gateway forces conversation55 **and** the actual trusted DTO phone7733. The baseline env cannot broaden this scope. Policy remains unset; products=[] means the current model path only drafts greeting/needs text, not real product/price offers. Human review and a separate normal Send click are required; no autonomous send or ERP write exists.

## Supervisor and existing ERP contract

The TEST runtime serves UI 62400, gateway 62401, catalogue adapter 62402, and ERP draft adapter 62403 on loopback only. `CRM_BASELINE_ENV` identifies the existing protected gateway environment file; `CRM_ERP_API_ROOT` identifies the existing native ERP API directory. Credentials are read into process memory and must not be copied into this repository.

Build the frontend with VITE_CRM_TEST=1. Start deploy/test-supervisor.mjs with both runtime paths provided as environment variables. It starts the three TEST processes and restarts a failed child after three seconds. State defaults to sibling `runtime/test-completion`, logs to sibling `logs/test-completion`; `CRM_TEST_RUNTIME_DIR` / `CRM_TEST_LOG_DIR` overrides must remain outside the checkout. Process identity is recorded in `processes.json`. TEST journal is forced beneath that validated runtime even if baseline dotenv contains another journal path. It refuses occupied ports. It does not install a Windows startup task or alter LIVE services.

For the canonical TEST reader, optional `CRM_ERP_BASELINE_ENV` is read privately before native ERP imports; catalogue SQL is forced read-only. Optional `CRM_ERP_PHOTO_ROOT` reads existing product files without modifying them. Photo bytes require a verified CRM read lease against `CRM_TEST_GATEWAY_ORIGIN` (default 62401), exact active-primary metadata in MELISA_ERP_V2, realpath containment and valid image contents. The TEST gateway explicitly forwards its CRM lease only to the loopback 62402 photo adapter. The legacy public 4100 asset path retains its default headers.

Outbound is limited to the existing approved 7733 test peer. The incoming reader fetches that same peer only every 45 seconds, imports recent inbound messages into conversation 55, and reuses provider-ID reconciliation. It sends no WhatsApp messages and does not change provider webhook settings. Its authenticated read API is documented at https://waapi.readme.io/reference/fetch-messages.

Catalogue products and photographs use the actual existing Vega source and protected photo path. Recorded selling prices can be included in a PDF in their recorded currency, without conversion. The PDF labels them recorded prices and keeps stock unknown. This does not assert current availability or delivery commitments.

Current ERP login uses existing native authentication at the separate loopback 62404 draft API. The 62403 adapter validates `/test-health` for CANONICAL_TEST, purpose crm-order-draft-only and exactly MELISA_ERP_SIRKET_TEST_20260929_01 before forwarding. Native sales.view/sales.create and the separate CRM conversation/send permissions are enforced. Only TEST customer 593, conversation 55, peer 7733 and independently verified product scope can create/read a draft. No finalize, invoice, stock movement or ledger route is mounted. The only provisioned product is vega-161466 / 41140 SÜPERMİNİ, native product 301982, TRY 196. Other catalogue products are not yet provisioned for ordering.

Pending UUID, frozen payload and actor identity survive form close/reopen and page reload in per-session storage; credentials do not. Resume reads the same UUID first. Only a verified 404 allows resubmitting that unchanged request. A read failure keeps the original request pending. A resolved receipt is retained until the user explicitly starts another TEST order.

ERP package CRM-ORDER-DRAFT-TEST-20261004-02 comes from canonical ERP commit 4fb9eab and listens on 127.0.0.1:62404. It is separate from the daily ERP 4144/4146/5194 package and from the CRM supervisor. Its source entry point is apps/api/start-crm-order-test.mjs; the private config stays outside Git. See the canonical ERP docs/erp-v2/crm-test-order-draft.md for provisioning, owned startup/restart and rollback. The new TEST user-logon launcher watches this process; actual logon acceptance remains pending.

2026-10-04 environment correction: the canonical native ERP release rejects writes to the old FULL_TEST target (`SQL_WRITE_TARGET_INVALID`). The current adapter was replaced with the bounded contract above; normal daily TEST ERP routing was preserved. Native account login, real 2-unit / TRY 392 draft create/read and user acceptance passed on 2026-10-04. The current audit guard initially rolled back creation; ERP a3fa8fc added only the verified CRM draft audit INSERT case while preserving existing rules. Same-UUID replay stayed one order/audit; stock 96 and customer balance 0 remained, with no stock/customer movements. Different-UUID second draft (1 unit / TRY 196) was observed separately. Historical 2026-10-03 proof below remains valid for its original FULL_TEST runtime, not the current contract. Do not disable native database/write-scope protections.

## Historical 2026-10-03 acceptance — original environment only

Real verification on 2026-10-03: PNG/PDF/TXT were accepted and recorded on the approved test peer; assignment changed and was restored; protected product photographs decoded; SQL catalogue returned 1085 photo-referenced products; a four-line native ERP TEST draft persisted with four units and TRY 510.25. Incoming texts and a photograph missing from Chatwoot were reconciled without duplicate message records. No real customer bulk operation was performed.

Remaining environment limits: ERP credentials are held in the open form/session memory only and must be re-entered after closing or reloading that ERP form. This supervisor is not a reboot/logoff startup guarantee. Browser responsive layout was inspected in the available narrow in-app viewport; a physical phone was not available.

The four selected products produced a priced PDF in the UI and their exact recorded prices were added to a sendable chat draft without sending it. Automated local capture of the browser download timed out, so independent downloaded-PDF rendering is not claimed. Offline verification passed 233 frontend, 210 gateway, and one SQL aggregate conversion test; TEST frontend build passed.
