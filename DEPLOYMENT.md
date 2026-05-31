# CI/CD Deployment Guide

## Overview

This guide explains the production-ready CI/CD setup for the AI Mastering Platform. The system uses:
- **GitHub Actions** for automated CI/CD orchestration
- **Self-Hosted GitHub Runner** on AWS EC2 for deployment execution
- **Docker Compose** for containerized application deployment
- **Bash scripting** for deployment orchestration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Push to main branch → triggers workflow                │ │
│  └─────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          GitHub Actions Workflow (deploy.yml)                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ • Validates repository structure                       │ │
│  │ • Makes deploy.sh executable                           │ │
│  │ • Executes deploy.sh on self-hosted runner             │ │
│  │ • Verifies deployment success                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         AWS EC2 Instance (Ubuntu 26.04)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ GitHub Self-Hosted Runner                              │ │
│  │ ┌───────────────────────────────────────────────────────┐│ │
│  │ │ deploy.sh Script Execution                          ││ │
│  │ │ • Stop existing containers                          ││ │
│  │ │ • Build Docker images (--no-cache)                  ││ │
│  │ │ • Start services via docker compose up -d           ││ │
│  │ │ • Wait for service readiness                        ││ │
│  │ │ • Clean up unused Docker resources                  ││ │
│  │ └───────────────────────────────────────────────────────┘│ │
│  │                                                         │ │
│  │ Docker Containers Running:                            │ │
│  │ • Backend (FastAPI + Uvicorn) - Port 8000             │ │
│  │ • Frontend (Next.js) - Port 3000                       │ │
│  │ • Volumes: backend/data (persisted)                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Created/Modified

### 1. `deploy.sh` (Created)
**Location**: Repository root

**Purpose**: Orchestrates the complete deployment process

**Key Features**:
- ✅ Comprehensive input validation
- ✅ Pre-flight checks for Docker and docker-compose
- ✅ Graceful container shutdown
- ✅ No-cache image builds for fresh deployments
- ✅ Service health checks with retries
- ✅ Automatic cleanup of dangling Docker resources
- ✅ Detailed logging with timestamps
- ✅ Color-coded output for readability
- ✅ Exit immediately on any error (`set -e`)

**Execution Flow**:
1. Validate prerequisites (Docker, docker-compose, files)
2. Stop and remove existing containers
3. Build Docker images with `--no-cache`
4. Start services with `docker compose up -d`
5. Wait for services to be ready (retries)
6. Clean up dangling images/volumes
7. Display final status report

**Usage**:
```bash
# From repository root
./deploy.sh
```

**Output**: Creates timestamped log file `deployment-YYYYMMDD-HHMMSS.log`

---

### 2. `.github/workflows/deploy.yml` (Created)
**Location**: `.github/workflows/deploy.yml`

**Purpose**: GitHub Actions workflow that automates deployment on push to main

**Trigger**:
- Automatically runs when code is pushed to `main` branch
- Can be configured to trigger on specific paths

**Key Steps**:
1. **Checkout Repository** - Fetches latest code
2. **Validate Structure** - Ensures all critical files exist
3. **Make Script Executable** - Sets permissions on deploy.sh
4. **Display Environment** - Logs system and Docker info
5. **Pre-Deployment Checks** - Verifies .env and Docker daemon
6. **Execute Deployment** - Runs deploy.sh
7. **Verify Deployment** - Checks service health
8. **Generate Report** - Creates final status report
9. **Failure Handling** - Logs and displays errors if deployment fails

**Features**:
- 30-minute timeout to prevent stuck deployments
- Comprehensive logging at each step
- Pre and post-deployment verification
- Automatic failure detection and reporting
- System resource diagnostics on failure

---

## Setup Instructions

### Phase 1: EC2 Instance Prerequisites

**1. Install Docker & Docker Compose**
```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io docker-compose-v2

# Add your user to docker group
sudo usermod -aG docker ubuntu
newgrp docker

# Verify installation
docker --version
docker compose version
```

**2. Install GitHub Self-Hosted Runner**
```bash
# Create directory for runner
mkdir -p /home/ubuntu/github-runner
cd /home/ubuntu/github-runner

# Download latest runner release
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/v2.323.0/actions-runner-linux-x64.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
rm actions-runner-linux-x64.tar.gz

# Configure runner (interactive)
./config.sh --url https://github.com/YOUR_ORG/ai-mastering --token YOUR_TOKEN
```

**3. Configure Runner Labels (Optional)**
During configuration, you can add labels for organization, but they are optional:

```bash
# During setup-runner.sh or via GitHub UI later
# Optional labels: production, ec2, etc.
```

Or later via GitHub UI:
- Settings → Actions → Runners → Edit runner → Add optional labels
- Suggested: `production`, `ec2` (for organization only)

**4. Run Runner as Service**
```bash
# Install as systemd service
sudo ./svc.sh install

# Start service
sudo ./svc.sh start

# Verify it's running
sudo ./svc.sh status
```

**5. Create Backend .env File on EC2**
```bash
# On EC2, in your deployment directory
cat > backend/.env << 'EOF'
OPENAI_API_KEY=your-actual-api-key-here
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
EOF

# Secure the file
chmod 600 backend/.env
```

### Phase 2: GitHub Repository Configuration

**1. Runner Registration (Verify)**

Go to: `Settings → Actions → Runners`

Your runner should appear in the list with status "Idle". Labels are optional and can be added for organization purposes (e.g., `production`, `ec2`), but they are not required for the workflow to run.

**2. Protect Main Branch (Optional but Recommended)**

Go to: `Settings → Branches → Add rule`
- Branch name: `main`
- Require pull request reviews: ✅ (optional)
- Require status checks to pass: ✅
- Restrict who can push to matching branches: ✅

**3. Add Secrets (Optional for GitHub)**

Go to: `Settings → Secrets and variables → Actions`

Note: You typically won't need GitHub secrets since .env is on EC2, but you could add:
- `EC2_DEPLOY_HOST`
- `EC2_SSH_KEY` (not used in this setup)

### Phase 3: First Deployment Test

**1. Make a Test Commit**
```bash
git add .
git commit -m "feat: add CI/CD deployment pipeline"
git push origin main
```

**2. Monitor Workflow**
- Go to: `Actions` tab on GitHub
- Click on the workflow run
- Watch logs in real-time

**3. Verify Deployment on EC2**
```bash
# SSH into EC2
ssh ubuntu@your-ec2-ip

# Check running containers
docker compose ps

# Check logs
docker compose logs -f backend
docker compose logs -f frontend

# Test services
curl http://localhost:8000/docs
curl http://localhost:3000
```

---

## File Preservation & Configuration

### .env Files

**CRITICAL**: The `.env` files are **NOT** included in the repository for security reasons.

**Setup**:
1. Manually create `backend/.env` on the EC2 instance
2. Never commit `.env` files to the repository
3. Ensure `.gitignore` contains: `*.env` and `backend/.env`

**Environment Variables**:

**backend/.env** (on EC2):
```
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXX
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
```

**Data Persistence**:
```yaml
# From docker-compose.yml
volumes:
  - ./backend/data:/app/backend/data
```
The `backend/data` directory is mounted on the host, preserving job data across deployments.

---

## Database & Migration Analysis

### Current System Architecture

✅ **No Traditional Database**
- The AI Mastering platform uses **file-based job storage**
- Job data stored in: `backend/data/jobs/`
- No SQL database migrations required
- No Alembic or migration tools needed

### Job Storage Structure
```
backend/data/jobs/
├── job-id-1/
│   ├── input.wav
│   ├── output.wav
│   ├── metadata.json
│   └── exports/
├── job-id-2/
│   └── ...
└── job-id-N/
```

### Implications for Deployment
- ✅ No database initialization needed
- ✅ No migration scripts to run
- ✅ Data persists across deployments via volumes
- ✅ Simpler deployment pipeline

---

## Deployment Process Detail

### 1. Trigger Event
```
Push to main branch
        ↓
GitHub detects push event
        ↓
deploy.yml workflow triggered
```

### 2. Validation Phase
```bash
# Workflow checks:
- Repository checkout successful
- docker-compose.yml exists
- deploy.sh exists
- Both Dockerfiles exist
- backend/.env exists on runner
- Docker daemon accessible
```

### 3. Deployment Phase
```bash
# deploy.sh execution sequence:

# Stop old containers
docker compose down --remove-orphans

# Build fresh images (no cache)
docker compose build --no-cache
  ├── Backend: python:3.12-slim
  │   ├── Install: libsndfile1, pip deps
  │   └── Copy app code
  └── Frontend: node:22-alpine (multi-stage)
      ├── Build stage: npm ci && npm run build
      └── Runtime stage: npm start

# Start services
docker compose up -d
  ├── Backend container: Uvicorn on 0.0.0.0:8000
  └── Frontend container: Next.js on 0.0.0.0:3000

# Health checks with retries
Loop up to 30 times (60 seconds):
  ├── Check: curl http://localhost:8000/docs
  └── Check: curl http://localhost:3000

# Cleanup
docker image prune -f (dangling images)
docker volume prune -f (unused volumes)
```

### 4. Verification Phase
```bash
# Workflow verifies:
- Backend responding on port 8000
- Frontend responding on port 3000
- Docker containers status
- Final resource report
```

### 5. Completion
```
✅ Deployment Success
  ├── Log: deployment-YYYYMMDD-HHMMSS.log
  ├── Services: Running
  ├── Data: Preserved
  └── Available at:
      ├── http://your-ec2-ip:3000 (Frontend)
      └── http://your-ec2-ip:8000/docs (Backend)
```

---

## Service Architecture

### Backend (FastAPI)
```
Port: 8000
Protocol: HTTP
Command: uvicorn api.main:app --host 0.0.0.0 --port 8000

Endpoints:
  GET  /docs           - API documentation
  POST /api/jobs       - Create mastering job
  GET  /api/jobs/{id}  - Get job status
  GET  /api/results/{id} - Download result

Environment:
  OPENAI_API_KEY       - Required
  OPENAI_MASTERING_MODEL - Default: gpt-5.1
  AI_MASTERING_DATA_DIR - Default: ./data

Dependencies:
  FastAPI 0.115.0+
  Uvicorn 0.32.0+
  OpenAI 1.55.0+
  LibreSOSA, PyTorch, etc.
```

### Frontend (Next.js)
```
Port: 3000
Protocol: HTTP
Command: next start (production mode)

Features:
  Static generation for pages
  Client-side routing
  API proxy to backend

Environment:
  NEXT_PUBLIC_API_BASE - Backend URL
    Default: http://localhost:8000

Build Args:
  NEXT_PUBLIC_API_BASE - Used during docker build
```

---

## Failure Scenarios & Recovery

### Scenario 1: Backend Won't Start
```bash
# On EC2
docker compose logs -f backend

# Common issues:
# - OPENAI_API_KEY not set in .env
# - Port 8000 already in use
# - Insufficient disk space
# - Missing Python dependencies

# Recovery:
# 1. Fix the issue
# 2. Run deploy.sh again (rebuilds from scratch)
```

### Scenario 2: Frontend Build Fails
```bash
# Check logs
docker compose logs -f frontend

# Common issues:
# - npm ci fails (lock file mismatch)
# - npm build fails (TypeScript errors)
# - Node version incompatibility

# Recovery:
# 1. Check frontend/package-lock.json is committed
# 2. Run deploy.sh again
```

### Scenario 3: Deployment Stuck
```bash
# Timeout after 30 minutes (workflow timeout)
# Check EC2 directly:

docker ps  # Are containers running?
docker logs <container-id>  # Check logs
df -h  # Disk space?
free -h  # Memory?

# Manually recover:
docker compose down
docker compose up -d
```

### Scenario 4: Port Conflicts
```bash
# Port 3000 or 8000 already in use
# Check what's running:
netstat -tulpn | grep -E ':(3000|8000)'

# Recovery:
# - Kill conflicting process
# - OR modify docker-compose.yml ports
# - Then run deploy.sh again
```

---

## Monitoring & Logs

### Real-Time Logs
```bash
# All containers
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend

# Last 50 lines
docker compose logs --tail=50 backend
```

### Deployment Log
```bash
# After deployment, check:
cat deployment-*.log

# Or remotely via workflow:
# GitHub Actions → Job → Logs
```

### Health Checks
```bash
# Backend health
curl -s http://localhost:8000/docs | head -20

# Frontend health
curl -s http://localhost:3000 | head -20

# Container status
docker compose ps

# Resource usage
docker stats
```

---

## Maintenance & Updates

### Update Application Code
```bash
# 1. Make changes on your machine
# 2. Commit and push to main
# 3. GitHub Actions auto-deploys
git add .
git commit -m "feat: new feature"
git push origin main

# 4. Monitor workflow in GitHub Actions tab
# 5. Workflow automatically runs deploy.sh
```

### Update Dependencies (Backend)
```bash
# 1. Update backend/requirements.txt
# 2. Commit and push to main
# 3. Workflow rebuilds with --no-cache
# 4. New dependencies installed in fresh image

# Alternatively, rebuild immediately:
ssh ubuntu@your-ec2-ip
cd ai-mastering
./deploy.sh
```

### Update Dependencies (Frontend)
```bash
# 1. Update frontend/package.json
# 2. Run: npm install (updates package-lock.json)
# 3. Commit package-lock.json to repo
# 4. Push to main
# 5. Workflow rebuilds with npm ci
```

### Manual Rebuild (No Code Changes)
```bash
# SSH to EC2
ssh ubuntu@your-ec2-ip
cd ai-mastering
./deploy.sh

# Or force via GitHub: empty commit
git commit --allow-empty -m "chore: trigger deployment"
git push origin main
```

---

## Security Considerations

### 1. Secret Management
- ✅ `.env` files NOT in repository
- ✅ `.env` exists only on EC2
- ✅ Deploy script doesn't expose secrets
- ✅ Logs redacted of sensitive values

### 2. Access Control
- ✅ Self-hosted runner on private EC2
- ✅ Only on internal VPC (recommended)
- ✅ SSH key-based access to EC2
- ✅ GitHub runner user isolated

### 3. Code Review (Recommended)
```yaml
# Settings → Branches → main
Require pull request reviews: YES
Require status checks to pass: YES
Dismiss stale PR approvals: YES
Require code owner reviews: YES (optional)
```

### 4. Network Security
- Restrict EC2 security group to necessary IPs
- Use VPC for private deployments
- Consider CloudFront for HTTPS frontend
- Use ALB/NLB for load balancing

### 5. Data Protection
- Data directories owned by docker user
- Volumes mounted read-write (necessary)
- Regular backups of `backend/data`
- Consider S3 sync for backup

---

## Troubleshooting Guide

### Workflow Won't Start
```
Issue: Workflow not triggering on push to main

Check:
1. Branch protection rules don't block the runner
2. Runner is online: Settings → Actions → Runners
3. Workflow file is in .github/workflows/ on main (with runs-on: self-hosted)
4. YAML syntax is valid (test with yamllint)
5. Runner is actually registered in GitHub (Settings → Actions → Runners)
```

### Runner Offline
```bash
# SSH to EC2
sudo ./svc.sh status

# Restart if needed
sudo ./svc.sh stop
sudo ./svc.sh start

# Check logs
sudo journalctl -u actions.runner-$(hostname) -f
```

### Deploy Script Permissions
```bash
# If "Permission denied" on deploy.sh
chmod +x deploy.sh
git add deploy.sh
git commit -m "fix: add execute permissions"
git push origin main
```

### Docker Compose Not Found
```bash
# Ensure Docker Compose V2 is installed
docker compose version  # Should be v2+

# If v1, update:
sudo apt-get install docker-compose-v2
```

### Out of Disk Space
```bash
# During build failure
df -h

# Clean up Docker
docker system prune -a -f

# Remove old deployments
docker image rm $(docker images -q) 2>/dev/null || true

# Retry deployment
./deploy.sh
```

---

## Assumptions Made

1. **EC2 Instance**
   - Running Ubuntu 26.04 (or compatible)
   - Has sufficient disk space (minimum 10GB recommended)
   - Has internet access for Docker pulls
   - Docker and Docker Compose V2 pre-installed

2. **GitHub Self-Hosted Runner**
   - Installed and configured on EC2
   - Has labels: `production`, `ec2`
   - Running as systemd service (auto-restart)
   - User has docker group membership

3. **Application**
   - No database migrations needed (file-based)
   - `.env` file exists on EC2 at `backend/.env`
   - No complex orchestration or startup sequences
   - Services are stateless except for `backend/data`

4. **Networking**
   - Ports 3000 and 8000 are accessible
   - Frontend calls backend via localhost (container networking)
   - No complex load balancing or multi-region setup

5. **GitHub Repository**
   - `.env` files in `.gitignore` (not committed)
   - `deploy.sh` has execute bit set (or will be in GitHub)
   - Default branch is `main`

---

## Risks & Improvements

### Current Risks

1. **No Automated Rollback**
   - If deployment fails, services may be in inconsistent state
   - Mitigation: deploy.sh idempotent; re-run to recover

2. **Shared Runner on Production**
   - Single point of failure for deployments
   - Mitigation: Multiple runners on different EC2s; use auto-scaling

3. **No Staging Environment**
   - Deployments go directly to production
   - Mitigation: Add staging branch → staging workflow

4. **Hard Timeout on Workflow**
   - 30 minutes may be too short for large builds
   - Mitigation: Increase timeout or cache Docker layers

5. **No Secrets Management**
   - .env file stored plaintext on EC2
   - Mitigation: Use AWS Secrets Manager or HashiCorp Vault

### Recommended Improvements

1. **Add Staging Workflow**
   ```yaml
   # .github/workflows/deploy-staging.yml
   on:
     push:
       branches: [staging]
   ```

2. **Cache Docker Layers**
   ```yaml
   # Reduce build time on workflows
   - uses: docker/setup-buildx-action@v3
   ```

3. **Add Health Check Endpoints**
   ```python
   # backend/api/main.py
   @app.get("/health")
   def health_check():
       return {"status": "healthy"}
   ```

4. **Blue-Green Deployment**
   ```bash
   # Keep old containers running
   # Health check on new containers
   # Switch traffic only after success
   ```

5. **Secrets Management**
   ```bash
   # Use AWS Secrets Manager instead of .env
   aws secretsmanager get-secret-value --secret-id api-keys
   ```

6. **Observability**
   - Add CloudWatch logs integration
   - Structured JSON logging in deploy.sh
   - Metrics export to CloudWatch
   - Alert on deployment failures

7. **CI Checks Before Deploy**
   - Unit tests
   - Linting (backend + frontend)
   - Security scanning
   - Build verification

---

## Quick Reference

### File Locations
- **Deploy script**: `./deploy.sh` (repository root)
- **Workflow**: `./.github/workflows/deploy.yml`
- **Backend code**: `./backend/**/*.py`
- **Frontend code**: `./frontend/app/` and `./frontend/components/`
- **Compose file**: `./docker-compose.yml`
- **Env file**: `./backend/.env` (on EC2, not in repo)
- **Data**: `./backend/data/jobs/` (persisted across deploys)

### Essential Commands

```bash
# Deploy manually (on EC2)
cd ai-mastering && ./deploy.sh

# Check status
docker compose ps
docker compose logs -f

# Restart services
docker compose down && docker compose up -d

# Stop deployment
docker compose down

# View resource usage
docker stats

# Clean up
docker system prune -a -f
```

### GitHub Actions Console
- **Workflow trigger**: Push to `main` branch
- **Monitor**: GitHub → Actions → Deploy to Production
- **Logs**: Click on workflow run → View job logs
- **Status**: Green ✅ (success) or Red ✗ (failure)

---

## Support & Questions

For issues or questions:
1. Check deployment logs: `deployment-*.log`
2. Check GitHub Actions logs: GitHub UI
3. Check Docker logs: `docker compose logs`
4. Review this guide: Troubleshooting section
5. Verify prerequisites are met

---

**Last Updated**: 2026-06-01
**Version**: 1.0.0
**Status**: Production Ready ✅
