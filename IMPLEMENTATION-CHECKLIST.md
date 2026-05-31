# CI/CD Implementation Checklist

## Pre-Implementation

- [ ] Verify AWS EC2 instance is running (Ubuntu 26.04)
- [ ] Have SSH access to EC2 instance
- [ ] Have GitHub account with repository access
- [ ] Have OpenAI API key available
- [ ] Have GitHub Personal Access Token (classic) with repo scope
- [ ] Review all documentation files:
  - [ ] [DEPLOYMENT.md](DEPLOYMENT.md) - Full setup guide
  - [ ] [CICD-ARCHITECTURE.md](CICD-ARCHITECTURE.md) - Design decisions
  - [ ] [DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md) - Quick reference

---

## Phase 1: Local Repository Setup

### 1.1 Verify Files Exist
- [ ] `.github/workflows/deploy.yml` exists
- [ ] `deploy.sh` exists
- [ ] `docker-compose.yml` exists
- [ ] `backend/Dockerfile` exists
- [ ] `frontend/Dockerfile` exists
- [ ] `.env` files NOT committed (in .gitignore)

### 1.2 Commit Initial Setup (if not already done)
```bash
# From repository root
git add deploy.sh .github/workflows/ DEPLOYMENT.md CICD-ARCHITECTURE.md DEPLOY-QUICK-START.md setup-runner.sh
git add -u .gitignore  # If updated
git commit -m "ci: add production CI/CD pipeline setup"
git push origin main
```
- [ ] All files pushed to GitHub
- [ ] Verify in GitHub UI

---

## Phase 2: EC2 Instance Setup

### 2.1 Connect to EC2
```bash
ssh ubuntu@your-ec2-ip
```
- [ ] Successfully connected to EC2
- [ ] Verified user is `ubuntu`

### 2.2 Install Docker & Docker Compose
```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io docker-compose-v2

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Verify (may need to log out and back in)
docker --version
docker compose version
docker ps
```
- [ ] Docker installed
- [ ] Docker Compose V2 installed
- [ ] `ubuntu` user can run docker commands

### 2.3 Create .env File
```bash
# On EC2, in home directory
mkdir -p ai-mastering-deploy/backend

cat > ai-mastering-deploy/backend/.env << 'EOF'
OPENAI_API_KEY=sk-proj-YOUR-ACTUAL-KEY-HERE
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
EOF

# Secure it
chmod 600 ai-mastering-deploy/backend/.env
cat ai-mastering-deploy/backend/.env  # Verify content
```
- [ ] backend/.env created
- [ ] Contains OPENAI_API_KEY
- [ ] Contains OPENAI_MASTERING_MODEL
- [ ] Contains AI_MASTERING_DATA_DIR

### 2.4 Verify Directory Structure
```bash
# Expected on EC2
/opt/github-runner/          # Where runner will be installed
~/ai-mastering-deploy/       # Where we'll clone the repo (optional)
  └── backend/
      └── .env              # Created above
```
- [ ] Directory structure ready
- [ ] .env file in place

---

## Phase 3: GitHub Actions Runner Installation

### 3.1 Generate GitHub Token
- [ ] Go to: GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
- [ ] Click "Generate new token"
- [ ] Token name: "EC2-Runner-Token"
- [ ] Select scopes: `repo`, `workflow`, `admin:org_hook` (if org-level)
- [ ] Generate and **copy token immediately** (won't show again)
- [ ] Store token securely (will use for setup-runner.sh)

### 3.2 Run Setup Script
```bash
# Back on your local machine, get the setup script
curl -o setup-runner.sh https://raw.githubusercontent.com/YOUR_ORG/ai-mastering/main/setup-runner.sh

# Or directly from repo if you have it
cp setup-runner.sh /tmp/

# SSH to EC2 and run
ssh ubuntu@your-ec2-ip << 'EOF'
curl -o setup-runner.sh https://raw.githubusercontent.com/YOUR_ORG/ai-mastering/main/setup-runner.sh
sudo bash setup-runner.sh ghp_YOUR_GITHUB_TOKEN YOUR_ORG/ai-mastering
EOF
```
- [ ] setup-runner.sh downloaded/run
- [ ] GitHub token provided
- [ ] Repository name provided (YOUR_ORG/ai-mastering)
- [ ] Script completes successfully

### 3.3 Verify Runner Installed
```bash
# On EC2
sudo systemctl status actions.runner-YOUR_ORG-ai-mastering

# Should show: Active (running)
```
- [ ] Runner service is running
- [ ] Service is enabled (auto-starts)

### 3.4 Check GitHub UI
- [ ] Go to: GitHub.com → Your Repo → Settings → Actions → Runners
- [ ] See runner in list
- [ ] Status shows "Idle" (not "Offline")
- [ ] Runner name matches EC2 hostname

---

## Phase 4: Configure Runner Labels (Optional)

### 4.1 Via GitHub UI (Optional)
- [ ] Settings → Actions → Runners
- [ ] Click on your runner
- [ ] Click "Edit"
- [ ] In "Labels" section, you can add labels for organization:
  - [ ] `production` (optional)
  - [ ] `ec2` (optional)
- [ ] Save

Labels are not required but can help organize multiple runners.

### 4.2 Verify Runner is Registered
```bash
# Check in GitHub UI
Settings → Actions → Runners

Runner should show:
  - Status: Idle (not Offline)
  - Registered successfully
```
- [ ] Runner appears in the list
- [ ] Runner status is "Idle"

---

## Phase 5: Test Deployment

### 5.1 Trigger First Deployment
```bash
# On local machine, in repository
git log --oneline -1  # Note the commit

# Make a test commit
echo "# Test deployment" >> TEST.md
git add TEST.md
git commit -m "test: trigger CI/CD deployment pipeline"
git push origin main
```
- [ ] Commit pushed to main
- [ ] Visible in GitHub

### 5.2 Monitor Workflow
- [ ] Go to: GitHub.com → Your Repo → Actions
- [ ] Click on workflow run
- [ ] Workflow starts (may take 30 seconds to appear)
- [ ] Each step executes in sequence:
  - [ ] Checkout Repository
  - [ ] Validate Repository Structure
  - [ ] Make Deploy Script Executable
  - [ ] Display Environment Information
  - [ ] Pre-Deployment Checks
  - [ ] Execute Deployment
  - [ ] Verify Deployment
  - [ ] Generate Deployment Report
- [ ] All steps complete with ✅ (green)

### 5.3 Verify on EC2
```bash
ssh ubuntu@your-ec2-ip
docker compose ps  # Should show running containers
docker compose logs -f  # View logs
curl http://localhost:8000/docs  # Backend responsive
curl http://localhost:3000  # Frontend responsive
```
- [ ] Backend container running
- [ ] Frontend container running
- [ ] Backend responds on 8000
- [ ] Frontend responds on 3000
- [ ] No critical errors in logs

### 5.4 Check Services
```bash
# In browser or via curl
curl -s http://localhost:8000/docs | head -20  # Should show API docs
curl -s http://localhost:3000 | head -20  # Should show HTML
```
- [ ] Backend API docs accessible
- [ ] Frontend returns valid HTML

---

## Phase 6: Repository Configuration

### 6.1 Protect Main Branch (Recommended)
- [ ] Settings → Branches
- [ ] Click "Add rule"
  - [ ] Branch name pattern: `main`
  - [ ] Enable: "Require pull request reviews"
  - [ ] Enable: "Require status checks to pass"
  - [ ] Disable: "Require up-to-date branches"
  - [ ] Enable: "Require code reviews from code owners"
  - [ ] Save

### 6.2 Add CODEOWNERS (Optional)
```bash
# Create .github/CODEOWNERS
# See GitHub docs for syntax

# Example:
* @your-username
```
- [ ] Optional: CODEOWNERS file created
- [ ] Commit and push if created

### 6.3 Add GitHub Secrets (Optional)
- [ ] Settings → Secrets and variables → Actions
- [ ] These are optional (deployment doesn't require them)
- [ ] If needed later, can add:
  - [ ] `EC2_DEPLOY_HOST`
  - [ ] `EC2_USERNAME`

---

## Phase 7: Verify Complete Setup

### 7.1 Test Rollback Scenario
```bash
# On EC2, manually stop containers
docker compose down

# Back on local machine, push another change
echo "# Rollback test" >> TEST.md
git add TEST.md
git commit -m "test: verify rollback"
git push origin main

# Workflow should automatically redeploy
# Containers should restart
```
- [ ] Containers stopped
- [ ] Workflow triggered
- [ ] Containers restarted
- [ ] Services restored

### 7.2 Test Failure Scenario (Optional)
```bash
# Break something intentionally
# Edit docker-compose.yml and add invalid config
# Push to feature branch, create PR, merge to main

# Watch workflow fail
# Review logs to understand failure
# Fix the issue
# Re-push to main
# Verify recovery
```
- [ ] Workflow fails appropriately
- [ ] Logs are clear about what failed
- [ ] Can fix and retry

### 7.3 Documentation Review
- [ ] README.md mentions deployment (optional)
- [ ] Team has read DEPLOYMENT.md
- [ ] Team has read DEPLOY-QUICK-START.md
- [ ] Team understands CI/CD process

---

## Phase 8: Ongoing Operations

### 8.1 Regular Monitoring
- [ ] Daily: Check runner status in GitHub
  - [ ] Runner shows "Idle" (not "Offline")
  - [ ] Recent deployment logs are successful

- [ ] Weekly: EC2 health
  ```bash
  df -h  # Disk space
  free -h  # Memory
  docker stats  # Resource usage
  ```

- [ ] Monthly: Cleanup
  ```bash
  docker system prune -a -f  # Clean unused resources
  ```

### 8.2 Deployment Tracking
- [ ] Create spreadsheet or wiki page with:
  - [ ] Date deployed
  - [ ] Changes deployed
  - [ ] Who deployed
  - [ ] Workflow run link
  - [ ] Any issues

### 8.3 Team Training
- [ ] Team knows:
  - [ ] How to deploy (push to main)
  - [ ] How to monitor (GitHub Actions)
  - [ ] How to troubleshoot (check logs)
  - [ ] Who to contact if deployment fails

---

## Phase 9: Security & Compliance

### 9.1 Secret Management
- [ ] .env file NOT in repository
- [ ] .env file permissions: 600 (only runner user)
- [ ] API keys rotated periodically
- [ ] No secrets in logs or commit messages

### 9.2 Access Control
- [ ] Only authorized users can merge to main
- [ ] SSH access to EC2 restricted (security group)
- [ ] GitHub token is not shared
- [ ] Runner user is non-root

### 9.3 Audit Trail
- [ ] GitHub Actions logs all deployments
- [ ] Git history shows all changes
- [ ] EC2 logs show deployment execution
- [ ] Can trace each deployment to:
  - [ ] Who pushed the code
  - [ ] What was deployed
  - [ ] When it was deployed
  - [ ] What the result was

---

## Phase 10: Documentation & Handoff

### 10.1 Update README
- [ ] Add deployment section to main README
- [ ] Link to DEPLOYMENT.md and DEPLOY-QUICK-START.md
- [ ] Example:
  ```markdown
  ## Deployment
  
  Deployments are automated via GitHub Actions.
  
  Push to `main` branch → Automatic deployment to production
  
  See [DEPLOYMENT.md](DEPLOYMENT.md) for full setup and details.
  ```
- [ ] Commit and push

### 10.2 Create Runbooks
- [ ] Runbook: Emergency Deployment
- [ ] Runbook: Rollback
- [ ] Runbook: Runner Maintenance
- [ ] Runbook: EC2 Troubleshooting

### 10.3 Team Handoff
- [ ] Team meeting to review CI/CD
- [ ] Demo of workflow
- [ ] Q&A session
- [ ] Team has access to all documentation
- [ ] Team knows how to ask for help

---

## Troubleshooting Checklist

If something goes wrong, use this checklist:

### Workflow Won't Start
- [ ] Check runner is online: Settings → Actions → Runners
- [ ] Check runner has labels: `production`, `ec2`
- [ ] Check workflow file has correct labels: runs-on
- [ ] Check GitHub Actions minutes quota (if not self-hosted)

### Workflow Starts but Runner Not Found
- [ ] Verify runner service is running: `systemctl status actions.runner-...`
- [ ] Check runner labels: `github-runner list`
- [ ] Verify runner network connectivity
- [ ] Restart runner: `systemctl restart actions.runner-...`

### Deployment Script Fails
- [ ] SSH to EC2 and run manually: `cd ai-mastering && ./deploy.sh`
- [ ] Check logs: `cat deployment-*.log`
- [ ] Check Docker errors: `docker compose logs`
- [ ] Check disk space: `df -h`
- [ ] Check memory: `free -h`

### Services Won't Start
- [ ] Check docker-compose.yml syntax: `docker compose config`
- [ ] Check .env file exists: `ls -la backend/.env`
- [ ] Check port conflicts: `netstat -tulpn | grep 3000 or 8000`
- [ ] Check Docker daemon: `docker ps`

### Can't Access Services
- [ ] Verify containers are running: `docker ps`
- [ ] Verify ports are open: `netstat -tulpn`
- [ ] Check security group (AWS)
- [ ] Test locally: `curl http://localhost:3000`

---

## Success Criteria

✅ **You're done when**:

1. [ ] All 10 phases completed
2. [ ] Workflow appears in GitHub Actions
3. [ ] Workflow runs successfully on push to main
4. [ ] Services deploy and respond correctly
5. [ ] Team understands the CI/CD process
6. [ ] Documentation is complete and accessible
7. [ ] Monitoring and maintenance procedures established
8. [ ] Security controls verified
9. [ ] Team is trained and confident

---

## Next Steps (After Initial Setup)

### Immediate (Week 1)
- [ ] Team uses CI/CD for first few deployments
- [ ] Monitor for issues
- [ ] Adjust any problems

### Short-term (Month 1)
- [ ] Set up monitoring/alerting
- [ ] Create runbooks
- [ ] Document any workarounds

### Medium-term (Quarter 1)
- [ ] Consider staging environment
- [ ] Add automated tests to CI
- [ ] Optimize build times

### Long-term (As needed)
- [ ] Multi-region deployment
- [ ] Blue-green deployments
- [ ] Advanced observability
- [ ] Self-healing infrastructure

---

## Support Resources

- **Full Documentation**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Architecture Explanation**: [CICD-ARCHITECTURE.md](CICD-ARCHITECTURE.md)
- **Quick Reference**: [DEPLOY-QUICK-START.md](DEPLOY-QUICK-START.md)
- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Docker Compose Docs**: https://docs.docker.com/compose/

---

## Checklist Complete! 🎉

**Total Steps**: 100+ items
**Estimated Time**: 2-4 hours (for experienced dev)
**Complexity**: Medium
**Effort**: Worth it (automated deployments forever!)

---

**Last Updated**: 2026-06-01
**Version**: 1.0.0
**Status**: Ready for Implementation ✅
