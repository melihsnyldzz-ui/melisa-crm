# Design QA — customer product request, 12 October 2026

Source: docs/design/customer-catalog-flow-20261012.png,1536×1024; compare only right catalog card approximatelyx895–1352/y130–971. Left WhatsApp conversation is a concept, not an implemented/send surface.

Actual: docs/evidence/crm/2026-10-12-customer-product-request/customer-catalog-source-blocked-390.png from immutable sourcefb34c29. Source and rendered screenshot viewed together. Normal Semih UI generated the genuine7733 capability; actual ERP source rejected/timed out, no demo products substituted.

CSSviewport390×844, scrollWidth390; two columns173px each. Browser viewport API requested351×760 to compensate observed0.9 screenshot/CSS scale. Physical screenshot and CSS coordinates are distinct; no fabricated pixel-perfect match. Header changed from solid green to source white/green wordmark, neutral caption; source card max455CSSpx. Existing local Inter/phosphor leaf/search/x/arrow and source photos are used; no generated product assets or fake0–2age/category applied.

| Required surface | Result |
| --- | --- |
| Desktop catalog / header / navigation | White/green header, capped455 card and source layout implemented; real filled catalog render blocked. |
| Mobile390 catalog / two columns / sticky action | Real CSS390 no overflow, two columns, safe error/disabled action; no real product photo cards returned. |
| Search / category / selected cards | API/model guard and paged query tested offline; real search/category/selected render blocked. |
| Review / editable quantity / remove / reopen | Source/controller tests pass; actual server real-product review blocked. |
| Submit / durable success / assigned staff visibility | Service/router atomic/idempotent guards tested; no actual request submitted, real success/staff request render blocked. |

Iterations: inspected source; removed dark header, aligned455 cap; independent review corrected missing state endpoint; actual browser exposed ERP catalogue503; kept honest error rather than fake product cards. Next QA is the same five surfaces after ERP R3 read succeeds, then compare original photo pixels and mobile/desktop action geometry against the selected right card.

final result: blocked — actual ERP catalogue list unavailable; no complete visual or human acceptance.
