import {
    librenmsGet,
    deviceIp,
    escapeHtml,
    debounce,
    compareValues,
    formatTimestamp,
    alertStateMeta,
    severityMeta,
} from './api.js';

const state = {
    alerts: [],
    sortKey: 'timestamp',
    sortDir: 'desc',
    search: '',
    statusFilter: 'all',
};

const elements = {
    tableHead: document.getElementById('alertsTableHead'),
    tableBody: document.getElementById('alertsTableBody'),
    searchInput: document.getElementById('alertSearch'),
    totalCount: document.getElementById('totalCount'),
    activeCount: document.getElementById('activeCount'),
    ackCount: document.getElementById('ackCount'),
    criticalCount: document.getElementById('criticalCount'),
    filterActive: document.getElementById('filterActive'),
    filterAck: document.getElementById('filterAck'),
    filterCritical: document.getElementById('filterCritical'),
    panel: document.getElementById('alertsPanel'),
};

const columns = [
    {
        key: 'severity',
        label: 'Severity',
        className: 'col-severity',
        sortValue: (a) => a.rule?.severity || 'ok',
    },
    {
        key: 'device',
        label: 'Device',
        className: 'col-device',
        sortValue: (a) => deviceLabel(a),
    },
    {
        key: 'rule',
        label: 'Rule',
        className: 'col-rule col-truncate',
        sortValue: (a) => a.rule?.name || a.rule_id || '',
    },
    {
        key: 'state',
        label: 'State',
        className: 'col-state',
        sortValue: (a) => Number(a.state),
        type: 'number',
    },
    {
        key: 'timestamp',
        label: 'Time',
        className: 'col-time',
        type: 'date',
    },
];

function deviceLabel(alert) {
    const device = alert.device;
    if (!device) {
        return alert.hostname || alert.device_id || '';
    }
    return device.sysName || device.hostname || deviceIp(device);
}

function truncate(text, max = 56) {
    const value = String(text ?? '').trim();
    if (!value) {
        return '—';
    }
    if (value.length <= max) {
        return value;
    }
    return `${value.slice(0, max - 1)}…`;
}

function isActiveAlert(alert) {
    return String(alert.state) === '1';
}

function isAckAlert(alert) {
    return String(alert.state) === '2';
}

function isCriticalAlert(alert) {
    return String(alert.rule?.severity || '').toLowerCase() === 'critical';
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

function filteredAlerts() {
    let alerts = state.alerts;

    if (state.statusFilter === 'active') {
        alerts = alerts.filter(isActiveAlert);
    } else if (state.statusFilter === 'ack') {
        alerts = alerts.filter(isAckAlert);
    } else if (state.statusFilter === 'critical') {
        alerts = alerts.filter(isCriticalAlert);
    }

    const query = state.search.trim().toLowerCase();
    if (!query) {
        return alerts;
    }

    return alerts.filter((alert) => {
        const haystack = [
            alert.id,
            alert.device_id,
            alert.rule_id,
            alert.timestamp,
            alert.hostname,
            deviceLabel(alert),
            alert.device ? deviceIp(alert.device) : '',
            alert.rule?.name,
            alert.rule?.severity,
            alertStateMeta(alert.state).label,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return haystack.includes(query);
    });
}

function sortedAlerts(alerts) {
    const column = columns.find((entry) => entry.key === state.sortKey);
    const dir = state.sortDir === 'asc' ? 1 : -1;

    return [...alerts].sort((left, right) => {
        const leftValue = column?.sortValue ? column.sortValue(left) : left[state.sortKey];
        const rightValue = column?.sortValue ? column.sortValue(right) : right[state.sortKey];
        return compareValues(leftValue, rightValue, column?.type ?? 'string') * dir;
    });
}

function renderBadge(meta) {
    return `<span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>`;
}

function renderDeviceCell(alert) {
    const name = deviceLabel(alert);
    const ip = alert.device ? deviceIp(alert.device) : (alert.hostname || '—');
    const stateMeta = alertStateMeta(alert.state);
    const dotClass = isActiveAlert(alert)
        ? 'status-dot--down'
        : isAckAlert(alert)
            ? 'status-dot--warning'
            : 'status-dot--up';

    return `<div class="device-cell">
        <span class="status-dot ${dotClass}" title="${escapeHtml(stateMeta.label)}" aria-label="${escapeHtml(stateMeta.label)}"></span>
        <div class="cell-stack">
            <span class="cell-primary" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="cell-secondary">${escapeHtml(ip)}</span>
        </div>
    </div>`;
}

function renderRow(alert) {
    const severity = severityMeta(alert.rule?.severity);
    const alertState = alertStateMeta(alert.state);
    const ruleName = alert.rule?.name || `Rule #${alert.rule_id}`;

    return `<tr>
        <td class="col-severity">${renderBadge(severity)}</td>
        <td class="col-device">${renderDeviceCell(alert)}</td>
        <td class="col-rule col-truncate" title="${escapeHtml(ruleName)}">${escapeHtml(truncate(ruleName, 52))}</td>
        <td class="col-state">${renderBadge(alertState)}</td>
        <td class="col-time">${escapeHtml(formatTimestamp(alert.timestamp))}</td>
    </tr>`;
}

function updateFilterPills() {
    elements.filterActive?.classList.toggle('is-active', state.statusFilter === 'active');
    elements.filterActive?.setAttribute('aria-pressed', String(state.statusFilter === 'active'));
    elements.filterAck?.classList.toggle('is-active', state.statusFilter === 'ack');
    elements.filterAck?.setAttribute('aria-pressed', String(state.statusFilter === 'ack'));
    elements.filterCritical?.classList.toggle('is-active', state.statusFilter === 'critical');
    elements.filterCritical?.setAttribute('aria-pressed', String(state.statusFilter === 'critical'));
}

function updateStats() {
    elements.totalCount.textContent = String(state.alerts.length);
    elements.activeCount.textContent = String(state.alerts.filter(isActiveAlert).length);
    elements.ackCount.textContent = String(state.alerts.filter(isAckAlert).length);
    elements.criticalCount.textContent = String(state.alerts.filter(isCriticalAlert).length);
}

function renderTable() {
    const visible = sortedAlerts(filteredAlerts());
    updateStats();
    updateFilterPills();

    if (visible.length === 0) {
        const emptyMessage = state.statusFilter === 'active'
            ? 'No active alerts.'
            : state.statusFilter === 'ack'
                ? 'No acknowledged alerts.'
                : state.statusFilter === 'critical'
                    ? 'No critical alerts.'
                    : 'No alerts match your search.';

        elements.tableBody.innerHTML = `<tr><td colspan="${columns.length}">
            <div class="empty-state">${emptyMessage}</div>
        </td></tr>`;
        return;
    }

    elements.tableBody.innerHTML = visible.map(renderRow).join('');
}

function showLoading() {
    elements.panel.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            Loading alerts from LibreNMS…
        </div>`;
}

function showError(message) {
    elements.panel.innerHTML = `
        <div class="error-state">
            <p><strong>Unable to load alerts</strong></p>
            <p>${escapeHtml(message)}</p>
        </div>`;
}

function indexById(items, idKey = 'id') {
    const map = new Map();
    for (const item of items) {
        map.set(String(item[idKey]), item);
    }
    return map;
}

async function loadAlerts() {
    showLoading();

    try {
        const [alertsResponse, rulesResponse, devicesResponse] = await Promise.all([
            librenmsGet('v0/alerts', { order: 'timestamp DESC' }),
            librenmsGet('v0/rules'),
            librenmsGet('v0/devices', { type: 'all' }),
        ]);

        const rulesById = indexById(rulesResponse.rules || []);
        const devicesById = indexById(devicesResponse.devices || [], 'device_id');

        state.alerts = (alertsResponse.alerts || []).map((alert) => ({
            ...alert,
            rule: rulesById.get(String(alert.rule_id)) || null,
            device: devicesById.get(String(alert.device_id)) || null,
        }));

        elements.panel.innerHTML = `
            <div class="table-wrap">
                <table class="data-table data-table--compact">
                    <thead><tr id="alertsTableHead"></tr></thead>
                    <tbody id="alertsTableBody"></tbody>
                </table>
            </div>`;

        elements.tableHead = document.getElementById('alertsTableHead');
        elements.tableBody = document.getElementById('alertsTableBody');

        renderHeader();
        renderTable();
    } catch (error) {
        showError(error instanceof Error ? error.message : 'Unknown error');
    }
}

function toggleStatusFilter(filter) {
    state.statusFilter = state.statusFilter === filter ? 'all' : filter;
    renderTable();
}

elements.searchInput?.addEventListener(
    'input',
    debounce((event) => {
        state.search = event.target.value;
        renderTable();
    })
);

elements.filterActive?.addEventListener('click', () => toggleStatusFilter('active'));
elements.filterAck?.addEventListener('click', () => toggleStatusFilter('ack'));
elements.filterCritical?.addEventListener('click', () => toggleStatusFilter('critical'));

document.addEventListener('click', (event) => {
    const header = event.target.closest('[data-key]');
    if (!header?.closest('#alertsTableHead')) {
        return;
    }

    const key = header.dataset.key;
    if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortKey = key;
        state.sortDir = key === 'timestamp' ? 'desc' : 'asc';
    }

    renderHeader();
    renderTable();
});

loadAlerts();
