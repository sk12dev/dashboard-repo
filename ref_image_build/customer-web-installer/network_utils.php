<?php

/**
 * Return true if the name is a valid Linux network interface identifier.
 */
function is_valid_interface_name(string $name): bool
{
    return (bool) preg_match('/^[a-zA-Z0-9._-]{1,15}$/', $name);
}

/**
 * List physical Ethernet interfaces from sysfs.
 *
 * @return array<int, array{name: string, state: string, mac: string, addresses: string[]}>
 */
function list_ethernet_interfaces(): array
{
    $interfaces = [];
    $netDir = '/sys/class/net';

    if (!is_dir($netDir)) {
        return $interfaces;
    }

    foreach (scandir($netDir) as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        if (!is_valid_interface_name($name)) {
            continue;
        }

        $typePath = "$netDir/$name/type";
        if (!is_readable($typePath)) {
            continue;
        }

        $type = (int) trim((string) file_get_contents($typePath));
        if ($type !== 1) {
            continue;
        }

        $state = trim((string) @file_get_contents("$netDir/$name/operstate"));
        $mac = trim((string) @file_get_contents("$netDir/$name/address"));

        $interfaces[] = [
            'name' => $name,
            'state' => $state !== '' ? $state : 'unknown',
            'mac' => $mac,
            'addresses' => get_interface_ipv4_addresses($name),
        ];
    }

    usort($interfaces, function ($a, $b) {
        return strcmp($a['name'], $b['name']);
    });

    return $interfaces;
}

/**
 * @return string[]
 */
function get_interface_ipv4_addresses(string $interface): array
{
    if (!is_valid_interface_name($interface)) {
        return [];
    }

    $output = shell_exec(
        'ip -4 -o addr show dev ' . escapeshellarg($interface) . ' 2>/dev/null'
    );
    if ($output === null || trim($output) === '') {
        return [];
    }

    $addresses = [];
    foreach (explode("\n", trim($output)) as $line) {
        if (preg_match('/\sinet\s+(\d+\.\d+\.\d+\.\d+)\/\d+\s/', $line, $matches)) {
            $addresses[] = $matches[1];
        }
    }

    return $addresses;
}

/**
 * Verify the interface exists and is an eligible Ethernet adapter.
 */
function is_eligible_ethernet_interface(string $name): bool
{
    if (!is_valid_interface_name($name)) {
        return false;
    }

    foreach (list_ethernet_interfaces() as $iface) {
        if ($iface['name'] === $name) {
            return true;
        }
    }

    return false;
}

/**
 * Pick the best default interface for the installer UI.
 */
function suggest_default_interface(?string $serverIp = null): ?string
{
    $interfaces = list_ethernet_interfaces();
    if ($interfaces === []) {
        return null;
    }

    if ($serverIp !== null && filter_var($serverIp, FILTER_VALIDATE_IP)) {
        foreach ($interfaces as $iface) {
            if (in_array($serverIp, $iface['addresses'], true)) {
                return $iface['name'];
            }
        }
    }

    foreach ($interfaces as $iface) {
        if ($iface['addresses'] !== []) {
            return $iface['name'];
        }
    }

    foreach ($interfaces as $iface) {
        if ($iface['state'] === 'up') {
            return $iface['name'];
        }
    }

    return $interfaces[0]['name'];
}
