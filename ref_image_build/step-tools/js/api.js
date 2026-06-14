const API_BASE = 'api/librenms.php';

export async function librenmsGet(path, params = {}) {
    const url = new URL(API_BASE, window.location.href);
    url.searchParams.set('path', path);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }

    const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API request failed (${response.status})`);
    }

    return payload.data;
}

export function formatUptime(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total <= 0) {
        return '—';
    }

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (days >= 1) {
        return `${days} day${days === 1 ? '' : 's'}`;
    }
    if (hours >= 1) {
        return `${hours} hr${hours === 1 ? '' : 's'}`;
    }
    return `${minutes} min`;
}

export function isDeviceUp(device) {
    const status = device.status;
    return status === true || status === 1 || status === '1';
}

export function deviceIp(device) {
    const hostname = String(device.hostname || device.ip || '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        return hostname;
    }
    return device.ip || hostname;
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export function debounce(fn, delayMs = 200) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}

export function compareValues(a, b, type = 'string') {
    if (type === 'number') {
        return Number(a) - Number(b);
    }
    if (type === 'date') {
        return new Date(a).getTime() - new Date(b).getTime();
    }
    return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

export function formatTimestamp(value) {
    if (!value) {
        return '—';
    }
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function alertStateMeta(state) {
    const value = String(state ?? '');
    if (value === '1') {
        return { label: 'Active', className: 'state-badge--active' };
    }
    if (value === '2') {
        return { label: 'Acknowledged', className: 'state-badge--ack' };
    }
    return { label: 'Cleared', className: 'state-badge--cleared' };
}

export function severityMeta(severity) {
    const value = String(severity ?? 'ok').toLowerCase();
    if (value === 'critical') {
        return { label: 'Critical', className: 'severity-badge--critical' };
    }
    if (value === 'warning') {
        return { label: 'Warning', className: 'severity-badge--warning' };
    }
    return { label: 'OK', className: 'severity-badge--ok' };
}
