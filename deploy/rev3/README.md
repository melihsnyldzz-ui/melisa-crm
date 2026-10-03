# Retained REV3 installer — DO NOT EXECUTE

Copied only sealed orchestration/control script sources. No environment, runtime journal, customer evidence, fault fixture tree, or ERP application was imported. Candidate ERP-side CRM adapter must remain hosted with the separate photo ERP and requires separate review; its implementation was not duplicated here.

Original absolute paths, owner/SID checks, approval and manifest guards are preserved. Old manifests and before-images are not operationally present under these new paths. Entry scripts may reference missing payloads deliberately; importing is not installation readiness. Do not invoke any retained script in this repo.

Needed: new repo-to-runtime mapping, independent manifests/rollback before-images, correct NORMAL_OWNER_REQUIRED owner, secure credentials and actual acceptance. Current known UI4212 owner mismatch remains unresolved. Diagnostic helper from CRM_METADATA_DIAGNOSTICS_DEV_20261002 excluded.

Inherited 650 DEV test result belongs to the old sealed workspace and is not a new-repo test result.
