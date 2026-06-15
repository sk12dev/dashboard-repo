const GAUGE_RADIUS = 92;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const SPEED_SCALE_MBPS = 1000;
const LATENCY_SCALE_MS = 50;

const panel = document.getElementById('speedtestPanel');
const startStopBtn = document.getElementById('startStopBtn');
const startStopLabel = document.getElementById('startStopLabel');
const gaugeRing = document.getElementById('gaugeRing');
const testPhase = document.getElementById('testPhase');
const heroValue = document.getElementById('heroValue');
const heroUnit = document.getElementById('heroUnit');
const ipArea = document.getElementById('ipArea');
const ipEl = document.getElementById('ip');

const metrics = {
    dl: { text: document.getElementById('dlText'), bar: document.getElementById('dlBar'), card: document.getElementById('metricDl') },
    ul: { text: document.getElementById('ulText'), bar: document.getElementById('ulBar'), card: document.getElementById('metricUl') },
    ping: { text: document.getElementById('pingText'), bar: document.getElementById('pingBar'), card: document.getElementById('metricPing') },
    jit: { text: document.getElementById('jitText'), bar: document.getElementById('jitBar'), card: document.getElementById('metricJit') },
};

let worker = null;

gaugeRing.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
gaugeRing.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);

function setGaugeProgress(ratio) {
    const clamped = Math.min(1, Math.max(0, ratio));
    gaugeRing.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - clamped));
}

function setBarFill(bar, ratio) {
    bar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function parseNumber(value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function speedBarRatio(value) {
    const num = parseNumber(value);
    if (num === null) {
        return 0;
    }
    return Math.min(1, num / SPEED_SCALE_MBPS);
}

function latencyBarRatio(value) {
    const num = parseNumber(value);
    if (num === null) {
        return 0;
    }
    return Math.max(0, Math.min(1, 1 - num / LATENCY_SCALE_MS));
}

function formatMetric(value, loading) {
    if (loading) {
        return '…';
    }
    if (value === '' || value === null || value === undefined) {
        return '—';
    }
    return String(value);
}

function clearActiveMetrics() {
    Object.values(metrics).forEach(({ card }) => card.classList.remove('is-active'));
}

function setActiveMetric(key) {
    clearActiveMetrics();
    if (key && metrics[key]) {
        metrics[key].card.classList.add('is-active');
    }
}

function phaseForStatus(status) {
    switch (status) {
        case 0:
            return 'Initializing…';
        case 1:
            return 'Measuring download';
        case 2:
            return 'Measuring ping & jitter';
        case 3:
            return 'Measuring upload';
        case 4:
            return 'Test complete';
        default:
            return 'Ready to test';
    }
}

function heroForStatus(data) {
    const status = data.testState;

    if (status === 1) {
        return {
            value: formatMetric(data.dlStatus, data.dlStatus === 0),
            unit: 'Mbps',
            metric: 'dl',
        };
    }
    if (status === 2) {
        return {
            value: formatMetric(data.pingStatus, false),
            unit: 'ms ping',
            metric: 'ping',
        };
    }
    if (status === 3) {
        return {
            value: formatMetric(data.ulStatus, data.ulStatus === 0),
            unit: 'Mbps',
            metric: 'ul',
        };
    }
    if (status >= 4) {
        const dl = parseNumber(data.dlStatus);
        return {
            value: dl === null ? formatMetric(data.dlStatus, false) : String(data.dlStatus),
            unit: 'Mbps down',
            metric: 'dl',
        };
    }

    return { value: '—', unit: 'Mbps', metric: null };
}

function updateMetricBars(data) {
    setBarFill(metrics.dl.bar, speedBarRatio(data.dlStatus));
    setBarFill(metrics.ul.bar, speedBarRatio(data.ulStatus));
    setBarFill(metrics.ping.bar, latencyBarRatio(data.pingStatus));
    setBarFill(metrics.jit.bar, latencyBarRatio(data.jitterStatus));
}

function initUI() {
    metrics.dl.text.textContent = '—';
    metrics.ul.text.textContent = '—';
    metrics.ping.text.textContent = '—';
    metrics.jit.text.textContent = '—';
    ipEl.textContent = '—';
    ipArea.hidden = true;
    heroValue.textContent = '—';
    heroUnit.textContent = 'Mbps';
    testPhase.textContent = 'Ready to test';
    setGaugeProgress(0);
    clearActiveMetrics();
    updateMetricBars({ dlStatus: '', ulStatus: '', pingStatus: '', jitterStatus: '' });

    panel.classList.remove('is-running');
    startStopLabel.textContent = 'Start test';
    startStopBtn.classList.remove('is-running');
    startStopBtn.disabled = false;
}

function updateProgress(data) {
    const overall = (Number(data.dlProgress) * 2 + Number(data.ulProgress) * 2 + Number(data.pingProgress)) / 5;
    setGaugeProgress(overall);
}

function handleWorkerMessage(event) {
    const data = JSON.parse(event.data);
    const status = data.testState;

    if (data.clientIp) {
        ipEl.textContent = data.clientIp;
        ipArea.hidden = false;
    }

    metrics.dl.text.textContent = formatMetric(data.dlStatus, status === 1 && data.dlStatus === 0);
    metrics.ul.text.textContent = formatMetric(data.ulStatus, status === 3 && data.ulStatus === 0);
    metrics.ping.text.textContent = formatMetric(data.pingStatus, false);
    metrics.jit.text.textContent = formatMetric(data.jitterStatus, false);
    updateMetricBars(data);
    updateProgress(data);

    testPhase.textContent = phaseForStatus(status);
    const hero = heroForStatus(data);
    heroValue.textContent = hero.value;
    heroUnit.textContent = hero.unit;
    setActiveMetric(hero.metric);

    if (status >= 4) {
        worker = null;
        panel.classList.remove('is-running');
        startStopLabel.textContent = 'Run again';
        startStopBtn.classList.remove('is-running');
        startStopBtn.disabled = false;
        clearActiveMetrics();
    }
}

function startTest() {
    worker = new Worker('speedtest/speedtest_worker.min.js');
    worker.postMessage('start {"telemetry_level":0,"getIp_ispInfo":false}');
    panel.classList.add('is-running');
    startStopLabel.textContent = 'Abort test';
    startStopBtn.classList.add('is-running');
    startStopBtn.disabled = false;

    worker.onmessage = handleWorkerMessage;
    worker.onerror = () => {
        worker = null;
        initUI();
        startStopLabel.textContent = 'Test failed — retry';
    };
}

function stopTest() {
    if (worker) {
        worker.postMessage('abort');
        worker = null;
    }
    initUI();
}

function toggleTest() {
    if (worker) {
        stopTest();
        return;
    }
    initUI();
    startTest();
}

startStopBtn.addEventListener('click', toggleTest);

setInterval(() => {
    if (worker) {
        worker.postMessage('status');
    }
}, 200);

initUI();
