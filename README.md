# dashboard-v2

Appliance build assets for a **STEP Dashboard** based on **LibreNMS** on Ubuntu, plus supporting services (e.g. **syslog-ng**, **Oxidized**) and a small **web-based setup wizard** for initial network + install.

## What’s in this repo

- **`ref_image_build/install-dashboard.sh`**: Main installer script (LibreNMS + Nginx + MariaDB + SNMP; plus initial hooks for syslog-ng, Oxidized, and the web installer).
- **`ref_image_build/customer-web-installer/`**: Static + PHP “setup wizard” that:
  - Applies a static IP via Netplan.
  - Starts the install script and streams logs to the browser.
- **`ref_image_build/etc/`**: Configuration notes/files for services like syslog-ng and Oxidized.

## Prerequisites

- **Target OS**: Ubuntu (installer script mentions Ubuntu **22.04**; web installer references PHP 8.3 paths as used on newer Ubuntu).
- **Privileges**: Root / sudo access (installer expects to run under `sudo bash`).
- **Network**: Static IP will be applied using Netplan (expect a brief disconnect when the IP changes).

## Running the main installer (console)

On the target Ubuntu system:

```bash
sudo bash
bash /path/to/ref_image_build/install-dashboard.sh
```

The script will prompt for:

- Webserver hostname (used for Nginx `server_name`)
- MariaDB password (used to create the `librenms` DB user and populate LibreNMS `.env`)

## Using the customer web installer (wizard)

The wizard UI lives in:

- `ref_image_build/customer-web-installer/index.html`

Key endpoints:

- `apply_network.php`: validates IP/gateway/subnet mask/DNS, writes `/tmp/99-custom.yaml`, then runs `scripts/apply-network-from-web.sh` (moves YAML into `/etc/netplan/` + `netplan apply`).
- `start_install.php`: starts `scripts/configure-dashboard-from-web.sh` in the background and writes logs to `/tmp/install.log`.
- `read_log.php`: returns `/tmp/install.log` contents to the browser.

### Expected “done” marker

The UI polls the log and treats install as complete when it sees:

- `LIBRENMS_SETUP_COMPLETE`

## Important paths (on the appliance)

- **LibreNMS**: `/opt/librenms`
- **Nginx conf** (created by installer): `/etc/nginx/conf.d/librenms.conf`
- **Customer web installer** (created by installer): `/opt/customer-web-installer`
- **Install log** (web installer): `/tmp/install.log`

## Notes / TODOs already in the scripts

- `install-dashboard.sh` includes placeholders to flesh out:
  - Oxidized install/config
  - “STEP NetTools”
  - Customer web installer hardening/finishing work

## Troubleshooting

- **Wizard redirects but page doesn’t load**: the Netplan apply changes the host IP; confirm you’re browsing the new IP shown by the wizard.
- **Install “hangs” in step 2**: check `/tmp/install.log` on the appliance; the UI just streams this file.
- **PHP-FPM socket mismatch**: LibreNMS Nginx config uses `/run/php-fpm-librenms.sock`; the wizard’s Nginx snippet uses the default `/var/run/php/php8.3-fpm.sock`.

