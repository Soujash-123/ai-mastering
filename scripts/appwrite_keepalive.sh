#!/usr/bin/env bash
# Ping Appwrite so the project is never paused for inactivity.
# Runs on the host from cron (installed by deploy.sh); reads backend/.env.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../backend/.env"

log() {
    printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2"
}

env_value() {
    grep -E "^$1=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}

if [ ! -r "${ENV_FILE}" ]; then
    log ERROR "env file not found: ${ENV_FILE}"
    exit 1
fi

endpoint="$(env_value APPWRITE_ENDPOINT)"
project="$(env_value APPWRITE_PROJECT_ID)"
api_key="$(env_value APPWRITE_API_KEY)"
bucket="$(env_value APPWRITE_BUCKET_ID)"

if [ -z "${endpoint}" ] || [ -z "${project}" ] || [ -z "${api_key}" ] || [ -z "${bucket}" ]; then
    log WARNING "Appwrite is not configured; nothing to ping"
    exit 0
fi

# Headers go through stdin (-K -) so the API key never shows up in `ps`.
status="$(curl -sS -o /dev/null -w '%{http_code}' --retry 3 --retry-delay 10 --max-time 30 -K - \
    "${endpoint%/}/storage/buckets/${bucket}" <<CURL_CONFIG || true
header = "X-Appwrite-Project: ${project}"
header = "X-Appwrite-Key: ${api_key}"
CURL_CONFIG
)"

if [ "${status}" = "200" ]; then
    log INFO "Appwrite keepalive ok (HTTP ${status})"
else
    log ERROR "Appwrite keepalive failed (HTTP ${status:-none})"
    exit 1
fi
