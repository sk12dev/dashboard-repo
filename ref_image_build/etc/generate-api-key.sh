#!/bin/bash
# Generate a LibreNMS API token for STEP NetTools and write /etc/step-tools/config.php
set -euo pipefail

DB_NAME="${DB_NAME:-librenms}"
API_USER="${API_USER:-api-ro}"
API_TOKEN_DESCRIPTION="${API_TOKEN_DESCRIPTION:-STEP-NetTools Auto Generated Token}"
LIBRENMS_PATH="${LIBRENMS_PATH:-/opt/librenms}"
CONFIG_DIR="/etc/step-tools"
CONFIG_FILE="${CONFIG_DIR}/config.php"

if [ ! -d "$LIBRENMS_PATH" ]; then
    echo "LibreNMS not found at ${LIBRENMS_PATH}" >&2
    exit 1
fi

APP_URL=$(grep -E '^APP_URL=' "$LIBRENMS_PATH/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$APP_URL" ]; then
    echo "APP_URL not set in ${LIBRENMS_PATH}/.env" >&2
    exit 1
fi

API_USER_ID=$(mysql -u root -Nse "SELECT user_id FROM ${DB_NAME}.users WHERE username='${API_USER}';")
if [ -z "$API_USER_ID" ]; then
    echo "API user '${API_USER}' not found. Run install-dashboard.sh first." >&2
    exit 1
fi

API_TOKEN=$(openssl rand -hex 16)

mysql -u root -e "INSERT INTO ${DB_NAME}.api_tokens (user_id, token_hash, description, disabled) VALUES (${API_USER_ID}, '${API_TOKEN}', '${API_TOKEN_DESCRIPTION}', 0);"

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" << EOF
<?php

return [
    'librenms_url' => '${APP_URL}',
    'api_token' => '${API_TOKEN}',
];
EOF

chmod 640 "$CONFIG_FILE"
chown root:www-data "$CONFIG_FILE"

echo "API token created for user '${API_USER}'."
echo "Configuration written to ${CONFIG_FILE}"
echo ""
echo "API token (copy now — not stored elsewhere):"
echo "  ${API_TOKEN}"
