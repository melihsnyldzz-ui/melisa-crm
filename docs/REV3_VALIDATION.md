# New repository candidate validation

NOT_INSTALLED. The inherited sealed-workspace 650 DEV tests were not claimed as new-repository tests.

In apps/gateway: `node --import ../../tests/offline-test-guard.mjs --test "src/**/*.test.js"`: 209/209 PASS. In apps/frontend: `npm.cmd run build`: PASS; `node --import ../../tests/offline-test-guard.mjs --import ../../tests/bounded-test-hooks.mjs --test "tests/*.test.mjs" src/catalog/model.test.js`: 230/230 PASS. At root: `node --import ./tests/offline-test-guard.mjs --test tests/erp-contract.test.mjs`: 2/2 PASS. Total 441 isolated tests. Selected frontend subset also passed 61/61 and is included in the broader 230.

Minimal test/path adaptations: sessionRestart child points to the new root tests guard; bounded resolver/hooks inherited from sealed REV3 use the new frontend root and retain source/hash/count and within-root guards. The first broad frontend run was blocked by ancestor enumeration; bounded resolver passed without security or permission changes. Baseline ERP fixture initially failed against REV3's stricter contract; candidate fixture now uses synthetic vega ID, both database identities, verified pagination and filters. The contracts barrel exports ERP_PRODUCT_DATABASE for the candidate only. Application rules were not weakened.

Installer source and separate ERP-side application were not executed or hosted. NORMAL_OWNER_REQUIRED, path/manifest resealing, actual WhatsApp/media acceptance, ERP writes and rollback acceptance remain unverified. No feature is green without real acceptance.

Secret scan checks staged blobs plus every commit tree on every local branch, forbidden paths, private keys, provider key formats, JWTs and credential-bearing URLs. Synthetic test literals are not runtime credentials. No environments or customer exports were copied. This heuristic scan is evidence, not a universal proof; independent review remains required.
