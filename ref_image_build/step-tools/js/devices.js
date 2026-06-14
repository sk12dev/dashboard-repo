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
    statusFilter: 'all',
};

const elements = {
    tableHead: document.getElementById('devicesTableHead'),
    tableBody: document.getElementById('devicesTableBody'),
    searchInput: document.getElementById('deviceSearch'),
    totalCount: document.getElementById('totalCount'),
    upCount: document.getElementById('upCount'),
    downCount: document.getElementById('downCount'),
    filterUp: document.getElementById('filterUp'),
    filterDown: document.getElementById('filterDown'),
    panel: document.getElementById('devicesPanel'),
};

const columns = [
    {
        key: 'sysName',
        label: 'Device',
        className: 'col-device',
        sortValue: (d) => d.sysName || d.hostname || deviceIp(d),
    },
    {
        key: 'location',
        label: 'Location',
        className: 'col-location col-truncate',
    },
    {
        key: 'hardware',
        label: 'Hardware',
        className: 'col-hardware col-truncate',
        sortValue: (d) => d.hardware || d.serial || '',
    },
    {
        key: 'os',
        label: 'Software',
        className: 'col-software',
        sortValue: (d) => `${d.os || ''} ${d.version || ''}`.trim(),
    },
    {
        key: 'uptime',
        label: 'Uptime',
        className: 'col-uptime',
        type: 'number',
    },
    {
        key: 'access',
        label: 'Access',
        sortable: false,
        className: 'col-access',
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

function renderHeader() {
    elements.tableHead.innerHTML = columns
        .map((column) => {
            if (column.sortable === false) {
                return `<th class="${column.className ?? ''}">${escapeHtml(column.label)}</th>`;
            }

            const sorted = state.sortKey === column.key;
            const indicator = sorted ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';

            return `<th class="${column.className ?? ''} ${sorted ? 'is-sorted' : ''}" data-key="${escapeHtml(column.key)}">
                ${escapeHtml(column.label)}
                <span class="sort-indicator">${indicator}</span>
            </th>`;
        })
        .join('');
}

function filteredDevices() {
    let devices = state.devices;

    if (state.statusFilter === 'up') {
        devices = devices.filter(isDeviceUp);
    } else if (state.statusFilter === 'down') {
        devices = devices.filter((device) => !isDeviceUp(device));
    }

    const query = state.search.trim().toLowerCase();
    if (!query) {
        return devices;
    }

    return devices.filter((device) => {
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

function renderDeviceCell(device) {
    const name = device.sysName || device.hostname || '—';
    const ip = deviceIp(device);

    return `<div class="device-cell">
        ${renderStatus(device)}
        <div class="cell-stack">
            <span class="cell-primary" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="cell-secondary">${escapeHtml(ip)}</span>
        </div>
    </div>`;
}

function renderHardwareCell(device) {
    const hardware = device.hardware || '';
    const serial = device.serial || '';

    if (!hardware && !serial) {
        return '—';
    }

    if (!serial) {
        return `<span class="cell-primary cell-truncate" title="${escapeHtml(hardware)}">${escapeHtml(truncate(hardware, 40))}</span>`;
    }

    return `<div class="cell-stack">
        <span class="cell-primary cell-truncate" title="${escapeHtml(hardware || serial)}">${escapeHtml(truncate(hardware || '—', 36))}</span>
        <span class="cell-secondary cell-truncate" title="${escapeHtml(serial)}">${escapeHtml(truncate(serial, 28))}</span>
    </div>`;
}

function renderSoftwareCell(device) {
    const os = device.os || '';
    const version = device.version || '';

    if (!os && !version) {
        return '—';
    }

    return `<div class="cell-stack">
        <span class="cell-primary">${escapeHtml(os || '—')}</span>
        <span class="cell-secondary cell-truncate" title="${escapeHtml(version)}">${escapeHtml(truncate(version, 32))}</span>
    </div>`;
}

function renderRemoteAccess(device) {
    const ip = deviceIp(device);
    const menuId = `access-menu-${device.device_id}`;

    return `<div class="dropdown" data-dropdown>
        <button type="button" class="dropdown-trigger" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="true">
            Remote Access
            <svg class="dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </button>
        <div class="dropdown-menu" id="${menuId}" role="menu" hidden>
            <a class="dropdown-item" role="menuitem" href="https://${encodeURIComponent(ip)}" target="_blank" rel="noopener noreferrer">HTTPS</a>
            <a class="dropdown-item" role="menuitem" href="ssh://${encodeURIComponent(ip)}">SSH</a>
        </div>
    </div>`;
}

function renderRow(device) {
    const location = device.location || '—';

    return `<tr>
        <td class="col-device">${renderDeviceCell(device)}</td>
        <td class="col-location col-truncate" title="${escapeHtml(location)}">${escapeHtml(truncate(location, 44))}</td>
        <td class="col-hardware">${renderHardwareCell(device)}</td>
        <td class="col-software">${renderSoftwareCell(device)}</td>
        <td class="col-uptime">${escapeHtml(formatUptime(device.uptime))}</td>
        <td class="col-access">${renderRemoteAccess(device)}</td>
    </tr>`;
}

function resetDropdownMenu(menu) {
    menu.hidden = true;
    menu.classList.remove('dropdown-menu--fixed');
    menu.style.top = '';
    menu.style.left = '';
}

function positionDropdownMenu(trigger, menu) {
    menu.hidden = false;
    menu.classList.add('dropdown-menu--fixed');

    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const gap = 4;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = spaceBelow < menuHeight + gap && triggerRect.top > menuHeight + gap;

    const top = openUpward
        ? triggerRect.top - menuHeight - gap
        : triggerRect.bottom + gap;

    let left = triggerRect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

function closeAllDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        const menu = dropdown.querySelector('.dropdown-menu');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
        if (menu) {
            resetDropdownMenu(menu);
        }
    });
}

function updateFilterPills() {
    const isUp = state.statusFilter === 'up';
    const isDown = state.statusFilter === 'down';

    elements.filterUp?.classList.toggle('is-active', isUp);
    elements.filterUp?.setAttribute('aria-pressed', String(isUp));
    elements.filterDown?.classList.toggle('is-active', isDown);
    elements.filterDown?.setAttribute('aria-pressed', String(isDown));
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
    updateFilterPills();

    if (visible.length === 0) {
        const emptyMessage = state.statusFilter === 'up'
            ? 'No devices are currently up.'
            : state.statusFilter === 'down'
                ? 'No devices are currently down.'
                : 'No devices match your search.';

        elements.tableBody.innerHTML = `<tr><td colspan="${columns.length}">
            <div class="empty-state">${emptyMessage}</div>
        </td></tr>`;
        return;
    }

    closeAllDropdowns();
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
                <table class="data-table data-table--compact">
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

function toggleStatusFilter(filter) {
    state.statusFilter = state.statusFilter === filter ? 'all' : filter;
    renderTable();
}

elements.filterUp?.addEventListener('click', () => toggleStatusFilter('up'));
elements.filterDown?.addEventListener('click', () => toggleStatusFilter('down'));

document.addEventListener('click', (event) => {
    const header = event.target.closest('[data-key]');
    if (header?.closest('#devicesTableHead')) {
        const key = header.dataset.key;
        if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = key;
            state.sortDir = 'asc';
        }

        renderHeader();
        renderTable();
        return;
    }

    const trigger = event.target.closest('.dropdown-trigger');
    if (trigger?.closest('[data-dropdown]')) {
        event.stopPropagation();
        const dropdown = trigger.closest('[data-dropdown]');
        const menu = dropdown?.querySelector('.dropdown-menu');
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';

        closeAllDropdowns();

        if (!isOpen && menu) {
            trigger.setAttribute('aria-expanded', 'true');
            positionDropdownMenu(trigger, menu);
        }
        return;
    }

    if (!event.target.closest('.dropdown-menu--fixed') && !event.target.closest('[data-dropdown]')) {
        closeAllDropdowns();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeAllDropdowns();
    }
});

window.addEventListener('resize', closeAllDropdowns);
document.addEventListener('scroll', closeAllDropdowns, true);

loadDevices();
