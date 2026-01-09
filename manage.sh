#!/bin/bash

# Configuration
APP_DIR=$(pwd)
SERVICE_NAME="proxhost-backup"

# Helper to check root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Please run as root (sudo)"
        exit 1
    fi
}

# Auto-install dependencies if missing
ensure_dependencies() {
    check_root
    
    # Check for curl
    if ! command -v curl &> /dev/null; then
        echo "[*] Installing curl..."
        apt-get update && apt-get install -y curl
    fi

    # Check for Git
    if ! command -v git &> /dev/null; then
        echo "[*] Installing Git..."
        apt-get install -y git
    fi

    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo "[!] Node.js not found. Installing Node.js 20.x (LTS)..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        echo "[+] Node.js installed."
    fi

    # Check for npm explicitly (usually comes with nodejs, but good to verify)
    if ! command -v npm &> /dev/null; then
        echo "[!] npm not found. Installing..."
        apt-get install -y npm
    fi
}

# Resolve binaries after potential install
NODE_BIN=$(which node 2>/dev/null)
NPM_BIN=$(which npm 2>/dev/null)

do_install() {
    ensure_dependencies
    
    # refresh binaries
    NODE_BIN=$(which node)
    NPM_BIN=$(which npm)
    
    echo "[*] Installing Dependencies (inc. dev)..."
    # Ensure we install dev dependencies so we can build
    $NPM_BIN install --include=dev
    
    echo "[*] Building Application..."
    $NPM_BIN run build
    
    echo "[*] Setting up Systemd Service..."
    cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=ProxHost Backup Manager
After=network.target

[Service]
Type=simple
User=$(logname 2>/dev/null || echo $SUDO_USER || echo root)
WorkingDirectory=$APP_DIR
ExecStart=$NPM_BIN start
Restart=always
Environment=NODE_ENV=production
# Increase file descriptor limit just in case
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    echo "[+] Installation Complete! Service started."
    echo "[+] Access the app at http://$(hostname -I | cut -d' ' -f1):3000"
}

do_update() {
    ensure_dependencies
     # refresh binaries
    NPM_BIN=$(which npm)
    
    echo "[*] Pulling latest changes..."
    git pull
    
    echo "[*] Re-installing dependencies (inc. dev)..."
    $NPM_BIN install --include=dev
    
    echo "[*] Re-building application..."
    $NPM_BIN run build
    
    echo "[*] Restarting service..."
    check_root
    systemctl restart $SERVICE_NAME
    
    echo "[+] Update Complete!"
}

do_restart() {
    check_root
    echo "[*] Restarting service..."
    systemctl restart $SERVICE_NAME
    echo "[+] Restarted."
}

case "$1" in
    install)
        # Verify dependecies first
        ensure_dependencies
        do_install
        ;;
    update)
        do_update
        ;;
    restart)
        do_restart
        ;;
    *)
        echo "Usage: $0 {install|update|restart}"
        exit 1
        ;;
esac
