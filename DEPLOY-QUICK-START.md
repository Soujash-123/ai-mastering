# CI/CD Quick Reference

## TL;DR - First Time Setup

### 1. On Your Local Machine
```bash
# Clone repo
git clone https://github.com/YOUR_ORG/ai-mastering.git
cd ai-mastering

# Make deploy.sh executable locally (GitHub will handle this)
chmod +x deploy.sh
```

### 2. On AWS EC2 Instance (Ubuntu 26.04)
```bash
# SSH to EC2
ssh ubuntu@your-ec2-ip

# Run setup script (with your GitHub token & repo)
curl -o setup-runner.sh https://raw.githubusercontent.com/YOUR_ORG/ai-mastering/main/setup-runner.sh
sudo bash setup-runner.sh ghp_YOUR_GITHUB_TOKEN YOUR_ORG/ai-mastering

# Create .env file with your OpenAI key
mkdir -p /opt/github-runner/ai-mastering/backend
cat > /opt/github-runner/ai-mastering/backend/.env << 'EOF'
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
EOF
```

### 3. Configure GitHub Runner (Optional)
- Go to: https://github.com/YOUR_ORG/ai-mastering/settings/actions/runners
- Find your runner in the list
- Labels are optional but can be useful for managing multiple runners
- If desired, add labels for organization (e.g., `production`, `ec2`)

### 4. Test Deployment
```bash
# Push any change to main
git add .
git commit -m "test: trigger deployment"
git push origin main

# Watch: https://github.com/YOUR_ORG/ai-mastering/actions
```

---

## File Structure

```
ai-mastering/
├── .github/
│   └── workflows/
│       └── deploy.yml              # ← GitHub Actions workflow
├── backend/
│   ├── .env                        # ← Created on EC2 (NOT in repo)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── api/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── app/
├── deploy.sh                       # ← Deployment script (executable)
├── docker-compose.yml
├── DEPLOYMENT.md                   # ← Full documentation
└── setup-runner.sh                 # ← Runner setup automation
```

---

## Deployment Flow

```
You push to main
    ↓
GitHub Actions triggers
    ↓
Runner on EC2 executes .github/workflows/deploy.yml
    ↓
deploy.yml runs ./deploy.sh
    ↓
deploy.sh:
  1. Stops old containers
  2. Builds new images (--no-cache)
  3. Starts new containers
  4. Waits for readiness
  5. Cleans up Docker resources
    ↓
Services running at:
  - Frontend: http://your-ec2-ip:3000
  - Backend:  http://your-ec2-ip:8000
```

---

## Essential Commands

### On EC2

```bash
# Check runner status
systemctl status actions.runner-YOUR_ORG-ai-mastering

# View runner logs
journalctl -u actions.runner-YOUR_ORG-ai-mastering -f

# Check running containers
docker compose -f /opt/github-runner/ai-mastering/docker-compose.yml ps

# View service logs
docker compose -f /opt/github-runner/ai-mastering/docker-compose.yml logs -f

# Manually deploy (if needed)
cd /opt/github-runner/ai-mastering
./deploy.sh

# Check disk space
df -h

# Check resource usage
docker stats
```

### On GitHub

```bash
# View deployment workflow
Actions tab → Deploy to Production

# Check runner status
Settings → Actions → Runners

# View workflow runs
https://github.com/YOUR_ORG/ai-mastering/actions
```

---

## Common Issues

### Issue: "Runner is offline"
**Solution**: SSH to EC2 and restart the runner
```bash
sudo systemctl restart actions.runner-YOUR_ORG-ai-mastering
```

### Issue: "workflow did not detect runner"
**Solution**: 
1. Verify runner is online (not "Offline" status)
2. Check runner is actually running: `systemctl status actions.runner-YOUR_ORG-ai-mastering`
3. Runner doesn't need specific labels; `runs-on: self-hosted` matches any registered runner

### Issue: "OPENAI_API_KEY not set"
**Solution**: Create backend/.env on EC2
```bash
cat > backend/.env << 'EOF'
OPENAI_API_KEY=sk-proj-...
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
EOF
```

### Issue: "Port 3000 or 8000 already in use"
**Solution**:
```bash
# Find process using port
lsof -i :3000
lsof -i :8000

# Kill it
kill -9 <PID>

# Or just restart
docker compose down && docker compose up -d
```

### Issue: "Disk full - deployment failed"
**Solution**:
```bash
# Clean up Docker
docker system prune -a -f

# Check actual space
df -h

# Remove old containers/images if necessary
docker rmi <image-id>
```

---

## Environment Variables

### backend/.env (on EC2, not in repo)
```bash
OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE
OPENAI_MASTERING_MODEL=gpt-5.1
AI_MASTERING_DATA_DIR=./data
```

### Frontend (from docker-compose.yml)
```bash
NEXT_PUBLIC_API_BASE=http://localhost:8000
# or for production: https://your-domain.com
```

---

## Secrets Management (DO NOT COMMIT)

```bash
# Good ✓
# .env files excluded via .gitignore
# Secrets stored on EC2 only

# BAD ✗
# Committing .env to repository
# Committing API keys in code
# Committing docker-compose with secrets

# Always:
# git add backend/.env        # ← Shows it's ignored
# ✓ backend/.env is not staged
```

---

## Monitoring Checklist

### After Deployment
- [ ] Workflow completed successfully (green ✅)
- [ ] Runner shows "Idle" (not offline)
- [ ] Containers are running: `docker ps`
- [ ] Backend responds: `curl http://localhost:8000/docs`
- [ ] Frontend responds: `curl http://localhost:3000`
- [ ] No error logs: `docker compose logs`

### Regular Maintenance
- [ ] Check disk space weekly: `df -h`
- [ ] Monitor Docker resources: `docker stats`
- [ ] Review deployment logs: `deployment-*.log`
- [ ] Update dependencies monthly
- [ ] Test rollback procedures quarterly

---

## Security Checklist

- [ ] .env file in .gitignore
- [ ] No hardcoded secrets in code
- [ ] GitHub token securely generated
- [ ] EC2 security group restricts SSH
- [ ] Runner user is non-root (runs as `github-runner`)
- [ ] Docker group membership limited
- [ ] Backups of backend/data directory
- [ ] Review runner access regularly

---

## Performance Tips

1. **Faster Builds**
   - Use Docker layer caching (don't use `--no-cache` in CI)
   - Keep Dockerfiles optimized
   - Minimize image size

2. **Faster Deployments**
   - Use smaller base images (python:3.12-slim is good)
   - Multi-stage builds for frontend (already done)
   - Cache dependencies in Docker layers

3. **Faster Testing**
   - Run tests before deployment (add CI step)
   - Use parallel test execution
   - Cache test dependencies

---

## Useful Links

- GitHub Actions Docs: https://docs.github.com/en/actions
- Docker Compose Docs: https://docs.docker.com/compose/
- Self-Hosted Runners: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners
- AWS EC2 Docs: https://docs.aws.amazon.com/ec2/

---

## Support Resources

### Documentation
- Full setup: See [DEPLOYMENT.md](DEPLOYMENT.md)
- Troubleshooting: See [DEPLOYMENT.md#Troubleshooting-Guide](DEPLOYMENT.md#troubleshooting-guide)

### Local Testing
```bash
# Test deploy.sh locally (dry-run)
./deploy.sh  # Requires Docker

# View the workflow file
cat .github/workflows/deploy.yml
```

### GitHub Actions Debugging
```bash
# Enable debug logging
Settings → Secrets and variables → Actions
Add: ACTIONS_STEP_DEBUG=true

# Then push and check Actions logs for verbose output
```

---

## Version Info

- **Created**: 2026-06-01
- **Tested on**: Ubuntu 26.04, Docker 26+, GitHub Actions
- **Python**: 3.12
- **Node.js**: 22 (Alpine)

---

## Quick Links for Your Repository

Replace `YOUR_ORG` with your actual GitHub organization:

- **Runner Status**: https://github.com/YOUR_ORG/ai-mastering/settings/actions/runners
- **Workflow Runs**: https://github.com/YOUR_ORG/ai-mastering/actions
- **Repository Settings**: https://github.com/YOUR_ORG/ai-mastering/settings

---

## Need Help?

1. **Check deployment logs**: `cat deployment-YYYYMMDD-HHMMSS.log`
2. **Check workflow logs**: GitHub Actions UI
3. **Check container logs**: `docker compose logs -f`
4. **Review full docs**: [DEPLOYMENT.md](DEPLOYMENT.md)
5. **Test manually**: `./deploy.sh` on EC2
