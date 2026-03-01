#!/bin/bash
# STEP LibreNMS and Dependencies Installer
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

echo "###########################"
echo "Cloning LibreNMS repository"
echo "###########################"
echo

cd /opt
git clone https://github.com/librenms/librenms.git

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
echo "Configuring PHP timezone"
echo "########################"

sed -i 's|;date.timezone =|date.timezone = America/New_York|' /etc/php/8.3/fpm/php.ini
sed -i 's|;date.timezone =|date.timezone = America/New_York|' /etc/php/8.3/cli/php.ini

echo
echo "#############################################"
echo "Setting system timezone to America/New_York"
echo "#############################################"
echo
timedatectl set-timezone America/New_York

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
echo "#######################"
echo "Fixing up the .env file"
echo "#######################"

sed -i "s/#DB_HOST=/DB_HOST=localhost/" /opt/librenms/.env
sed -i "s/#DB_DATABASE=/DB_DATABASE=librenms/" /opt/librenms/.env
sed -i "s/#DB_USERNAME=/DB_USERNAME=librenms/" /opt/librenms/.env
sed -i "s/#DB_PASSWORD=/DB_PASSWORD=$DATABASEPASSWORD/" /opt/librenms/.env


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
echo "####################################################"


# STEP Syslog-NG and Configure Installer
# Created by: Andy Hobbs
# Version: 1.0.0
# Date: 2026-02-28
# Description: This script is used to install syslog-ng and configure it for the STEP Dashboard.
# make sure to run sudo bash first
# Exit on any error


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
#cp -r /opt/dashboard-v2/ref_image_build/etc/syslog-ng/conf.d/. /etc/syslog-ng/conf.d/

echo "Creating SQL database for syslog-ng"
mysql -u root -p$DATABASEPASSWORD < /opt/dashboard-v2/ref_image_build/etc/syslog-ng/create_ilog_db.sql


echo "Restarting syslog-ng..."
systemctl restart syslog-ng

echo "####################################################"
echo "Installing and configuring Oxidized"
echo "####################################################"
# TO DO: Install and configure Oxidized


echo "####################################################"
echo "Installing and Configuring STEP NetTools"
echo "####################################################"
# TO DO: Install and configure STEP NetTools

echo "####################################################"
echo "Installation and configuration complete"
echo "####################################################"

exit 0