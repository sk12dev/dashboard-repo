#!/bin/bash
set -euo pipefail

TMP_FILE="/tmp/99-custom.yaml"
NETPLAN_FILE="/etc/netplan/99-custom.yaml"
LOG_FILE="/tmp/apply-network.log"

log() {
    echo "$(date -Iseconds) $*" >> "$LOG_FILE"
}

if [[ "${1:-}" == "--verify" ]]; then
    if [[ ! -f "$TMP_FILE" ]]; then
        echo "Netplan config not found at $TMP_FILE" >&2
        exit 1
    fi
    if [[ ! -s "$TMP_FILE" ]]; then
        echo "Netplan config at $TMP_FILE is empty" >&2
        exit 1
    fi
    exit 0
fi

: > "$LOG_FILE"
log "Starting network apply"

if [[ ! -f "$TMP_FILE" ]]; then
    log "ERROR: Netplan config not found at $TMP_FILE"
    echo "Netplan config not found at $TMP_FILE" >&2
    exit 1
fi

mv "$TMP_FILE" "$NETPLAN_FILE"
chmod 600 "$NETPLAN_FILE"
chown root:root "$NETPLAN_FILE"
log "Installed $NETPLAN_FILE"

if ! netplan apply 2>>"$LOG_FILE"; then
    log "ERROR: netplan apply failed"
    echo "netplan apply failed; see $LOG_FILE" >&2
    exit 1
fi

log "Network apply completed successfully"
