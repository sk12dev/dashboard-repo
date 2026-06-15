#!/bin/bash
set -euo pipefail

TMP_KEY_FILE="/tmp/librepulse-api-key"
CRON_FILE="/etc/cron.d/librepulse"
HEARTBEAT_SCRIPT="/opt/librepulse/librepulse-heartbeat.sh"
LIBREPULSE_URL="https://librepulse.solutionk12.com"
LOG_FILE="/tmp/apply-librepulse.log"

log() {
    echo "$(date -Iseconds) $*" >> "$LOG_FILE"
}

if [[ "${1:-}" == "--verify" ]]; then
    if [[ ! -f "$TMP_KEY_FILE" ]]; then
        echo "API key file not found at $TMP_KEY_FILE" >&2
        exit 1
    fi
    if [[ ! -s "$TMP_KEY_FILE" ]]; then
        echo "API key file at $TMP_KEY_FILE is empty" >&2
        exit 1
    fi
    if [[ ! -x "$HEARTBEAT_SCRIPT" ]]; then
        echo "LibrePulse heartbeat script not found at $HEARTBEAT_SCRIPT" >&2
        exit 1
    fi
    exit 0
fi

: > "$LOG_FILE"
log "Starting LibrePulse configuration"

if command -v ensure-rostats-user.sh &>/dev/null; then
    ensure-rostats-user.sh >> "$LOG_FILE" 2>&1
elif [[ -x /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh ]]; then
    bash /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh >> "$LOG_FILE" 2>&1
else
    mysql -u root <<'EOF' >> "$LOG_FILE" 2>&1
CREATE USER IF NOT EXISTS 'rostats'@'localhost' IDENTIFIED BY 'rostats';
GRANT SELECT ON librenms.* TO 'rostats'@'localhost';
FLUSH PRIVILEGES;
EOF
    echo "[+] MySQL user rostats@localhost ready (SELECT on librenms.*)" >> "$LOG_FILE"
fi
log "MySQL rostats user ready"

if [[ ! -f "$TMP_KEY_FILE" ]]; then
    log "ERROR: API key file not found at $TMP_KEY_FILE"
    echo "API key file not found at $TMP_KEY_FILE" >&2
    exit 1
fi

if [[ ! -x "$HEARTBEAT_SCRIPT" ]]; then
    log "ERROR: Heartbeat script not found at $HEARTBEAT_SCRIPT"
    echo "LibrePulse heartbeat script not found at $HEARTBEAT_SCRIPT" >&2
    exit 1
fi

API_KEY="$(tr -d '\r\n' < "$TMP_KEY_FILE")"

if [[ -z "$API_KEY" ]]; then
    log "ERROR: API key is empty"
    echo "API key is empty" >&2
    exit 1
fi

if [[ "$API_KEY" =~ [\$\"\\\`\'] ]]; then
    log "ERROR: API key contains invalid characters"
    echo "API key contains invalid characters" >&2
    exit 1
fi

cat > "$CRON_FILE" << EOF
# LibrePulse heartbeat — configured by customer web installer
*/5 * * * * root LIBREPULSE_URL="${LIBREPULSE_URL}" LIBREPULSE_API_KEY="${API_KEY}" ${HEARTBEAT_SCRIPT}
EOF

chmod 644 "$CRON_FILE"
chown root:root "$CRON_FILE"
rm -f "$TMP_KEY_FILE"

log "LibrePulse cron job installed at $CRON_FILE"
echo "LIBREPULSE_SETUP_COMPLETE"
