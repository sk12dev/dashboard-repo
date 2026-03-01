# STEP Syslog-NG and Configure Installer
# Created by: Andy Hobbs
# Version: 1.0.0
# Date: 2026-02-28
# Description: This script is used to install syslog-ng and configure it for the STEP Dashboard.
# make sure to run sudo bash first
# Exit on any error

set -e
echo
echo "#########################################################"
echo "Starting Syslog-NG and Configure installation..."
echo "#########################################################"
echo


echo "####################################"
echo "Installing and configuring syslog-ng"
echo "####################################"
echo
apt-get install -y syslog-ng-core

echo "Copying the STEP Specific syslog-ng configuration files"
cp /opt/step-git/etc/syslog-ng/conf.d/. /etc/syslog-ng/conf.d/

echo "Creating SQL database for syslog-ng"
mysql -u root -p -e "CREATE DATABASE ilog;"
mysql -u root -p -e "CREATE USER 'ilog'@'localhost' IDENTIFIED BY 'ilogpassword';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON ilog.* TO 'ilog'@'localhost';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
mysql -u root -p ilog < /opt/step-git/etc/syslog-ng/create_ilog_db.sql


echo "Restarting syslog-ng..."
systemctl restart syslog-ng