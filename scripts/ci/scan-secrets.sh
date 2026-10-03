#!/usr/bin/env bash
set -euo pipefail
version=8.30.1
archive="gitleaks_${version}_linux_x64.tar.gz"
checksum=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
scan_dir="$(mktemp -d)"
trap 'rm -rf -- "$scan_dir"' EXIT
curl --fail --location --silent --show-error --retry 3 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${archive}" \
  --output "$scan_dir/$archive"
printf '%s  %s\n' "$checksum" "$scan_dir/$archive" | sha256sum --check --status
tar -xzf "$scan_dir/$archive" -C "$scan_dir" gitleaks
# Full history reachable from the checkout HEAD, including PR merge ancestry.
# No tokens, provider credentials, license key or upload of reports are needed.
set +e
"$scan_dir/gitleaks" git . --redact=100 --no-banner --log-level error \
  --report-format json --report-path "$scan_dir/findings.json"
scan_exit=$?
set -e
python3 - "$scan_dir/findings.json" <<'PY'
import json, pathlib, sys
report = pathlib.Path(sys.argv[1])
if report.exists():
    findings = json.loads(report.read_text())
    print(f"Secret scan: {len(findings)} unapproved findings")
    for finding in findings:
        # Deliberately omit Secret, Match, context, author and commit message.
        print(f"{finding['File']}:{finding['StartLine']} [{finding['RuleID']}]")
PY
exit "$scan_exit"
