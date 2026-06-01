#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-120}"
WAIT_INTERVAL_SECONDS="${WAIT_INTERVAL_SECONDS:-3}"

log() {
    local level="$1"
    shift
    printf '[%s] %s\n' "${level}" "$*"
}

log_info() { log INFO "$@"; }
log_success() { log SUCCESS "$@"; }
log_warning() { log WARNING "$@"; }
log_error() { log ERROR "$@"; }

print_failure_diagnostics() {
    log_warning "Container status:"
    docker compose ps || true

    log_warning "Recent container logs:"
    docker compose logs --tail=150 || true
}

on_error() {
    local exit_code=$?
    local line_number="$1"
    log_error "Deployment failed at line ${line_number} (exit code: ${exit_code})"
    print_failure_diagnostics
    exit "${exit_code}"
}

trap 'on_error ${LINENO}' ERR

require_command() {
    local cmd="$1"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        log_error "Required command not found: ${cmd}"
        exit 1
    fi
}

require_file() {
    local file="$1"
    if [ ! -f "${file}" ]; then
        log_error "Required file not found: ${file}"
        exit 1
    fi
}

validate_environment() {
    log_info "Validating execution environment"

    require_command git
    require_command docker
    require_command curl

    if ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose V2 is required"
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not reachable"
        exit 1
    fi

    require_file "${SCRIPT_DIR}/docker-compose.yml"
    require_file "${SCRIPT_DIR}/backend/Dockerfile"
    require_file "${SCRIPT_DIR}/frontend/Dockerfile"

    log_success "Environment validation passed"
}

update_code() {
    log_info "Updating repository from origin/main"
    git fetch origin
    git checkout main
    git pull origin main
    log_success "Repository updated to latest main"
}

build_images() {
    log_info "Building Docker images"
    docker compose build
    log_success "Docker image build completed"
}

restart_application() {
    log_info "Restarting application containers"
    docker compose down
    docker compose up -d
    log_success "Containers restarted"
}

service_running() {
    local service="$1"
    docker compose ps --services --status running | grep -Fxq "${service}"
}

wait_for_required_services() {
    log_info "Waiting for required containers: backend, frontend"

    local elapsed=0
    while [ "${elapsed}" -lt "${MAX_WAIT_SECONDS}" ]; do
        if service_running backend && service_running frontend; then
            log_success "Required containers are running"
            return 0
        fi

        sleep "${WAIT_INTERVAL_SECONDS}"
        elapsed=$((elapsed + WAIT_INTERVAL_SECONDS))
    done

    log_error "Timed out waiting for backend/frontend containers"
    return 1
}

check_http() {
    local name="$1"
    local url="$2"
    local elapsed=0

    while [ "${elapsed}" -lt "${MAX_WAIT_SECONDS}" ]; do
        if curl -fsS "${url}" >/dev/null; then
            log_success "${name} health check passed: ${url}"
            return 0
        fi

        sleep "${WAIT_INTERVAL_SECONDS}"
        elapsed=$((elapsed + WAIT_INTERVAL_SECONDS))
    done

    log_error "${name} health check failed: ${url}"
    return 1
}

run_health_checks() {
    log_info "Running container and endpoint health checks"

    docker compose ps
    check_http "Backend" "http://localhost:8000/api/health"
    check_http "Frontend" "http://localhost:3000"

    log_success "All health checks passed"
}

cleanup() {
    log_info "Removing dangling Docker images"
    docker image prune -f
    log_success "Cleanup complete"
}

main() {
    cd "${SCRIPT_DIR}"

    log_info "Starting production deployment"

    validate_environment
    update_code
    build_images
    restart_application
    wait_for_required_services
    run_health_checks
    cleanup

    log_success "Deployment completed successfully"
}

main "$@"
