#!/bin/bash

################################################################################
# AI Mastering Platform - Production Deployment Script
# 
# Purpose: Safely deploy the application to production using Docker Compose
# 
# Prerequisites:
#   - Docker and Docker Compose V2 installed
#   - .env file exists at backend/.env with required variables
#   - Script executed from repository root directory
#
# Usage: ./deploy.sh
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_LOG="${SCRIPT_DIR}/deployment-$(date +%Y%m%d-%H%M%S).log"
MAX_WAIT_RETRIES=30
WAIT_INTERVAL=2

################################################################################
# Logging Functions
################################################################################

log_info() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - ${message}" | tee -a "${DEPLOYMENT_LOG}"
}

log_success() {
    local message="$1"
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - ${message}" | tee -a "${DEPLOYMENT_LOG}"
}

log_warning() {
    local message="$1"
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - ${message}" | tee -a "${DEPLOYMENT_LOG}"
}

log_error() {
    local message="$1"
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - ${message}" | tee -a "${DEPLOYMENT_LOG}"
}

################################################################################
# Validation Functions
################################################################################

validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    log_success "Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        log_error "Docker Compose V2 is not installed or not in PATH"
        exit 1
    fi
    log_success "Docker Compose found: $(docker compose version)"
    
    # Check if we're in the right directory
    if [ ! -f "${SCRIPT_DIR}/docker-compose.yml" ]; then
        log_error "docker-compose.yml not found at ${SCRIPT_DIR}"
        exit 1
    fi
    log_success "docker-compose.yml found"
    
    # Check if backend .env exists
    if [ ! -f "${SCRIPT_DIR}/backend/.env" ]; then
        log_error "backend/.env not found. Please create backend/.env with required variables."
        exit 1
    fi
    log_success "backend/.env found"
    
    # Verify .env contains critical variables
    if ! grep -q "OPENAI_API_KEY" "${SCRIPT_DIR}/backend/.env"; then
        log_warning "OPENAI_API_KEY not found in backend/.env - application may not function"
    fi
    
    log_success "All prerequisites validated"
}

################################################################################
# Deployment Functions
################################################################################

stop_existing_containers() {
    log_info "Stopping existing containers..."
    
    if [ "$(docker compose -f "${SCRIPT_DIR}/docker-compose.yml" ps -q 2>/dev/null | wc -l)" -gt 0 ]; then
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" down --remove-orphans 2>&1 | tee -a "${DEPLOYMENT_LOG}"
        log_success "Existing containers stopped and removed"
    else
        log_info "No running containers found"
    fi
}

build_docker_images() {
    log_info "Building Docker images..."
    
    if docker compose -f "${SCRIPT_DIR}/docker-compose.yml" build 2>&1 | tee -a "${DEPLOYMENT_LOG}"; then
        log_success "Docker images built successfully"
    else
        log_error "Failed to build Docker images"
        exit 1
    fi
}

start_services() {
    log_info "Starting services..."
    
    if docker compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d 2>&1 | tee -a "${DEPLOYMENT_LOG}"; then
        log_success "Services started"
    else
        log_error "Failed to start services"
        exit 1
    fi
}

wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    local retry=0
    local backend_ready=false
    local frontend_ready=false
    
    while [ $retry -lt $MAX_WAIT_RETRIES ]; do
        # Check backend health
        if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
            log_success "Backend service is ready (http://localhost:8000)"
            backend_ready=true
        fi
        
        # Check frontend health
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            log_success "Frontend service is ready (http://localhost:3000)"
            frontend_ready=true
        fi
        
        if [ "$backend_ready" = true ] && [ "$frontend_ready" = true ]; then
            log_success "All services are ready"
            return 0
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $MAX_WAIT_RETRIES ]; then
            log_info "Services not yet ready, waiting... (attempt $retry/$MAX_WAIT_RETRIES)"
            sleep $WAIT_INTERVAL
        fi
    done
    
    log_warning "Services did not fully initialize within timeout, but containers are running"
}

cleanup_docker_resources() {
    log_info "Cleaning up unused Docker resources..."
    
    # Remove dangling images
    if docker image prune -f --filter "dangling=true" 2>&1 | tee -a "${DEPLOYMENT_LOG}"; then
        log_success "Dangling Docker images removed"
    fi
    
    # Remove unused volumes
    if docker volume prune -f 2>&1 | tee -a "${DEPLOYMENT_LOG}"; then
        log_success "Unused Docker volumes removed"
    fi
}

display_status() {
    log_info "========================================="
    log_info "Deployment Status Report"
    log_info "========================================="
    
    docker compose -f "${SCRIPT_DIR}/docker-compose.yml" ps 2>&1 | tee -a "${DEPLOYMENT_LOG}"
    
    echo "" | tee -a "${DEPLOYMENT_LOG}"
    log_info "Service URLs:"
    log_info "  Frontend:  http://localhost:3000"
    log_info "  Backend:   http://localhost:8000"
    log_info "  API Docs:  http://localhost:8000/docs"
    echo "" | tee -a "${DEPLOYMENT_LOG}"
    
    log_info "Docker Images:"
    docker images --filter "dangling=false" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" 2>&1 | tee -a "${DEPLOYMENT_LOG}"
    
    log_info "========================================="
    log_success "Deployment completed successfully!"
    log_info "Deployment log: ${DEPLOYMENT_LOG}"
}

################################################################################
# Main Execution
################################################################################

main() {
    log_info "========================================="
    log_info "AI Mastering Platform - Deployment Start"
    log_info "========================================="
    log_info "Deployment log: ${DEPLOYMENT_LOG}"
    echo "" | tee -a "${DEPLOYMENT_LOG}"
    
    # Execute deployment steps
    validate_prerequisites
    stop_existing_containers
    build_docker_images
    start_services
    wait_for_services
    cleanup_docker_resources
    display_status
}

# Run main function
main
