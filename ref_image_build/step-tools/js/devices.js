import {
    librenmsGet,
    formatUptime,
    isDeviceUp,
    deviceIp,
    escapeHtml,
    debounce,
    compareValues,
} from './api.js';

const state = {
    devices: [],
    sortKey: 'sysName',
    sortDir: 'asc',
    search: '',
};

const elements = {
    tableHead: document.getElementById('devicesTableHead'),
    tableBody: document.getElementById('devicesTableBody'),
    searchInput: document.getElementById('deviceSearch'),
    totalCount: document.getElementById('totalCount'),
    upCount: document.getElementById('upCount'),
    downCount: document.getElementById('downCount'),
    panel: document.getElementById('devicesPanel'),
};

const columns = [
    { key: 'device_id', label: 'ID', type: 'number', className: 'col-id' },
    { key: 'status', label: 'Status', type: 'status', className: 'col-status', sortValue: (d) => (isDeviceUp(d) ? 1 : 0) },
    { key: 'sysName', label: 'sysName', className: 'col-name' },
    { key: 'ip', label: 'IP', className: 'col-ip', sortValue: (d) => deviceIp(d) },
    { key: 'links', label: 'Links', sortable: false },
    { key: 'location', label: 'Location', className: 'col-muted' },
    { key: 'hardware', label: 'Hardware' },
    { key: 'os', label: 'OS', className: 'col-muted' },
    { key: 'version', label: 'Version', className: 'col-muted' },
    { key: 'serial', label: 'Serial', className: 'col-muted' },
    { key: 'features', label: 'Features', className: 'col-muted' },
    { key: 'uptime', label: 'Uptime', className: 'col-uptime', type: 'number' },
];

function renderHeader() {
    elements.tableHead.innerHTML = columns
        .map((column) => {
            if (column.sortable === false) {
                return `<th>${escapeHtml(column.label)}</th>`;
            }

            const sorted = state.sortKey === column.key;
            const indicator = sorted ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';

            return `<th class="${sorted ? 'is-sorted' : ''}" data-key="${escapeHtml(column.key)}">
                ${escapeHtml(column.label)}
                <span class="sort-indicator">${indicator}</span>
            </th>`;
        })
        .join('');
}

function filteredDevices() {
    const query = state.search.trim().toLowerCase();
    if (!query) {
        return state.devices;
    }

    return state.devices.filter((device) => {
        const haystack = [
            device.device_id,
            device.sysName,
            device.hostname,
            deviceIp(device),
            device.location,
            device.hardware,
            device.os,
            device.version,
            device.serial,
            device.features,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return haystack.includes(query);
    });
}

function sortedDevices(devices) {
    const column = columns.find((entry) => entry.key === state.sortKey);
    const dir = state.sortDir === 'asc' ? 1 : -1;

    return [...devices].sort((left, right) => {
        const leftValue = column?.sortValue ? column.sortValue(left) : left[state.sortKey];
        const rightValue = column?.sortValue ? column.sortValue(right) : right[state.sortKey];
        return compareValues(leftValue, rightValue, column?.type ?? 'string') * dir;
    });
}

function renderStatus(device) {
    const up = isDeviceUp(device);
    const klass = up ? 'status-dot--up' : 'status-dot--down';
    const label = up ? 'Up' : 'Down';
    return `<span class="status-dot ${klass}" title="${label}" aria-label="${label}"></span>`;
}

function renderLinks(device) {
    const ip = deviceIp(device);
    const sshHref = `ssh://${encodeURIComponent(ip)}`;
    const httpsHref = `https://${encodeURIComponent(ip)}`;

    return `<div class="link-group">
        <a class="link-chip" href="${escapeHtml(sshHref)}">ssh</a>
        <a class="link-chip" href="${escapeHtml(httpsHref)}" target="_blank" rel="noopener noreferrer">https</a>
    </div>`;
}

function renderRow(device) {
    return `<tr>
        <td class="col-id">${escapeHtml(device.device_id)}</td>
        <td class="col-status">${renderStatus(device)}</td>
        <td class="col-name">${escapeHtml(device.sysName || device.hostname || '—')}</td>
        <td class="col-ip">${escapeHtml(deviceIp(device))}</td>
        <td>${renderLinks(device)}</td>
        <td class="col-muted">${escapeHtml(device.location || '—')}</td>
        <td>${escapeHtml(device.hardware || '—')}</td>
        <td class="col-muted">${escapeHtml(device.os || '—')}</td>
        <td class="col-muted">${escapeHtml(device.version || '—')}</td>
        <td class="col-muted">${escapeHtml(device.serial || '—')}</td>
        <td class="col-muted">${escapeHtml(device.features || '—')}</td>
        <td class="col-uptime">${escapeHtml(formatUptime(device.uptime))}</td>
    </tr>`;
}

function updateStats(devices) {
    const up = devices.filter(isDeviceUp).length;
    const down = devices.length - up;

    elements.totalCount.textContent = String(devices.length);
    elements.upCount.textContent = String(up);
    elements.downCount.textContent = String(down);
}

function renderTable() {
    const visible = sortedDevices(filteredDevices());
    updateStats(state.devices);

    if (visible.length === 0) {
        elements.tableBody.innerHTML = `<tr><td colspan="${columns.length}">
            <div class="empty-state">No devices match your search.</div>
        </td></tr>`;
        return;
    }

    elements.tableBody.innerHTML = visible.map(renderRow).join('');
}

function showLoading() {
    elements.panel.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            Loading devices from LibreNMS…
        </div>`;
}

function showError(message) {
    elements.panel.innerHTML = `
        <div class="error-state">
            <p><strong>Unable to load devices</strong></p>
            <p>${escapeHtml(message)}</p>
        </div>`;
}

async function loadDevices() {
    showLoading();

    try {
        const response = await librenmsGet('v0/devices', { type: 'all' });
        state.devices = Array.isArray(response.devices) ? response.devices : [];

        elements.panel.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr id="devicesTableHead"></tr></thead>
                    <tbody id="devicesTableBody"></tbody>
                </table>
            </div>`;

        elements.tableHead = document.getElementById('devicesTableHead');
        elements.tableBody = document.getElementById('devicesTableBody');

        renderHeader();
        renderTable();
    } catch (error) {
        showError(error instanceof Error ? error.message : 'Unknown error');
    }
}

elements.searchInput?.addEventListener(
    'input',
    debounce((event) => {
        state.search = event.target.value;
        renderTable();
    })
);

document.addEventListener('click', (event) => {
    const header = event.target.closest('[data-key]');
    if (!header || !header.closest('#devicesTableHead')) {
        return;
    }

    const key = header.dataset.key;
    if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortKey = key;
        state.sortDir = 'asc';
    }

    renderHeader();
    renderTable();
});

loadDevices();
