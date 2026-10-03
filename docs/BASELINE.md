# Isolated CRM baseline

Initial commit: c2f1682bd3839b60d3a038f6240df9a55f6ae89f. Verified scope: reproducible frontend assets, offline gateway tests and synthetic ERP contract. No live acceptance or deployment claim.

Frontend export artifact 4076f103e44305d19e2ed3bcaf233bb770e51ccd, original baseline f020d991a49acd1ae17c0c1398e3c1a2535e784a; export has no Git history. ERP repository HEAD observed 2cb215acfac8d17a2415b8da88074c09d6222439. No ERP application was copied.

Allowlist: frontend src/scripts/worker/tests/server JavaScript, JSX, MJS and CSS; index, package manifests, Vite config, hosting descriptor, wallpaper. Gateway src JS/MJS and package manifests. No environments, runtime, uploads, logs, archives, customer exports or old Git history. Legacy frontend server modules are retained only for source/test closure and were never started.

Adaptations only in the new copy: frontend build uses Vite --configLoader native because the bundled config loader enumerates a denied ancestor directory; two route tests await listening; hardcoded operator recipient is replaced throughout gateway source/tests by a synthetic fixture recipient; contracts package re-exports the unchanged ERP identity constants. Sending gates remain false with placeholder environment. This gateway is intentionally not an operational drop-in configuration.

npm ci --offline --ignore-scripts --no-audit --no-fund succeeded for gateway (139 packages). Frontend offline ci failed ENOTCACHED for Rollup; registry retry was interrupted. Copied only local node_modules from sealed DEV frontend, verified all 91 installed dependency versions against baseline lockfile; 49 platform optional packages absent. Package integrity against registry tarballs was not re-established. Dependencies/build outputs are ignored.

Commands: npm.cmd --prefix apps/frontend run build PASS. node --import ./tests/offline-test-guard.mjs --test "apps/gateway/src/**/*.test.js" tests/erp-contract.test.mjs: 109/109 PASS. In apps/frontend: node --import ../../tests/offline-test-guard.mjs --test tests/sites-worker.test.mjs tests/gateway.test.mjs src/catalog/model.test.js: 47/47 PASS. Initial gateway run 105/107; waiting fixes resolved the two listener races.

HTTP read-only comparison: 4212 / is 200 and matches rebuilt index; /index.html is 404. Both named JS and CSS routes are 200 and bit-identical. All three rebuilt hashes equal the supplied hashes. See baseline-verification.json. This proves asset parity, not real customer interaction, new media delivery, or ERP write acceptance.

155 selected source files and serving sibling files hashed before copy and unchanged after verification. Original ERP Git HEAD remains observed only, not imported. Existing security denials were respected.

ERP dependency: gateway services/catalogBridge.mjs, catalogRouter.mjs, crmCatalogAccess.mjs, userErpBinding.mjs and erpSourceContract.mjs define the CRM-side boundary. Separate photo ERP at 4100 must implement /api/crm-catalog/products and identity-verified read sessions; product/stock source VEGA2026, image metadata MELISA_ERP_V2. No ERP SQL or live transport was opened. Synthetic tests verify fail-closed deployment and sanitized identity-verified response. Missing server-side route/session or credential provisioning stays a deployment blocker.

The test guard clears provider/database environment and permits connections only to ephemeral loopback listeners created by that test process. Tests use mock transports or synthetic temp journals; neither server.js nor SQL/provider smoke scripts was executed. Gateway smoke scripts still reference the old monorepo layout and are not available/safe in this repo; do not run them.
