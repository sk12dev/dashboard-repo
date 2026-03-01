<?php
// apply_network.php
header('Content-Type: application/json');

/**
 * Convert dotted-decimal subnet mask (e.g. 255.255.255.0) to CIDR prefix length.
 * Returns null if the mask is invalid.
 */
function subnet_mask_to_cidr($mask) {
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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $newIp = $_POST['ip_address'] ?? '';
    $subnetMask = trim($_POST['subnet_mask'] ?? '255.255.255.0');
    $cidr = subnet_mask_to_cidr($subnetMask);
    $gateway = $_POST['gateway'] ?? '';
    $dns = $_POST['dns'] ?? '';

    // 1. Basic Validation
    if (!filter_var($newIp, FILTER_VALIDATE_IP)) {
        echo json_encode(["status" => "error", "message" => "Invalid IP Address"]);
        exit;
    }
    if ($cidr === null) {
        echo json_encode(["status" => "error", "message" => "Invalid subnet mask. Use dotted decimal (e.g. 255.255.255.0)"]);
        exit;
    }

    // Format DNS for Netplan (comma separated string into array format)
    $dnsArray = explode(",", $dns);
    $dnsList = implode(",", array_map(function ($d) {
        return '"' . trim($d) . '"';
    }, $dnsArray));

    // Replace 'enp0s3' with the actual network adapter name used in your OVA
    $interface = "enp0s3";

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
    file_put_contents($tmpFile, $yaml);

    // 4. Send the response to the browser FIRST
    echo json_encode([
        "status" => "success",
        "new_ip" => $newIp
    ]);

    // 5. Close the connection to the user's browser securely
    if (function_exists('fastcgi_finish_request')) {
        // This flushes the output buffer and closes the HTTP connection,
        // but lets the PHP script continue running.
        fastcgi_finish_request();
    }

    // 6. Give Nginx a tiny fraction of a second to fully close the socket
    usleep(500000); // 0.5 seconds

    // 7. Execute the bash script asynchronously 
    // We use nohup just in case, though fastcgi_finish_request usually protects the child process.
    shell_exec("nohup sudo /usr/local/bin/apply_network.sh > /dev/null 2>&1 &");
}
