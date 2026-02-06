#!/usr/bin/env bash
set -e

echo "JakeBot setup starting..."

# 1. Update system
# sudo apt update

# 2. Install Node.js + npm (Ubuntu repo version is OK to start)
sudo apt install -y nodejs npm

# 3. Create project directory if needed
mkdir -p jakebot
cd jakebot

# 4. Initialize npm project if not present
if [ ! -f package.json ]; then
  npm init -y
fi

# 5. Install Playwright
npm install playwright

# 6. Install Playwright browsers
npx playwright install

echo
echo "Setup complete."
echo
echo "Next steps:"
echo "CD into jakebot, create watch.js, then run node watch.js"
echo
echo "JakeBot is ready to help Jake."
