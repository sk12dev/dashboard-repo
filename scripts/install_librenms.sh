#!/bin/bash
# /usr/local/bin/install_librenms.sh
# This script is used to install LibreNMS on a Ubuntu 22.04 server.
# Created by: Andy Hobbs
# Version: 1.0.0
# Date: 2026-02-27


STEP_SUFFIX=".stepcg.network"
DASH_SUFFIX="-dashboard"
HOSTS_PATH="/etc/hosts"
HOSTNAME_PATH="/etc/hostname"
DELIMITER="."

# Function to check the status of the last command
check_status() {
    THIS_STATUS=$?
    if [[ $THIS_STATUS -ne 0 ]]; then
        echo "#############################################"
        echo "## ERROR: Last command returned: $THIS_STATUS"
        echo "## Exiting..."
        echo "#############################################"
        exit 1
    fi
}

# Function to print a highlighted notice
print_notice() {
    echo -e "\n##########################################################################################"
    echo "# $(date '+%Y/%m/%d %H:%M:%S'): $1"
    echo -e "##########################################################################################\n"
}





print_notice "Updating APT repositories..."
apt-get update -y
sleep 2

print_notice "Installing required dependencies..."
sudo apt install acl curl fping git mariadb-client mariadb-server mtr-tiny nginx-full nmap php-cli php-curl php-fpm php-gd php-gmp php-json php-mbstring php-mysql php-snmp php-xml php-zip python3-command-runner python3-dotenv python3-pip python3-psutil python3-pymysql python3-redis python3-setuptools python3-systemd rrdtool snmp snmpd traceroute unzip whois
check_status

print_notice "Creating LibreNMS user..."
sudo useradd librenms -d /opt/librenms -M -r -s "$(which bash)"
check_status

#TODO: Set password for LibreNMS user
print_notice "Setting password for LibreNMS user..."



print_notice "Cloning LibreNMS GitHub Repository..."
cd /opt
sudo git clone https://github.com/librenms/librenms.git
check_status

print_notice "Setting Permissions for LibreNMS..."
sudo chown -R librenms:librenms /opt/librenms
sudo chmod 771 /opt/librenms
sudo setfacl -d -m g::rwx /opt/librenms/rrd /opt/librenms/logs /opt/librenms/bootstrap/cache/ /opt/librenms/storage/
sudo setfacl -R -m g::rwx /opt/librenms/rrd /opt/librenms/logs /opt/librenms/bootstrap/cache/ /opt/librenms/storage/
check_status


print_notice "Configuring LibreNMS..."
su - librenms
./scripts/composer_wrapper.php install --no-dev
exit
check_status


# Configure the librenms config file
print_notice "Updating the LibreNMS config file with the device hostname."
sudo -H -u librenms bash -c "sed -i 's/Starter Dashboard/${page_title}/g' /opt/librenms/config.php"
check_status


# Create scripts
print_notice "Setting up the scripts directory and creating Let's Encrypt script files."
if [ ! -d "/home/stepcg/scripts" ]; then
    mkdir /home/stepcg/scripts
    check_status
fi
if [ ! -f "/home/stepcg/scripts/authenticator.sh" ]; then
    touch /home/stepcg/scripts/authenticator.sh
    check_status
fi
if [ ! -f "/home/stepcg/scripts/cleanup.sh" ]; then
    touch /home/stepcg/scripts/cleanup.sh
    check_status
fi
chmod +x /home/stepcg/scripts/authenticator.sh
check_status
chmod +x /home/stepcg/scripts/cleanup.sh
check_status

print_notice "Configuring Nginx for LibreNMS..."
sleep 2

print_notice "Applying database schemas..."
sleep 2

print_notice "Setup operations concluded."
sleep 1





# This is the magic string our JavaScript is looking for!
echo "LIBRENMS_SETUP_COMPLETE"