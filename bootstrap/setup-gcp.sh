#!/usr/bin/env bash
#
# Provisions a GCP project end-to-end for one environment (dev or prod):
#   1. Reuses or creates the GCP project
#   2. Links the billing account
#   3. Enables required APIs
#   4. Creates the Firestore database
#   5. Adds Firebase to the project
#   6. Reuses or creates the web app
#   7. Pulls the Firebase SDK config
#
# Idempotent — every step checks existence before creating, so re-running on a
# partially-set-up project finishes the missing pieces without disturbing what
# already exists.
#
# Logs go to stderr. Stdout emits a single normalized JSON line at the end:
#   {"projectId":"...","apiKey":"...","authDomain":"...","storageBucket":"...",
#    "messagingSenderId":"...","appId":"..."}
# The caller (typically /onboard) parses this and writes the keys back into
# bootstrap/config.env under the FIREBASE_*_DEV or FIREBASE_*_PROD block.
#
# Usage:
#   bash bootstrap/setup-gcp.sh dev
#   bash bootstrap/setup-gcp.sh prod
#
# Reads from bootstrap/config.env (must already exist):
#   PROJECT_NAME, GCP_PROJECT_DEV / GCP_PROJECT_PROD, REGION, BILLING_ACCOUNT.
#
# Prereqs: gcloud + firebase CLIs installed and authenticated.

set -euo pipefail

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  dev|prod) ;;
  *) echo "usage: $0 dev|prod" >&2; exit 2 ;;
esac

# Resolve repo root from script location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/bootstrap/config.env"

if [[ ! -f "$CONFIG" ]]; then
  echo "config.env not found at $CONFIG" >&2
  echo "Copy bootstrap/config.example.env first, or run /onboard." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a

# Resolve the env-specific project ID.
if [[ "$ENV_NAME" == "dev" ]]; then
  PROJECT_ID="${GCP_PROJECT_DEV:-}"
else
  PROJECT_ID="${GCP_PROJECT_PROD:-}"
fi

# Required values.
required=(PROJECT_NAME REGION BILLING_ACCOUNT)
missing=()
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("$key")
  fi
done
if [[ -z "$PROJECT_ID" ]]; then
  if [[ "$ENV_NAME" == "dev" ]]; then
    missing+=("GCP_PROJECT_DEV")
  else
    missing+=("GCP_PROJECT_PROD")
  fi
fi
if (( ${#missing[@]} > 0 )); then
  echo "Missing required values in $CONFIG:" >&2
  for k in "${missing[@]}"; do echo "  $k" >&2; done
  exit 1
fi

# Helpers — log to stderr; stdout is reserved for the final JSON.
log()  { echo "[$ENV_NAME] $*" >&2; }
fail() { echo "[$ENV_NAME] error: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 not on PATH. Install it first."
}
require_cmd gcloud
require_cmd firebase
require_cmd python3

# 1. Auth check — gcloud must have an active account.
if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q '@'; then
  fail "no active gcloud account. Run: gcloud auth login"
fi
# Firebase CLI auth uses its own login; surface a clearer error than the raw CLI.
if ! firebase projects:list >/dev/null 2>&1; then
  fail "firebase CLI not authenticated. Run: firebase login"
fi

# 2. Project — describe; create if missing.
if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  log "Project $PROJECT_ID already exists — reusing."
else
  # GCP display names reject parentheses — "Name dev", not "Name (dev)".
  log "Creating project $PROJECT_ID (name: \"$PROJECT_NAME $ENV_NAME\")..."
  if ! gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME $ENV_NAME" 2>/dev/null; then
    fail "could not create project $PROJECT_ID. Either the ID is taken globally, or you've hit your project quota. Pick a different ID, or request a quota bump at console.cloud.google.com/iam-admin/quotas."
  fi
fi

# 3. Billing link.
current_billing="$(gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
if [[ "$current_billing" == "billingAccounts/$BILLING_ACCOUNT" ]]; then
  log "Billing already linked to $BILLING_ACCOUNT."
else
  log "Linking billing account $BILLING_ACCOUNT..."
  gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" >/dev/null \
    || fail "billing link failed. Check that $BILLING_ACCOUNT is open and you have billing.user on it."
fi

# 4. Enable APIs (gcloud is idempotent — already-enabled APIs are no-ops).
APIS=(
  firestore.googleapis.com
  firebase.googleapis.com
  identitytoolkit.googleapis.com
  pubsub.googleapis.com
  run.googleapis.com
  cloudbuild.googleapis.com
  iam.googleapis.com
  secretmanager.googleapis.com
)
log "Enabling APIs (this can take ~30s)..."
gcloud services enable --project="$PROJECT_ID" "${APIS[@]}" >/dev/null

# 5. Firestore database — one (default) DB per project.
if gcloud firestore databases describe --project="$PROJECT_ID" --database='(default)' >/dev/null 2>&1; then
  log "Firestore database already exists."
else
  log "Creating Firestore database in $REGION..."
  gcloud firestore databases create --project="$PROJECT_ID" --location="$REGION" >/dev/null \
    || fail "Firestore create failed. Check that REGION=$REGION is valid (https://cloud.google.com/firestore/docs/locations)."
fi

# 6. Firebase add — only if not already a Firebase project.
firebase_listed="$(firebase projects:list --json 2>/dev/null || echo '{}')"
if echo "$firebase_listed" | python3 -c '
import json, sys
data = json.loads(sys.stdin.read() or "{}")
projects = data.get("result") or []
target = sys.argv[1]
sys.exit(0 if any(p.get("projectId") == target for p in projects) else 1)
' "$PROJECT_ID"; then
  log "Firebase already enabled on this project."
else
  log "Adding Firebase to $PROJECT_ID..."
  firebase projects:addfirebase "$PROJECT_ID" >/dev/null \
    || fail "firebase projects:addfirebase failed. The Firebase Management API may still be propagating from step 4 — wait 30s and re-run."
fi

# 7. Web app — reuse first existing web app, otherwise create one.
existing_web="$(firebase apps:list WEB --project="$PROJECT_ID" --json 2>/dev/null || echo '{}')"
APP_ID="$(echo "$existing_web" | python3 -c '
import json, sys
data = json.loads(sys.stdin.read() or "{}")
apps = data.get("result") or []
print(apps[0].get("appId", "") if apps else "")
')"

if [[ -n "$APP_ID" ]]; then
  log "Reusing existing web app $APP_ID."
else
  log "Creating web app..."
  create_out="$(firebase apps:create WEB "$PROJECT_NAME ($ENV_NAME)" --project="$PROJECT_ID" --json)" \
    || fail "firebase apps:create failed."
  APP_ID="$(echo "$create_out" | python3 -c '
import json, sys
data = json.loads(sys.stdin.read())
print(data.get("result", {}).get("appId", ""))
')"
  if [[ -z "$APP_ID" ]]; then
    fail "could not parse app ID from firebase apps:create output"
  fi
fi

# 8. Authorized domains — without this, signInWithPopup and password sign-in
# both fail in deployed dev/prod with `auth/unauthorized-domain`. Firebase
# pre-seeds localhost + <project>.firebaseapp.com + <project>.web.app, so we
# only need to add the custom domain (and its www. variant) for this env.
# DEV_DOMAIN/PROD_DOMAIN are optional in config.env — skip cleanly if unset.
if [[ "$ENV_NAME" == "dev" ]]; then
  CUSTOM_DOMAIN="${DEV_DOMAIN:-}"
else
  CUSTOM_DOMAIN="${PROD_DOMAIN:-}"
fi

if [[ -z "$CUSTOM_DOMAIN" ]]; then
  log "No $( [[ "$ENV_NAME" == "dev" ]] && echo DEV_DOMAIN || echo PROD_DOMAIN ) in config.env — skipping authorized-domain update."
else
  log "Ensuring $CUSTOM_DOMAIN + www.$CUSTOM_DOMAIN are authorized for Firebase Auth..."
  access_token="$(gcloud auth print-access-token 2>/dev/null)" \
    || fail "could not get gcloud access token. Run: gcloud auth login"

  # User-credential calls to identitytoolkit need an explicit quota project.
  current_cfg="$(curl -sS \
      -H "Authorization: Bearer $access_token" \
      -H "x-goog-user-project: $PROJECT_ID" \
      "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/config" 2>/dev/null)" \
    || fail "could not reach the Identity Toolkit API for $PROJECT_ID."

  # The Auth config doesn't exist until Auth is first enabled in the Firebase
  # console. That's a manual step anyway (sign-in providers), so warn and
  # continue — re-running this script afterwards adds the domains.
  if echo "$current_cfg" | grep -q 'CONFIGURATION_NOT_FOUND'; then
    log "warning: Firebase Auth not initialized yet — skipping authorized-domain update."
    log "         Enable sign-in providers at https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers"
    log "         then re-run this script to authorize $CUSTOM_DOMAIN."
  elif echo "$current_cfg" | grep -q '"error"'; then
    fail "could not fetch Identity Toolkit config for $PROJECT_ID: $current_cfg"
  else
  python3 - "$current_cfg" "$CUSTOM_DOMAIN" "$access_token" "$PROJECT_ID" >&2 <<'PY'
import json, sys, urllib.request, urllib.error
current = json.loads(sys.argv[1] or "{}")
domain, token, project_id = sys.argv[2], sys.argv[3], sys.argv[4]
existing = list(current.get("authorizedDomains") or [])
existing_set = set(existing)
to_add = [d for d in (domain, f"www.{domain}") if d not in existing_set]
if not to_add:
    print(f"[{project_id}] {domain} + www.{domain} already authorized — no change.")
    sys.exit(0)
desired = existing + to_add
body = json.dumps({"authorizedDomains": desired}).encode()
req = urllib.request.Request(
    f"https://identitytoolkit.googleapis.com/admin/v2/projects/{project_id}/config?updateMask=authorizedDomains",
    data=body,
    method="PATCH",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "x-goog-user-project": project_id,
    },
)
try:
    with urllib.request.urlopen(req) as resp:
        resp.read()
except urllib.error.HTTPError as e:
    print(f"[{project_id}] error updating authorized domains: HTTP {e.code} {e.reason} — {e.read().decode(errors='replace')}", file=sys.stderr)
    sys.exit(1)
print(f"[{project_id}] added: {', '.join(to_add)}")
PY
  fi
fi

# 9. Pull SDK config and emit normalized JSON to stdout.
log "Pulling SDK config for $APP_ID..."
sdk_raw="$(firebase apps:sdkconfig WEB "$APP_ID" --project="$PROJECT_ID" --json)" \
  || fail "firebase apps:sdkconfig failed."

python3 - "$sdk_raw" <<'PY'
import json, sys
raw = sys.argv[1]
data = json.loads(raw)
result = data.get("result", {})
# The SDK config is either nested under "sdkConfig" or serialized into "fileContents",
# depending on Firebase CLI version. Try both.
sdk = result.get("sdkConfig")
if not sdk and result.get("fileContents"):
    try:
        sdk = json.loads(result["fileContents"])
    except json.JSONDecodeError:
        sdk = {}
sdk = sdk or {}
out = {
    "projectId":         sdk.get("projectId", ""),
    "apiKey":            sdk.get("apiKey", ""),
    "authDomain":        sdk.get("authDomain", ""),
    "storageBucket":     sdk.get("storageBucket", ""),
    "messagingSenderId": sdk.get("messagingSenderId", ""),
    "appId":             sdk.get("appId", ""),
}
missing = [k for k, v in out.items() if not v]
if missing:
    sys.stderr.write(f"warning: SDK config missing keys: {missing}\n")
print(json.dumps(out))
PY

log "Done."
