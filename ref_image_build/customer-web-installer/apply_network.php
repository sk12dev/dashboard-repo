<?php
// apply_network.php
//TO DO: Add section to sudo hostnamectl set-hostname <new-hostname> and 
//update the /etc/hosts file with the new hostname
require_once __DIR__ . '/network_utils.php';

header('Content-Type: application/json');

/**
 * Convert dotted-decimal subnet mask (e.g. 255.255.255.0) to CIDR prefix length.
 * Returns null if the mask is invalid.
 */
function subnet_mask_to_cidr($mask)
{
    if (!filter_var($mask, FILTER_VALIDATE_IP)) {
        return null;
    }
    $octets = array_map('intval', explode('.', $mask));
    $cidr = 0;
    $expectZero = false;
    $validOctets = [0, 128, 192, 224, 240, 248, 252, 254, 255];
    foreach ($octets as $o) {
        if (!in_array($o, $validOctets, true)) {
            return null;
        }
        if ($expectZero && $o !== 0) {
            return null;
        }
        if ($o === 255) {
            $cidr += 8;
        } elseif ($o !== 0) {
            $bits = 0;
            for ($b = 7; $b >= 0 && (($o >> $b) & 1); $b--) {
                $bits++;
            }
            if (($o << (8 - $bits)) & 0xFF) {
                return null; // not contiguous 1s
            }
            $cidr += $bits;
            $expectZero = true;
        }
    }
    return $cidr <= 32 ? $cidr : null;
}

const APPLY_NETWORK_SCRIPT = '/opt/customer-web-installer/scripts/apply-network-from-web.sh';

/**
 * Confirm www-data can sudo the apply script and the netplan file is ready.
 *
 * @return array{ok: bool, message: string}
 */
function verify_network_apply_ready(): array
{
    $script = APPLY_NETWORK_SCRIPT;

    if (!is_file($script) || !is_executable($script)) {
        return [
            'ok' => false,
            'message' => 'Network apply script is missing or not executable',
        ];
    }

    $cmd = 'sudo -n ' . escapeshellarg($script) . ' --verify 2>&1';
    exec($cmd, $output, $code);

    if ($code !== 0) {
        $detail = trim(implode("\n", $output));
        if ($detail === '') {
            $detail = 'Unable to run network apply script (sudo permission denied)';
        }

        return ['ok' => false, 'message' => $detail];
    }

    return ['ok' => true, 'message' => ''];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $newIp = $_POST['ip_address'] ?? '';
    $subnetMask = trim($_POST['subnet_mask'] ?? '255.255.255.0');
    $cidr = subnet_mask_to_cidr($subnetMask);
    $gateway = $_POST['gateway'] ?? '';
    $dns = $_POST['dns'] ?? '';
    $interface = trim($_POST['interface'] ?? '');

    // 1. Basic Validation
    if (!filter_var($newIp, FILTER_VALIDATE_IP)) {
        echo json_encode(["status" => "error", "message" => "Invalid IP Address"]);
        exit;
    }
    if ($cidr === null) {
        echo json_encode(["status" => "error", "message" => "Invalid subnet mask. Use dotted decimal (e.g. 255.255.255.0)"]);
        exit;
    }
    if ($interface === '' || !is_eligible_ethernet_interface($interface)) {
        echo json_encode(["status" => "error", "message" => "Invalid network interface selected"]);
        exit;
    }
    if (!filter_var($gateway, FILTER_VALIDATE_IP)) {
        echo json_encode(["status" => "error", "message" => "Invalid gateway address"]);
        exit;
    }

    // Format DNS for Netplan (comma separated string into array format)
    $dnsArray = explode(",", $dns);
    $dnsList = implode(",", array_map(function ($d) {
        return '"' . trim($d) . '"';
    }, $dnsArray));

    // 2. Generate Netplan YAML
    $yaml = <<<YAML
network:
  version: 2
  renderer: networkd
  ethernets:
    $interface:
      dhcp4: no
      addresses:
        - $newIp/$cidr
      routes:
        - to: default
          via: $gateway
      nameservers:
        addresses: [$dnsList]
YAML;

    // 3. Write to a temporary file (www-data can write to /tmp)
    $tmpFile = '/tmp/99-custom.yaml';
    if (file_put_contents($tmpFile, $yaml) === false) {
        echo json_encode(["status" => "error", "message" => "Failed to write network configuration"]);
        exit;
    }

    // 4. Verify sudo access and config before telling the browser to redirect
    $verify = verify_network_apply_ready();
    if (!$verify['ok']) {
        @unlink($tmpFile);
        echo json_encode(["status" => "error", "message" => $verify['message']]);
        exit;
    }

    // 5. Send the response to the browser FIRST
    echo json_encode([
        "status" => "success",
        "new_ip" => $newIp
    ]);

    // 6. Close the connection to the user's browser securely
    if (function_exists('fastcgi_finish_request')) {
        // This flushes the output buffer and closes the HTTP connection,
        // but lets the PHP script continue running.
        fastcgi_finish_request();
    }

    // 7. Give Nginx a tiny fraction of a second to fully close the socket
    usleep(500000); // 0.5 seconds

    // 8. Apply network settings synchronously; failures are logged for troubleshooting
    $applyCmd = 'sudo -n ' . escapeshellarg(APPLY_NETWORK_SCRIPT) . ' 2>&1';
    exec($applyCmd, $applyOutput, $applyCode);
    if ($applyCode !== 0) {
        $detail = trim(implode("\n", $applyOutput));
        error_log(
            'Network apply failed (exit ' . $applyCode . '): ' .
            ($detail !== '' ? $detail : 'no output')
        );
    }
}
