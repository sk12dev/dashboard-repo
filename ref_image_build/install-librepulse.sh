#!/bin/bash
# Install LibrePulse heartbeat on an existing STEP appliance.
# Downloads the heartbeat script and schedules it via cron.
# Run as root: sudo bash install-librepulse.sh
set -euo pipefail

CRON_FILE="/etc/cron.d/librepulse"
HEARTBEAT_DIR="/opt/librepulse"
HEARTBEAT_SCRIPT="${HEARTBEAT_DIR}/librepulse-heartbeat.sh"
LIBREPULSE_URL="https://librepulse.solutionk12.com"
HEARTBEAT_URL="${LIBREPULSE_URL}/scripts/librepulse-heartbeat.sh"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Please run as root: sudo bash $0" >&2
    exit 1
fi

if [[ ! -d /opt/librenms ]]; then
    echo "LibreNMS not found at /opt/librenms. Is this a STEP appliance?" >&2
    exit 1
fi

echo
echo "####################################"
echo "Installing LibrePulse"
echo "####################################"
echo

mkdir -p "$HEARTBEAT_DIR"
wget -q -O "$HEARTBEAT_SCRIPT" "$HEARTBEAT_URL"
chmod +x "$HEARTBEAT_SCRIPT"
echo "[+] Heartbeat script installed at ${HEARTBEAT_SCRIPT}"

if command -v ensure-rostats-user.sh &>/dev/null; then
    ensure-rostats-user.sh
elif [[ -x /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh ]]; then
    bash /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh
else
    mysql -u root <<'EOF'
CREATE USER IF NOT EXISTS 'rostats'@'localhost' IDENTIFIED BY 'rostats';
GRANT SELECT ON librenms.* TO 'rostats'@'localhost';
FLUSH PRIVILEGES;
EOF
    echo "[+] MySQL user rostats@localhost ready (SELECT on librenms.*)"
fi

echo
echo "Enter your LibrePulse API key (paste from ${LIBREPULSE_URL}):"
read -r -s API_KEY
echo

API_KEY="$(printf '%s' "$API_KEY" | tr -d '\r\n')"

if [[ -z "$API_KEY" ]]; then
    echo "API key cannot be empty." >&2
    exit 1
fi

if [[ "$API_KEY" =~ [\$\"\\\`\'] ]]; then
    echo "API key contains invalid characters." >&2
    exit 1
fi

cat > "$CRON_FILE" << EOF
# LibrePulse heartbeat — configured by install-librepulse.sh
*/5 * * * * root LIBREPULSE_URL="${LIBREPULSE_URL}" LIBREPULSE_API_KEY="${API_KEY}" ${HEARTBEAT_SCRIPT}
EOF

chmod 644 "$CRON_FILE"
chown root:root "$CRON_FILE"

echo "[+] Cron job installed at ${CRON_FILE} (every 5 minutes)"
echo
echo "LibrePulse installation complete."
