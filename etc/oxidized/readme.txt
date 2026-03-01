# Oxidized install
# grep oxidized /etc/password and look for /etc/oxidized as home directory
sudo bash
grep oxidized /etc/passwd

# Check for oxidized install
apt-get -y install ruby ruby-dev libsqlite3-dev libssl-dev pkg-config cmake libssh2-1-dev libicu-dev zlib1g-dev g++
gem install oxidized
gem install oxidized-script oxidized-web
# if already installed then update
gem update oxidized
gem update oxidized-script oxidized-web

# Part 1
rm -fr /home/stepcg/stepcg-git
git clone https://github.com/ospfbgp/stepcg-git /home/stepcg/stepcg-git
export STEPCG="/home/stepcg/stepcg-git"
echo $STEPCG
rm /etc/oxidized/*.pid
rm /etc/init.d/oxidized
cp $STEPCG/etc/oxidized/oxidized  /etc/init.d/.
chmod +x /etc/init.d/oxidized
update-rc.d oxidized defaults

# part 2
rm /lib/systemd/system/oxidized.service
rm /etc/systemd/system/multi-user.target.wants/oxidized.service
cp $STEPCG/etc/oxidized/oxidized.service /lib/systemd/system/oxidized.service
ln -s /lib/systemd/system/oxidized.service /etc/systemd/system/multi-user.target.wants/oxidized.service
systemctl daemon-reload

#setup oxidized
mkdir /etc/oxidized
cp -r $STEPCG/etc/oxidized/* /etc/oxidized/.
chown -R oxidized:oxidized /etc/oxidized

# create configuration file
# you will need to edit and change username/password and create api hook inside of Dashboard
cp /etc/oxidized/oxidized_config_sample /etc/oxidized/config
chown -R oxidized:oxidized /etc/oxidized

# Verify /opt/librenms/config.php
$config['oxidized']['enabled'] = TRUE;
$config['oxidized']['url'] = 'http://127.0.0.1:8888/configs';
$config['oxidized']['features']['versionin'] = true;
$config['oxidized']['reload_nodes'] = true;
$config['oxidized']['ignore_types'] = array('firewall','server','power','storage');
$config['oxidized']['ignore_os'] = array('linux','windows','avaya-ipo');

#setup logroate for oxidized
cp $STEPCG/etc/logrotate.d/oxidized /etc/logrotate.d/oxidized

# Erase config backups and clean logs
service oxidized stop
rm -fr /etc/oxidized/.config
rm -fr /etc/oxidized/git-repos/
rm -fr /etc/oxidized/git-repos
rm -fr /etc/oxidized/*.log*
service oxidized start
