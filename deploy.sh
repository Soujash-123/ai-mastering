#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
DEPLOYMENT_LOG="${SCRIPT_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"
SERVICES=(frontend-app frontend backend)
MAX_WAIT_RETRIES="${MAX_WAIT_RETRIES:-30}"
WAIT_INTERVAL_SECONDS="${WAIT_INTERVAL_SECONDS:-2}"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

log() {
    local level="$1"
    shift
    printf '[%s] %s\n' "${level}" "$*" | tee -a "${DEPLOYMENT_LOG}"
}

dc() {
    docker compose --project-directory "${SCRIPT_DIR}" -f "${COMPOSE_FILE}" "$@"
}

on_error() {
    local exit_code=$?
    log ERROR "Deployment failed (exit code: ${exit_code})"
    dc ps 2>&1 | tee -a "${DEPLOYMENT_LOG}" || true
    dc logs --tail=120 2>&1 | tee -a "${DEPLOYMENT_LOG}" || true
    exit "${exit_code}"
}

trap on_error ERR

require_command() {
    local cmd="$1"
    if ! command -v "${cmd}" >/dev/null 2>&1; then
        log ERROR "Required command not found: ${cmd}"
        exit 1
    fi
}

validate_prerequisites() {
    require_command docker
    require_command curl

    if ! dc version >/dev/null 2>&1; then
        log ERROR "Docker Compose V2 is required"
        exit 1
    fi

    if [ ! -f "${COMPOSE_FILE}" ]; then
        log ERROR "docker-compose.yml not found at ${COMPOSE_FILE}"
        exit 1
    fi

    if [ ! -s "${SCRIPT_DIR}/backend/.env" ]; then
        log ERROR "backend/.env is missing or empty"
        exit 1
    fi

    if [ ! -s "${SCRIPT_DIR}/.env" ]; then
        log WARNING "root .env is missing or empty; compose will use defaults for unset variables"
    fi
}

stop_existing_containers() {
    log INFO "Stopping existing containers"
    dc down --remove-orphans 2>&1 | tee -a "${DEPLOYMENT_LOG}"
}

build_images() {
    local service
    for service in "${SERVICES[@]}"; do
        log INFO "Building ${service}"
        dc build "${service}" 2>&1 | tee -a "${DEPLOYMENT_LOG}"
    done
}

start_services() {
    log INFO "Starting services"
    dc up -d --no-build 2>&1 | tee -a "${DEPLOYMENT_LOG}"
}

wait_for_services() {
    local attempt
    for attempt in $(seq 1 "${MAX_WAIT_RETRIES}"); do
        if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1 && curl -fsS http://localhost >/dev/null 2>&1; then
            log INFO "Services are ready"
            return 0
        fi
        sleep "${WAIT_INTERVAL_SECONDS}"
    done

    log ERROR "Services did not become ready in time"
    exit 1
}

show_status() {
    log INFO "Deployment status"
    dc ps 2>&1 | tee -a "${DEPLOYMENT_LOG}"
    log INFO "Frontend: http://localhost"
    log INFO "Backend: http://localhost:8000"
    log INFO "API health: http://localhost:8000/api/health"
}

main() {
    log INFO "Starting deployment"
    validate_prerequisites
    stop_existing_containers
    build_images
    start_services
    wait_for_services
    show_status
}

main "$@"