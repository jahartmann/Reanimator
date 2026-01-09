#!/bin/bash

# Configuration
APP_DIR=$(pwd)
SERVICE_NAME="proxhost-backup"
NODE_BIN=$(which node)
NPM_BIN=$(which npm)

function check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Please run as root (sudo)"
        exit 1
    fi
}

function install() {
    echo "[*] Installing Dependencies..."
    $NPM_BIN install
    
    echo "[*] Building Application..."
    $NPM_BIN run build
    
    echo "[*] Setting up Systemd Service..."
    cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=ProxHost Backup Manager
After=network.target

[Service]
Type=simple
User=$(logname 2>/dev/null || echo $SUDO_USER)
WorkingDirectory=$APP_DIR
ExecStart=$NPM_BIN start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    echo "[+] Installation Complete! Service started."
}

function update() {
    echo "[*] Pulling latest changes..."
    git pull
    
    echo "[*] Re-installing dependencies..."
    $NPM_BIN install
    
    echo "[*] Re-building application..."
    $NPM_BIN run build
    
    echo "[*] Restarting service..."
    check_root
    systemctl restart $SERVICE_NAME
    
    echo "[+] Update Complete!"
}

function restart() {
    check_root
    echo "[*] Restarting service..."
    systemctl restart $SERVICE_NAME
    echo "[+] Restarted."
}

case "$1" in
    install)
        check_root
        install
        ;;
    update)
        update
        ;;
    restart)
        restart
        ;;
    *)
        echo "Usage: $0 {install|update|restart}"
        exit 1
        ;;
esac
