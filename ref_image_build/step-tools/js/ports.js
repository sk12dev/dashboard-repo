import {
    librenmsGet,
    escapeHtml,
    debounce,
    compareValues,
    isPortUp,
    portStatusMeta,
    formatBitsRate,
    formatPortSpeed,
    deviceQueryId,
    deviceLabel,
} from './api.js';

const PORT_COLUMNS = [
    'port_id',
    'ifName',
    'ifDescr',
    'ifAlias',
    'ifOperStatus',
    'ifAdminStatus',
    'ifSpeed',
    'port_descr_speed',
    'ifDuplex',
    'ifInOctets_rate',
    'ifOutOctets_rate',
    'ifInErrors',
    'ifOutErrors',
    'disabled',
    'ignore',
    'deleted',
].join(',');

const state = {
    devices: [],
    ports: [],
    selectedDeviceId: '',
    sortKey: 'ifName',
    sortDir: 'asc',
    search: '',
    statusFilter: 'all',
};

const elements = {
    deviceSelect: document.getElementById('deviceSelect'),
    searchInput: document.getElementById('portSearch'),
    totalCount: document.getElementById('totalCount'),
    upCount: document.getElementById('upCount'),
    downCount: document.getElementById('downCount'),
    filterUp: document.getElementById('filterUp'),
    filterDown: document.getElementById('filterDown'),
    panel: document.getElementById('portsPanel'),
    tableHead: null,
    tableBody: null,
};

const columns = [
    {
        key: 'status',
        label: '',
        className: 'col-status',
        sortValue: (p) => (isPortUp(p) ? 1 : 0),
        type: 'number',
    },
    {
        key: 'ifName',
        label: 'Port',
        className: 'col-port',
        sortValue: (p) => p.ifName || p.ifDescr || '',
    },
    {
        key: 'ifAlias',
        label: 'Description',
        className: 'col-description col-truncate',
    },
    {
        key: 'speed',
        label: 'Speed',
        className: 'col-speed',
        sortValue: (p) => Number(p.ifSpeed) || 0,
        type: 'number',
    },
    {
        key: 'ifInOctets_rate',
        label: 'In',
        className: 'col-traffic',
        type: 'number',
    },
    {
        key: 'ifOutOctets_rate',
        label: 'Out',
        className: 'col-traffic',
        type: 'number',
    },
    {
        key: 'errors',
        label: 'Errors',
        className: 'col-errors',
        sortValue: (p) => Number(p.ifInErrors) + Number(p.ifOutErrors),
        type: 'number',
    },
    {
        key: 'ifDuplex',
        label: 'Duplex',
        className: 'col-duplex col-muted',
    },
];

function truncate(text, max = 48) {
    const value = String(text ?? '').trim();
    if (!value) {
        return '—';
    }
    if (value.length <= max) {
        return value;
    }
    return `${value.slice(0, max - 1)}…`;
}

function setToolbarEnabled(enabled) {
    elements.searchInput.disabled = !enabled;
    elements.filterUp.disabled = !enabled;
    elements.filterDown.disabled = !enabled;
}

function renderHeader() {
    elements.tableHead.innerHTML = columns
        .map((column) => {
            const sorted = state.sortKey === column.key;
            const indicator = sorted ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';

            return `<th class="${column.className ?? ''} ${sorted ? 'is-sorted' : ''}" data-key="${escapeHtml(column.key)}">
                ${escapeHtml(column.label)}
                <span class="sort-indicator">${indicator}</span>
            </th>`;
        })
        .join('');
}

function filteredPorts() {
    let ports = state.ports.filter((port) => String(port.deleted) !== '1');

    if (state.statusFilter === 'up') {
        ports = ports.filter(isPortUp);
    } else if (state.statusFilter === 'down') {
        ports = ports.filter((port) => !isPortUp(port));
    }

    const query = state.search.trim().toLowerCase();
    if (!query) {
        return ports;
    }

    return ports.filter((port) => {
        const haystack = [
            port.ifName,
            port.ifDescr,
            port.ifAlias,
            port.ifOperStatus,
            port.ifAdminStatus,
            port.ifDuplex,
            port.port_id,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return haystack.includes(query);
    });
}

function sortedPorts(ports) {
    const column = columns.find((entry) => entry.key === state.sortKey);
    const dir = state.sortDir === 'asc' ? 1 : -1;

    return [...ports].sort((left, right) => {
        const leftValue = column?.sortValue ? column.sortValue(left) : left[state.sortKey];
        const rightValue = column?.sortValue ? column.sortValue(right) : right[state.sortKey];
        return compareValues(leftValue, rightValue, column?.type ?? 'string') * dir;
    });
}

function renderPortCell(port) {
    const name = port.ifName || port.ifDescr || '—';
    const descr = port.ifDescr && port.ifDescr !== port.ifName ? port.ifDescr : '';

    return `<div class="cell-stack">
        <span class="cell-primary" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        ${descr ? `<span class="cell-secondary cell-truncate" title="${escapeHtml(descr)}">${escapeHtml(truncate(descr, 36))}</span>` : ''}
    </div>`;
}

function renderStatusCell(port) {
    const meta = portStatusMeta(port);
    const title = `Oper: ${meta.oper} / Admin: ${meta.admin}`;
    return `<span class="status-dot ${meta.className}" title="${escapeHtml(title)}" aria-label="${escapeHtml(meta.label)}"></span>`;
}

function renderRow(port) {
    const inErrors = Number(port.ifInErrors) || 0;
    const outErrors = Number(port.ifOutErrors) || 0;
    const totalErrors = inErrors + outErrors;
    const errorsClass = totalErrors > 0 ? 'cell-error' : '';

    return `<tr>
        <td class="col-status">${renderStatusCell(port)}</td>
        <td class="col-port">${renderPortCell(port)}</td>
        <td class="col-description col-truncate" title="${escapeHtml(port.ifAlias || '')}">${escapeHtml(truncate(port.ifAlias, 44))}</td>
        <td class="col-speed">${escapeHtml(formatPortSpeed(port))}</td>
        <td class="col-traffic">${escapeHtml(formatBitsRate(port.ifInOctets_rate))}</td>
        <td class="col-traffic">${escapeHtml(formatBitsRate(port.ifOutOctets_rate))}</td>
        <td class="col-errors ${errorsClass}">${totalErrors > 0 ? escapeHtml(String(totalErrors)) : '—'}</td>
        <td class="col-duplex col-muted">${escapeHtml(formatDuplex(port.ifDuplex))}</td>
    </tr>`;
}

function formatDuplex(value) {
    const duplex = String(value ?? '').toLowerCase();
    if (!duplex || duplex === 'unknown') {
        return '—';
    }
    if (duplex.includes('full')) {
        return 'Full';
    }
    if (duplex.includes('half')) {
        return 'Half';
    }
    return value;
}

function updateFilterPills() {
    elements.filterUp?.classList.toggle('is-active', state.statusFilter === 'up');
    elements.filterUp?.setAttribute('aria-pressed', String(state.statusFilter === 'up'));
    elements.filterDown?.classList.toggle('is-active', state.statusFilter === 'down');
    elements.filterDown?.setAttribute('aria-pressed', String(state.statusFilter === 'down'));
}

function updateStats() {
    const activePorts = state.ports.filter((port) => String(port.deleted) !== '1');
    const up = activePorts.filter(isPortUp).length;

    elements.totalCount.textContent = String(activePorts.length);
    elements.upCount.textContent = String(up);
    elements.downCount.textContent = String(activePorts.length - up);
}

function renderTable() {
    if (!state.selectedDeviceId) {
        return;
    }

    const visible = sortedPorts(filteredPorts());
    updateStats();
    updateFilterPills();

    if (visible.length === 0) {
        const emptyMessage = state.statusFilter === 'up'
            ? 'No ports are up on this device.'
            : state.statusFilter === 'down'
                ? 'No ports are down on this device.'
                : state.search
                    ? 'No ports match your search.'
                    : 'No ports found for this device.';

        elements.tableBody.innerHTML = `<tr><td colspan="${columns.length}">
            <div class="empty-state">${emptyMessage}</div>
        </td></tr>`;
        return;
    }

    elements.tableBody.innerHTML = visible.map(renderRow).join('');
}

function showLoading(message = 'Loading ports…') {
    elements.panel.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            ${escapeHtml(message)}
        </div>`;
    elements.tableHead = null;
    elements.tableBody = null;
}

function showError(message) {
    elements.panel.innerHTML = `
        <div class="error-state">
            <p><strong>Unable to load ports</strong></p>
            <p>${escapeHtml(message)}</p>
        </div>`;
    elements.tableHead = null;
    elements.tableBody = null;
}

function showSelectDevice() {
    elements.panel.innerHTML = `<div class="empty-state">Select a device to load its ports.</div>`;
    elements.tableHead = null;
    elements.tableBody = null;
    state.ports = [];
    setToolbarEnabled(false);
    updateStats();
}

function initTableShell() {
    elements.panel.innerHTML = `
        <div class="table-wrap">
            <table class="data-table data-table--compact">
                <thead><tr id="portsTableHead"></tr></thead>
                <tbody id="portsTableBody"></tbody>
            </table>
        </div>`;

    elements.tableHead = document.getElementById('portsTableHead');
    elements.tableBody = document.getElementById('portsTableBody');
    renderHeader();
    setToolbarEnabled(true);
}

async function loadDevices() {
    const response = await librenmsGet('v0/devices', { type: 'all' });
    state.devices = Array.isArray(response.devices) ? response.devices : [];

    const sorted = [...state.devices].sort((a, b) =>
        compareValues(deviceLabel(a), deviceLabel(b))
    );

    elements.deviceSelect.innerHTML = [
        '<option value="">Select a device…</option>',
        ...sorted.map((device) => {
            const id = deviceQueryId(device);
            return `<option value="${escapeHtml(id)}">${escapeHtml(deviceLabel(device))}</option>`;
        }),
    ].join('');

    const preset = new URLSearchParams(window.location.search).get('device');
    if (preset && sorted.some((device) => deviceQueryId(device) === preset)) {
        elements.deviceSelect.value = preset;
        await loadPortsForDevice(preset);
    }
}

async function loadPortsForDevice(deviceId) {
    if (!deviceId) {
        state.selectedDeviceId = '';
        state.statusFilter = 'all';
        state.search = '';
        elements.searchInput.value = '';
        showSelectDevice();
        return;
    }

    state.selectedDeviceId = deviceId;
    state.statusFilter = 'all';
    showLoading();

    try {
        const response = await librenmsGet(`v0/devices/${encodeURIComponent(deviceId)}/ports`, {
            columns: PORT_COLUMNS,
        });

        state.ports = Array.isArray(response.ports) ? response.ports : [];
        initTableShell();
        renderTable();
    } catch (error) {
        setToolbarEnabled(false);
        showError(error instanceof Error ? error.message : 'Unknown error');
    }
}

function toggleStatusFilter(filter) {
    state.statusFilter = state.statusFilter === filter ? 'all' : filter;
    renderTable();
}

elements.deviceSelect?.addEventListener('change', (event) => {
    loadPortsForDevice(event.target.value);
});

elements.searchInput?.addEventListener(
    'input',
    debounce((event) => {
        state.search = event.target.value;
        renderTable();
    })
);

elements.filterUp?.addEventListener('click', () => toggleStatusFilter('up'));
elements.filterDown?.addEventListener('click', () => toggleStatusFilter('down'));

document.addEventListener('click', (event) => {
    const header = event.target.closest('[data-key]');
    if (!header?.closest('#portsTableHead')) {
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

async function init() {
    showSelectDevice();

    try {
        await loadDevices();
    } catch (error) {
        elements.deviceSelect.innerHTML = '<option value="">Unable to load devices</option>';
        showError(error instanceof Error ? error.message : 'Unknown error');
    }
}

init();
