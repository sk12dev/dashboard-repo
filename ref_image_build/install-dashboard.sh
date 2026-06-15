#!/bin/bash
# STEP - Installer for all tools and software for Appliance
# Created by: Andy Hobbs
# Version: 1.0.0
# Date: 2026-02-28
# Description: This script is used to install LibreNMS and the dependencies on a Ubuntu 22.04 server.
# It will update the APT repositories, install the required dependencies, create the LibreNMS user,
# clone the LibreNMS GitHub Repository, set the permissions for the LibreNMS user,
# configure the LibreNMS, and apply the database schemas.
# It will then configure the Nginx for LibreNMS and apply the database schemas.
# It will then setup the LibreNMS user and apply the database schemas.
# make sure to run sudo bash first
# Exit on any error


set -e
echo
echo "#################################"
echo "Starting LibreNMS installation..."
echo "#################################"
echo
echo "Please enter the Webserver hostname for the LibreNMS server: "
read WEBSERVERHOSTNAME

echo "Please enter the Database password for the LibreNMS server: "
read DATABASEPASSWORD

echo "Please enter the password for the librenms system user: "
read -s LIBRENMS_PASSWORD
echo

echo "Please enter the password for the LibreNMS web admin login (user: admin)"
echo "Make sure this password is strong or install will fail: "
read -s WEB_ADMIN_PASSWORD
echo

echo
echo "############################"
echo "Installing required packages"
echo "############################" 
echo

apt update -y
apt install -y acl curl fping git graphviz imagemagick mariadb-client mariadb-server mtr-tiny nginx-full nmap php-cli php-curl php-fpm php-gd php-gmp php-json php-mbstring php-mysql php-snmp php-xml php-zip rrdtool snmp snmpd unzip python3-command-runner python3-pymysql python3-dotenv python3-redis python3-setuptools python3-psutil python3-systemd python3-pip whois traceroute iputils-ping tcpdump vim cron

echo
echo "######################"
echo "Creating librenms user"
echo "######################"
echo

useradd librenms -d /opt/librenms -M -r -s "$(which bash)"
echo "librenms:${LIBRENMS_PASSWORD}" | chpasswd

echo "###########################"
echo "Cloning LibreNMS repository"
echo "###########################"
echo

cd /opt
git clone https://github.com/sk12dev/librenms.git 
#'https://github.com/librenms/librenms.git


echo
echo "############################################"
echo "Setting permissions for LibreNMS directories"
echo "############################################"
echo 

chown -R librenms:librenms /opt/librenms
chmod 771 /opt/librenms
setfacl -d -m g::rwx /opt/librenms/rrd /opt/librenms/logs /opt/librenms/bootstrap/cache/ /opt/librenms/storage/
setfacl -R -m g::rwx /opt/librenms/rrd /opt/librenms/logs /opt/librenms/bootstrap/cache/ /opt/librenms/storage/

echo "################################"
echo "Installing Composer dependencies"
echo "################################"
echo

su - librenms -c "/opt/librenms/scripts/composer_wrapper.php install --no-dev"

echo
echo "########################"
echo "Select timezone (US)"
echo "########################"
echo "  1) Eastern       (America/New_York)"
echo "  2) Central       (America/Chicago)"
echo "  3) Mountain      (America/Denver)"
echo "  4) Arizona       (America/Phoenix)"
echo "  5) Pacific       (America/Los_Angeles)"
echo "  6) Alaska        (America/Anchorage)"
echo "  7) Hawaii        (Pacific/Honolulu)"
echo "  8) Puerto Rico   (America/Puerto_Rico)"
echo "  9) Guam          (Pacific/Guam)"
while true; do
  read -p "Enter choice [1-9] (default 1): " TZ_CHOICE
  TZ_CHOICE=${TZ_CHOICE:-1}
  case "$TZ_CHOICE" in
    1) TIMEZONE="America/New_York"; break ;;
    2) TIMEZONE="America/Chicago"; break ;;
    3) TIMEZONE="America/Denver"; break ;;
    4) TIMEZONE="America/Phoenix"; break ;;
    5) TIMEZONE="America/Los_Angeles"; break ;;
    6) TIMEZONE="America/Anchorage"; break ;;
    7) TIMEZONE="Pacific/Honolulu"; break ;;
    8) TIMEZONE="America/Puerto_Rico"; break ;;
    9) TIMEZONE="Pacific/Guam"; break ;;
    *) echo "Invalid choice. Please enter 1-9." ;;
  esac
done

echo
echo "########################"
echo "Configuring PHP timezone"
echo "########################"

sed -i "s|;date.timezone =|date.timezone = ${TIMEZONE}|" /etc/php/8.3/fpm/php.ini
sed -i "s|;date.timezone =|date.timezone = ${TIMEZONE}|" /etc/php/8.3/cli/php.ini

echo
echo "#############################################"
echo "Setting system timezone to ${TIMEZONE}"
echo "#############################################"
echo
timedatectl set-timezone "${TIMEZONE}"

echo "############################"
echo "Configuring MariaDB settings"
echo "############################"
echo

sed -i '/\[mysqld\]/a \
innodb_file_per_table=1 \
lower_case_table_names=0' /etc/mysql/mariadb.conf.d/50-server.cnf

echo "###############################"
echo "Enabling and restarting MariaDB"
echo "###############################"
echo

systemctl enable mariadb
systemctl restart mariadb

echo
echo "###################################"
echo "Creating LibreNMS database and user"
echo "###################################"


mysql -u root <<EOF
CREATE DATABASE librenms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'librenms'@'localhost' IDENTIFIED BY '$DATABASEPASSWORD';
GRANT ALL PRIVILEGES ON librenms.* TO 'librenms'@'localhost';
EOF


echo
echo "#####################################"
echo "Configuring PHP-FPM pool for LibreNMS"
echo "#####################################"

cp /etc/php/8.3/fpm/pool.d/www.conf /etc/php/8.3/fpm/pool.d/librenms.conf
sed -i 's/user = www-data/user = librenms/' /etc/php/8.3/fpm/pool.d/librenms.conf
sed -i 's/group = www-data/group = librenms/' /etc/php/8.3/fpm/pool.d/librenms.conf
sed -i 's/\[www\]/\[librenms\]/' /etc/php/8.3/fpm/pool.d/librenms.conf
sed -i 's|listen = /run/php/php8.3-fpm.sock|listen = /run/php-fpm-librenms.sock|' /etc/php/8.3/fpm/pool.d/librenms.conf



echo
echo "##############################"
echo "Configuring Nginx for LibreNMS"
echo "##############################"

cat << EOF > /etc/nginx/conf.d/librenms.conf
server {
 listen      80;
 server_name $WEBSERVERHOSTNAME;
 root        /opt/librenms/html;
 index       index.php;

 charset utf-8;
 gzip on;
 gzip_types text/css application/javascript text/javascript application/x-javascript image/svg+xml text/plain text/xsd text/xsl text/xml image/x-icon;

 location = /step-tools {
  return 301 /step-tools/;
 }

 location ^~ /step-tools/ {
  alias /opt/step-tools/;
  index index.html;

  location ~ ^/step-tools/includes/ {
   deny all;
  }

  location ~ \.php\$ {
   include snippets/fastcgi-php.conf;
   fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
   fastcgi_param SCRIPT_FILENAME \$request_filename;
  }

  try_files \$uri \$uri/ =404;
 }

 location / {
  try_files \$uri \$uri/ /index.php?\$query_string;
 }
 location ~ [^/]\.php(/|$) {
  fastcgi_pass unix:/run/php-fpm-librenms.sock;
  fastcgi_split_path_info ^(.+\.php)(/.+)$;
  include fastcgi.conf;
 }
 location ~ /\.(?!well-known).* {
  deny all;
 }
}
EOF



echo
echo "####################################"
echo "Removing default Nginx configuration"
echo "####################################"

rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default

echo
echo "Restarting Nginx and PHP-FPM..."
echo
systemctl restart nginx
systemctl restart php8.3-fpm

echo "#######################"
echo "Setting up lnms command"
echo "#######################"
echo

ln -s /opt/librenms/lnms /usr/bin/lnms
cp /opt/librenms/misc/lnms-completion.bash /etc/bash_completion.d/

echo "################"
echo "Configuring SNMP"
echo "################"

cp /opt/librenms/snmpd.conf.example /etc/snmp/snmpd.conf
sed -i 's/RANDOMSTRINGGOESHERE/public/' /etc/snmp/snmpd.conf
curl -o /usr/bin/distro https://raw.githubusercontent.com/librenms/librenms-agent/master/snmp/distro
chmod +x /usr/bin/distro
systemctl enable snmpd
systemctl restart snmpd


cp /opt/librenms/dist/librenms.cron /etc/cron.d/librenms

echo
echo "#############################"
echo "Setting up LibreNMS scheduler"
echo "#############################"
echo

cp /opt/librenms/dist/librenms-scheduler.service /opt/librenms/dist/librenms-scheduler.timer /etc/systemd/system/
systemctl enable librenms-scheduler.timer
systemctl start librenms-scheduler.timer

echo
echo "##################################"
echo "Configuring logrotate for LibreNMS"
echo "##################################"

cp /opt/librenms/misc/librenms.logrotate /etc/logrotate.d/librenms

echo
echo "##########################################"
echo "Configuring LibreNMS application (.env)"
echo "##########################################"

LIBRENMS_PATH="/opt/librenms"
DB_HOST="127.0.0.1"
DB_NAME="librenms"
DB_USER="librenms"
DB_PASS="$DATABASEPASSWORD"
APP_URL="http://${WEBSERVERHOSTNAME}"
ADMIN_USER="admin"
ADMIN_PASS="$WEB_ADMIN_PASSWORD"
API_USER="api-ro"
API_PASS="stepcg123"
API_EMAIL="api-ro@stepcg.com"
API_TOKEN_DESCRIPTION="STEP-NetTools Auto Generated Token"
GENERATED_API_TOKEN=""

cd "$LIBRENMS_PATH"

if [ ! -f .env ]; then
    cp .env.example .env
    chown librenms:librenms .env
fi

sed -i "s|^#\?DB_HOST=.*|DB_HOST=${DB_HOST}|" .env
sed -i "s|^#\?DB_DATABASE=.*|DB_DATABASE=${DB_NAME}|" .env
sed -i "s|^#\?DB_USERNAME=.*|DB_USERNAME=${DB_USER}|" .env
sed -i "s|^#\?DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" .env
sed -i "s|^#\?APP_URL=.*|APP_URL=${APP_URL}|" .env
grep -q '^APP_URL=' .env || echo "APP_URL=${APP_URL}" >> .env

echo "[+] Generating Laravel Application Key..."
sudo -u librenms php artisan key:generate --force

echo "[+] Running database migrations (this may take a moment)..."
sudo -u librenms ./lnms migrate --force

echo "[+] Creating administrative user account..."
if sudo -u librenms ./lnms user:list | grep -q " ${ADMIN_USER} "; then
    echo "[!] User '${ADMIN_USER}' already exists. Skipping creation."
else
    sudo -u librenms ./lnms user:add --password="${ADMIN_PASS}" --role=admin "${ADMIN_USER}"
    echo "[+] User '${ADMIN_USER}' created successfully."
fi

echo "[+] Creating API read-only user account..."
if sudo -u librenms ./lnms user:list | grep -q " ${API_USER} "; then
    echo "[!] User '${API_USER}' already exists. Skipping creation."
else
    sudo -u librenms ./lnms user:add \
        --password="${API_PASS}" \
        --email="${API_EMAIL}" \
        --role=global-read \
        "${API_USER}"
    echo "[+] User '${API_USER}' created successfully with global-read permissions."
fi

echo "[+] Generating API token for '${API_USER}'..."
API_USER_ID=$(mysql -u root -Nse "SELECT user_id FROM ${DB_NAME}.users WHERE username='${API_USER}';")

if [ -z "$API_USER_ID" ]; then
    echo "[-] Error: User '${API_USER}' not found in database. Skipping API token generation."
else
    EXISTING_TOKENS=$(mysql -u root -Nse "SELECT COUNT(*) FROM ${DB_NAME}.api_tokens WHERE user_id=${API_USER_ID};")
    if [ "${EXISTING_TOKENS}" -gt 0 ]; then
        echo "[!] API token already exists for '${API_USER}'. Skipping generation."
    else
        API_TOKEN=$(openssl rand -hex 16)
        mysql -u root -e "INSERT INTO ${DB_NAME}.api_tokens (user_id, token_hash, description, disabled) VALUES (${API_USER_ID}, '${API_TOKEN}', '${API_TOKEN_DESCRIPTION}', 0);"
        GENERATED_API_TOKEN="$API_TOKEN"
        echo "[+] API token created for '${API_USER}'."
    fi
fi

echo "[+] Marking installation complete (skip web installer)..."
# composer_wrapper sets INSTALL=true when config.php is missing; the web installer
# finish step removes it and creates config.php — do the same after CLI setup.
sed -i '/^INSTALL=/d' .env
if [ ! -f config.php ]; then
    cp config.php.default config.php
    chown librenms:librenms config.php
fi
if ! grep -q '^NODE_ID=' .env; then
    NODE_ID=$(sudo -u librenms php -r 'echo uniqid();')
    echo "NODE_ID=${NODE_ID}" >> .env
fi
chown librenms:librenms .env
sudo -u librenms php artisan config:clear

echo "[+] Running final validation check..."
echo "----------------------------------------------------"
if ! sudo -u librenms ./validate.php; then
    echo "[!] Validation reported issues. Review the output above; installation will continue."
fi
echo "----------------------------------------------------"

echo
echo "#####################"
echo "Fixing log permission"
echo "#####################"
echo

while true; do
  if [ -f /opt/librenms/logs/librenms.log ]; then
    chown librenms:librenms /opt/librenms/logs/librenms.log
    break
  else
    echo "Waiting until log file appears to change permission..."
    sleep 1
  fi
done



echo "####################################################"
echo "LibreNMS installation and configuration complete"
echo "Login at: ${APP_URL}"
echo "####################################################"

echo
echo "#########################################################"
echo "Starting Syslog-NG Installation and Configuration..."
echo "#########################################################"
echo


echo "####################################"
echo "Installing and configuring syslog-ng"
echo "####################################"
echo
apt-get install -y syslog-ng



echo "Copying the STEP Specific syslog-ng configuration files"
#cp -r /opt/dashboard-repo/ref_image_build/etc/syslog-ng/conf.d/. /etc/syslog-ng/conf.d/

echo "Creating SQL database for syslog-ng"
mysql -u root -p$DATABASEPASSWORD < /opt/dashboard-repo/ref_image_build/etc/syslog-ng/create_ilog_db.sql


echo "Restarting syslog-ng..."
systemctl restart syslog-ng


echo "####################################################"
echo "Installing LibrePulse"
echo "####################################################"
chmod +x /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh
ln -sf /opt/dashboard-repo/ref_image_build/etc/mysql/ensure-rostats-user.sh /usr/local/bin/ensure-rostats-user.sh
ensure-rostats-user.sh
mkdir -p /opt/librepulse
cd /opt/librepulse
wget https://librepulse.solutionk12.com/scripts/librepulse-heartbeat.sh
chmod +x /opt/librepulse/librepulse-heartbeat.sh

echo
echo "####################################################"
echo "Installing and Configuring STEP NetTools"
echo "####################################################"
mkdir -p /opt/step-tools
cp -r /opt/dashboard-repo/ref_image_build/step-tools/. /opt/step-tools/
chown -R www-data:www-data /opt/step-tools
chmod -R 755 /opt/step-tools

mkdir -p /etc/step-tools
if [ -n "$GENERATED_API_TOKEN" ]; then
    cat << EOF > /etc/step-tools/config.php
<?php

return [
    'librenms_url' => '${APP_URL}',
    'api_token' => '${GENERATED_API_TOKEN}',
];
EOF
    chmod 640 /etc/step-tools/config.php
    chown root:www-data /etc/step-tools/config.php
    echo "[+] STEP NetTools API config written to /etc/step-tools/config.php"
else
    echo "[!] No new API token generated; run ref_image_build/etc/generate-api-key.sh to configure STEP NetTools"
fi

chmod +x /opt/dashboard-repo/ref_image_build/etc/generate-api-key.sh
ln -sf /opt/dashboard-repo/ref_image_build/etc/generate-api-key.sh /usr/local/bin/generate-api-key.sh

rm -f /etc/nginx/conf.d/step-tools.conf

echo "[+] STEP NetTools available at ${APP_URL}/step-tools/"

echo
echo "####################################################"
echo "Installing and Configuring Customer Web Installer"
echo "####################################################"
# TO DO: Install and configure Customer Web Installer
mkdir -p /opt/customer-web-installer
chown -R www-data:www-data /opt/customer-web-installer
chmod -R 755 /opt/customer-web-installer
cp -r /opt/dashboard-repo/ref_image_build/customer-web-installer/. /opt/customer-web-installer/
chown -R www-data:www-data /opt/customer-web-installer
chmod -R 755 /opt/customer-web-installer
#Copy sudoers file for customer-web-installer
cp -r /opt/dashboard-repo/ref_image_build/etc/sudoers.d/. /etc/sudoers.d/
chown root:root /etc/sudoers.d/
#Add the website config to the Nginx configuration
cat << EOF > /etc/nginx/conf.d/customer-web-installer.conf
server {
    # Listen on port 80 and make this the default site
    listen 8080 default_server;
    listen [::]:8080 default_server;

    # Point to our wizard directory
    root /opt/customer-web-installer/;

    # Look for index.html first
    index index.html;

    # Catch-all server name for when accessed via IP
    server_name _;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Pass PHP scripts to PHP-FPM
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        # Ubuntu 24.04 uses PHP 8.3 by default
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
    }
}
EOF

echo "Restarting Nginx..."
systemctl restart nginx



echo "####################################################"
echo "Installation and configuration complete"
echo "####################################################"
echo ""
echo "LibreNMS"
echo "--------"
echo "  Login URL:  ${APP_URL}"
echo "  Admin user: ${ADMIN_USER}"
echo ""
echo "LibreNMS API (STEP NetTools)"
echo "----------------------------"
echo "  API user:   ${API_USER}"
if [ -n "$GENERATED_API_TOKEN" ]; then
    echo "  API token:  ${GENERATED_API_TOKEN}"
    echo ""
    echo "  Copy the API token now. It will not be shown again."
else
    echo "  API token:  (not generated — user may already have a token)"
    echo ""
    echo "  To create a new token, run: generate-api-key.sh"
fi
echo ""
echo "STEP NetTools"
echo "-------------"
echo "  Web UI:     ${APP_URL}/step-tools/"
echo ""
echo "Customer Web Installer"
echo "----------------------"
echo "Open the setup wizard in your browser:"
echo ""

INSTALLER_PORT=8080
FOUND_IP=0

while IFS= read -r addr; do
    [[ -z "$addr" ]] && continue
    FOUND_IP=1
    echo "  Current IP: ${addr}"
    echo "  Setup URL:  http://${addr}:${INSTALLER_PORT}/"
    echo ""
done < <(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | sort -u)

if [[ "$FOUND_IP" -eq 0 ]]; then
    echo "  No global IPv4 address detected yet."
    echo "  Check addresses with: ip -4 addr show"
    echo "  Then open: http://<your-ip>:${INSTALLER_PORT}/"
    echo ""
fi

exit 0