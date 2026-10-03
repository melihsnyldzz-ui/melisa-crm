# CRM completion TEST runtime

Source branch: feature/crm-completion, based on candidate/rev3. Existing LIVE runtimes remain separate.

The TEST runtime serves UI 62400, gateway 62401, catalogue adapter 62402, and ERP draft adapter 62403 on loopback only. `CRM_BASELINE_ENV` identifies the existing protected gateway environment file; `CRM_ERP_API_ROOT` identifies the existing native ERP API directory. Credentials are read into process memory and must not be copied into this repository.

Build the frontend with VITE_CRM_TEST=1. Start deploy/test-supervisor.mjs with both runtime paths provided as environment variables. It starts the three TEST processes, retains logs under ignored runtime/test-completion, and restarts a failed child after three seconds. It refuses occupied ports. It does not install a Windows startup task or alter LIVE services.

Outbound is limited to the existing approved 7733 test peer. The incoming reader fetches that same peer only every 45 seconds, imports recent inbound messages into conversation 55, and reuses provider-ID reconciliation. It sends no WhatsApp messages and does not change provider webhook settings. Its authenticated read API is documented at https://waapi.readme.io/reference/fetch-messages.

Catalogue products and photographs use the actual existing Vega source and protected photo path. Recorded selling prices can be included in a PDF in their recorded currency, without conversion. The PDF labels them recorded prices and keeps stock unknown. This does not assert current availability or delivery commitments.

ERP login uses existing native authentication. Draft creation uses the native sales order service against exactly MELISA_ERP_FULL_TEST_20260916, requires native sales.create, maps exact SKUs, and has no confirm/finalize or stock movement route. Request identifiers reconcile duplicate submissions. CRM managers can read only the CRM TEST draft receipts, which survive service/UI restarts.

Real verification on 2026-10-03: PNG/PDF/TXT were accepted and recorded on the approved test peer; assignment changed and was restored; protected product photographs decoded; SQL catalogue returned 1085 photo-referenced products; a four-line native ERP TEST draft persisted with four units and TRY 510.25. Incoming texts and a photograph missing from Chatwoot were reconciled without duplicate message records. No real customer bulk operation was performed.

Remaining environment limits: ERP credentials are held in the open form/session memory only and must be re-entered after closing or reloading that ERP form. This supervisor is not a reboot/logoff startup guarantee. Browser responsive layout was inspected in the available narrow in-app viewport; a physical phone was not available.

The four selected products produced a priced PDF in the UI and their exact recorded prices were added to a sendable chat draft without sending it. Automated local capture of the browser download timed out, so independent downloaded-PDF rendering is not claimed. Offline verification passed 233 frontend, 210 gateway, and one SQL aggregate conversion test; TEST frontend build passed.
