#!/bin/bash
# Create read-only MySQL user for LibrePulse heartbeat metrics.
# Used by install-dashboard.sh, install-librepulse.sh, and the web installer.
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Please run as root." >&2
    exit 1
fi

mysql -u root <<'EOF'
CREATE USER IF NOT EXISTS 'rostats'@'localhost' IDENTIFIED BY 'rostats';
GRANT SELECT ON librenms.* TO 'rostats'@'localhost';
FLUSH PRIVILEGES;
EOF

echo "[+] MySQL user rostats@localhost ready (SELECT on librenms.*)"
