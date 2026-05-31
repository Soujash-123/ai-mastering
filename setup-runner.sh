#!/bin/bash

################################################################################
# GitHub Actions Self-Hosted Runner Setup Script
# 
# Purpose: Automates setup of GitHub Actions runner on EC2 instance
# OS: Ubuntu 26.04 (compatible with 22.04+)
# 
# Usage: bash setup-runner.sh <GITHUB_TOKEN> <GITHUB_OWNER/REPO>
# 
# Example:
#   bash setup-runner.sh ghp_xxxxxxxxxxxx myorg/ai-mastering
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
GITHUB_TOKEN="${1}"
GITHUB_REPO="${2}"
RUNNER_HOME="/opt/github-runner"
RUNNER_USER="github-runner"
RUNNER_LABELS="production,ec2"

################################################################################
# Validation
################################################################################

if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
    echo -e "${RED}Error: Missing arguments${NC}"
    echo "Usage: bash setup-runner.sh <GITHUB_TOKEN> <GITHUB_OWNER/REPO>"
    echo "Example: bash setup-runner.sh ghp_xxxx myorg/ai-mastering"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${BLUE}GitHub Actions Runner Setup${NC}"
echo "Token: ${GITHUB_TOKEN:0:10}...***"
echo "Repository: $GITHUB_REPO"
echo "Runner Home: $RUNNER_HOME"
echo "Runner User: $RUNNER_USER"
echo "Labels: $RUNNER_LABELS"
echo ""

################################################################################
# Step 1: Update System
################################################################################

echo -e "${BLUE}[1/8]${NC} Updating system packages..."
apt-get update
apt-get upgrade -y
echo -e "${GREEN}✓ System updated${NC}"

################################################################################
# Step 2: Install Docker
################################################################################

echo -e "${BLUE}[2/8]${NC} Installing Docker..."

if command -v docker &> /dev/null; then
    echo -e "${YELLOW}✓ Docker already installed: $(docker --version)${NC}"
else
    apt-get install -y docker.io docker-compose-v2
    echo -e "${GREEN}✓ Docker installed${NC}"
fi

# Start Docker
systemctl start docker
systemctl enable docker
echo -e "${GREEN}✓ Docker enabled${NC}"

################################################################################
# Step 3: Create Runner User
################################################################################

echo -e "${BLUE}[3/8]${NC} Creating runner user..."

if id "$RUNNER_USER" &>/dev/null; then
    echo -e "${YELLOW}✓ User $RUNNER_USER already exists${NC}"
else
    useradd -m -d "$RUNNER_HOME" -s /bin/bash "$RUNNER_USER"
    echo -e "${GREEN}✓ User $RUNNER_USER created${NC}"
fi

# Add runner user to docker group
usermod -aG docker "$RUNNER_USER"
echo -e "${GREEN}✓ Runner user added to docker group${NC}"

################################################################################
# Step 4: Download GitHub Actions Runner
################################################################################

echo -e "${BLUE}[4/8]${NC} Downloading GitHub Actions Runner..."

# Get latest runner version
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4 | sed 's/v//')

echo "Latest runner version: $RUNNER_VERSION"

# Create runner directory
mkdir -p "$RUNNER_HOME"
cd "$RUNNER_HOME"

# Download runner
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
echo "Downloading: $RUNNER_URL"

if ! curl -L -o "runner.tar.gz" "$RUNNER_URL"; then
    echo -e "${RED}✗ Failed to download runner${NC}"
    exit 1
fi

tar xzf runner.tar.gz
rm runner.tar.gz

# Set ownership
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME"
echo -e "${GREEN}✓ Runner downloaded and extracted${NC}"

################################################################################
# Step 5: Configure Runner
################################################################################

echo -e "${BLUE}[5/8]${NC} Configuring runner..."

# Create config script
cat > "$RUNNER_HOME/configure-runner.sh" << 'EOFCONFIG'
#!/bin/bash
set -e

GITHUB_TOKEN="$1"
GITHUB_REPO="$2"
RUNNER_LABELS="$3"
RUNNER_NAME="$(hostname)-runner"

cd /opt/github-runner

# Configure runner
./config.sh \
  --url "https://github.com/${GITHUB_REPO}" \
  --token "$GITHUB_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --work "_work" \
  --unattended \
  --replace

echo "✓ Runner configured"
EOFCONFIG

chmod +x "$RUNNER_HOME/configure-runner.sh"
chown "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME/configure-runner.sh"

# Run configuration as runner user
su - "$RUNNER_USER" -c "$RUNNER_HOME/configure-runner.sh '$GITHUB_TOKEN' '$GITHUB_REPO' '$RUNNER_LABELS'"

echo -e "${GREEN}✓ Runner configured${NC}"

################################################################################
# Step 6: Install as Systemd Service
################################################################################

echo -e "${BLUE}[6/8]${NC} Installing runner as systemd service..."

cd "$RUNNER_HOME"
su - "$RUNNER_USER" -c "$RUNNER_HOME/svc.sh install"
echo -e "${GREEN}✓ Runner service installed${NC}"

################################################################################
# Step 7: Start Service
################################################################################

echo -e "${BLUE}[7/8]${NC} Starting runner service..."

systemctl start "actions.runner-${GITHUB_REPO/\//-}"
systemctl enable "actions.runner-${GITHUB_REPO/\//-}"

# Wait for service to start
sleep 2

if systemctl is-active --quiet "actions.runner-${GITHUB_REPO/\//-}"; then
    echo -e "${GREEN}✓ Runner service started${NC}"
else
    echo -e "${RED}✗ Failed to start runner service${NC}"
    systemctl status "actions.runner-${GITHUB_REPO/\//-}" || true
    exit 1
fi

################################################################################
# Step 8: Verify Installation
################################################################################

echo -e "${BLUE}[8/8]${NC} Verifying installation..."

# Check Docker
docker --version
docker compose version
docker ps

# Check runner user in docker group
su - "$RUNNER_USER" -c "docker ps" > /dev/null && echo -e "${GREEN}✓ Docker access verified${NC}" || {
    echo -e "${YELLOW}⚠ May need to log out and log back in for docker group membership${NC}"
}

# Check runner status
systemctl status "actions.runner-${GITHUB_REPO/\//-}" --no-pager | head -5

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ Runner Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Runner Information:"
echo "  Location: $RUNNER_HOME"
echo "  User: $RUNNER_USER"
echo "  Repository: $GITHUB_REPO"
echo "  Labels: $RUNNER_LABELS"
echo "  Service: actions.runner-${GITHUB_REPO/\//-}"
echo ""
echo "Next Steps:"
echo "1. Verify runner appears online in GitHub:"
echo "   https://github.com/${GITHUB_REPO}/settings/actions/runners"
echo ""
echo "2. Optional: Add labels in GitHub UI for organization (e.g., production, ec2)"
echo "   Labels are not required but help organize multiple runners"
echo ""
echo "3. Test deployment by pushing to main branch:"
echo "   git push origin main"
echo ""
echo "Useful Commands:"
echo "  Check status:  systemctl status actions.runner-${GITHUB_REPO/\//-}"
echo "  View logs:     journalctl -u actions.runner-${GITHUB_REPO/\//-} -f"
echo "  Restart:       systemctl restart actions.runner-${GITHUB_REPO/\//-}"
echo "  Stop:          systemctl stop actions.runner-${GITHUB_REPO/\//-}"
echo ""
