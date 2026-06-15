const startStopBtn = document.getElementById('startStopBtn');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');
const ipArea = document.getElementById('ipArea');
const ipEl = document.getElementById('ip');
const dlText = document.getElementById('dlText');
const ulText = document.getElementById('ulText');
const pingText = document.getElementById('pingText');
const jitText = document.getElementById('jitText');

let worker = null;

function initUI() {
    dlText.textContent = '—';
    ulText.textContent = '—';
    pingText.textContent = '—';
    jitText.textContent = '—';
    ipEl.textContent = '—';
    ipArea.hidden = true;
    progress.style.width = '0%';
    progressBar.classList.remove('is-active');
    startStopBtn.textContent = 'Start test';
    startStopBtn.classList.remove('is-running');
    startStopBtn.disabled = false;
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

function updateProgress(data) {
    const prog = (Number(data.dlProgress) * 2 + Number(data.ulProgress) * 2 + Number(data.pingProgress)) / 5;
    progress.style.width = `${Math.min(100, Math.max(0, prog * 100))}%`;
}

function handleWorkerMessage(event) {
    const data = JSON.parse(event.data);
    const status = data.testState;

    if (data.clientIp) {
        ipEl.textContent = data.clientIp;
        ipArea.hidden = false;
    }

    dlText.textContent = formatMetric(data.dlStatus, status === 1 && data.dlStatus === 0);
    ulText.textContent = formatMetric(data.ulStatus, status === 3 && data.ulStatus === 0);
    pingText.textContent = formatMetric(data.pingStatus, false);
    jitText.textContent = formatMetric(data.jitterStatus, false);
    updateProgress(data);

    if (status >= 4) {
        worker = null;
        progressBar.classList.remove('is-active');
        startStopBtn.textContent = 'Start test';
        startStopBtn.classList.remove('is-running');
        startStopBtn.disabled = false;
    }
}

function startTest() {
    worker = new Worker('speedtest/speedtest_worker.min.js');
    worker.postMessage('start {"telemetry_level":0,"getIp_ispInfo":false}');
    progressBar.classList.add('is-active');
    startStopBtn.textContent = 'Abort test';
    startStopBtn.classList.add('is-running');
    startStopBtn.disabled = false;

    worker.onmessage = handleWorkerMessage;
    worker.onerror = () => {
        worker = null;
        initUI();
        startStopBtn.textContent = 'Test failed — retry';
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
