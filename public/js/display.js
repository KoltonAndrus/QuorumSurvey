const surveyId = location.pathname.split('/').pop();
const socket = io();

Chart.defaults.color = '#f0f2f5';

let survey = null;
let currentResults = null;
let activeChart = null;
let lastRenderKey = null;

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function setResponseCount(n) {
  const el = document.getElementById('response-count');
  el.textContent = `${n} response${n === 1 ? '' : 's'}`;
}

// --- Renderers ---

function renderWordCloud(question, results) {
  const viz = document.getElementById('viz');
  viz.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.id = 'wc-canvas';
  // Set the canvas drawing buffer to the container's actual pixel dimensions.
  // Without this, WordCloud2 draws into the default 300×150 buffer — large
  // font sizes fill it immediately and all but one word get silently dropped.
  canvas.width = viz.offsetWidth || 900;
  canvas.height = viz.offsetHeight || 500;
  viz.appendChild(canvas);

  const words = (results.words || []).slice(0, question.wordCloudMaxWords || 50);
  if (!words.length) { viz.innerHTML = '<p class="no-data">No responses yet.</p>'; return; }

  const maxCount = words[0].count;
  const maxFont = Math.min(300, Math.max(68, Math.floor(canvas.width / 3)));
  const list = words.map(({ word, count }) => [word, Math.round(50 + (count / maxCount) * (maxFont - 50))]);

  const schemes = {
    blue:   () => `hsl(${210 + Math.random() * 40}, 80%, ${55 + Math.random() * 20}%)`,
    green:  () => `hsl(${120 + Math.random() * 40}, 60%, ${50 + Math.random() * 20}%)`,
    warm:   () => `hsl(${Math.random() * 60}, 80%, ${55 + Math.random() * 20}%)`,
    purple: () => `hsl(${270 + Math.random() * 40}, 60%, ${55 + Math.random() * 20}%)`,
  };
  const colorFn = schemes[question.wordCloudColorScheme] || schemes.blue;

  WordCloud(canvas, {
    list,
    gridSize: Math.round(canvas.width / 120),
    weightFactor: 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    color: colorFn,
    rotateRatio: 0.3,
    backgroundColor: 'transparent',
  });
}

function renderBarChart(question, results) {
  const viz = document.getElementById('viz');
  viz.innerHTML = '<div class="bar-chart-wrap"><canvas id="chart-canvas"></canvas></div>';
  const ctx = document.getElementById('chart-canvas').getContext('2d');

  if (activeChart) { activeChart.destroy(); activeChart = null; }

  const labels = question.choices;
  const data = labels.map(c => (results.counts || {})[c] || 0);
  const total = data.reduce((s, v) => s + v, 0);

  const palette = ['#0071e3','#34c759','#ff9f0a','#ff3b30','#af52de','#5ac8fa','#ff6b35','#30d158'];
  const backgroundColors = labels.map((_, i) => palette[i % palette.length]);

  activeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: backgroundColors, borderRadius: 8, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 52 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#ffffff',
            font: { size: 13 },
            padding: 20,
            generateLabels: (chart) => chart.data.labels.map((label, i) => ({
              text: label,
              fillStyle: backgroundColors[i],
              strokeStyle: 'transparent',
              lineWidth: 0,
              hidden: false,
              fontColor: '#ffffff',
            })),
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
              return ` ${ctx.raw} vote${ctx.raw !== 1 ? 's' : ''} (${pct}%)`;
            },
          },
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#f0f2f5',
          font: { size: 13, weight: '600' },
          formatter: (value) => {
            const pct = total ? Math.round((value / total) * 100) : 0;
            return `${value}\n${pct}%`;
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 15 }, color: '#c8d4e3' } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 13 }, color: '#6e7a8a' }, grid: { color: 'rgba(255,255,255,0.07)' } },
      },
    },
    plugins: [ChartDataLabels],
  });
}

function renderPieChart(question, results) {
  const viz = document.getElementById('viz');
  viz.innerHTML = '<canvas id="chart-canvas"></canvas>';
  const ctx = document.getElementById('chart-canvas').getContext('2d');

  if (activeChart) { activeChart.destroy(); activeChart = null; }

  const labels = question.choices;
  const data = labels.map(c => (results.counts || {})[c] || 0);
  const colors = ['#0071e3','#34c759','#ff9f0a','#ff3b30','#af52de','#5ac8fa','#ff6b35','#30d158'];

  activeChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 16 }, color: '#1d1d1f', padding: 16 } },
      },
    },
  });
}

function renderHistogram(question, results) {
  const viz = document.getElementById('viz');
  viz.innerHTML = '<div class="bar-chart-wrap"><canvas id="chart-canvas"></canvas></div>';
  const ctx = document.getElementById('chart-canvas').getContext('2d');

  if (activeChart) { activeChart.destroy(); activeChart = null; }

  const scale = question.scale || 5;
  const labels = Array.from({ length: scale }, (_, i) => String(i + 1));
  const data = labels.map(l => (results.buckets || {})[l] || 0);
  const total = data.reduce((s, v) => s + v, 0);

  const palette = ['#0071e3','#34c759','#ff9f0a','#ff3b30','#af52de','#5ac8fa','#ff6b35','#30d158'];
  const backgroundColors = labels.map((_, i) => palette[i % palette.length]);

  activeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: backgroundColors, borderRadius: 6, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 52 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#ffffff',
            font: { size: 13 },
            padding: 20,
            generateLabels: (chart) => chart.data.labels.map((label, i) => ({
              text: label,
              fillStyle: backgroundColors[i],
              strokeStyle: 'transparent',
              lineWidth: 0,
              hidden: false,
              fontColor: '#ffffff',
            })),
          },
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#f0f2f5',
          font: { size: 13, weight: '600' },
          formatter: (value) => {
            const pct = total ? Math.round((value / total) * 100) : 0;
            return `${value}\n${pct}%`;
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 20 }, color: '#c8d4e3' } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 14 }, color: '#6e7a8a' }, grid: { color: 'rgba(255,255,255,0.07)' } },
      },
    },
    plugins: [ChartDataLabels],
  });

  if (results.average !== null && results.count > 0) {
    const avgDiv = document.createElement('div');
    avgDiv.id = 'avg-display';
    avgDiv.textContent = `Average: ${results.average.toFixed(2)} / ${scale}  (${results.count} response${results.count !== 1 ? 's' : ''})`;
    viz.appendChild(avgDiv);
  }
}

// --- Question list ---

function buildQuestionList() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';
  survey.questions.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'question-btn';
    btn.dataset.questionId = q.id;
    btn.textContent = q.prompt;
    btn.addEventListener('click', () => pinQuestion(q.id));
    list.appendChild(btn);
  });
}

function setActivePinBtn(questionId) {
  document.querySelectorAll('.question-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.questionId === questionId);
  });
}

async function pinQuestion(questionId) {
  await fetch(`/api/surveys/${surveyId}/pin/${questionId}`, { method: 'PUT' });
}

// --- Display logic ---

function renderQuestion(questionId, results) {
  if (!survey || !results) return;

  const question = survey.questions.find(q => q.id === questionId);
  if (!question) return;

  const qResults = results.questions.find(r => r.questionId === questionId);
  if (!qResults) return;

  const renderKey = questionId + ':' + JSON.stringify(qResults);
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  document.getElementById('no-question').classList.add('hidden');
  document.getElementById('viz-container').classList.remove('hidden');
  document.getElementById('question-prompt').textContent = question.prompt;
  document.getElementById('sidebar-question').textContent = question.prompt;

  const display = question.display;

  if (display === 'word_cloud') {
    renderWordCloud(question, qResults);
  } else if (display === 'bar_chart') {
    renderBarChart(question, qResults);
  } else if (display === 'pie_chart') {
    renderPieChart(question, qResults);
  } else if (display === 'histogram') {
    renderHistogram(question, qResults);
  }
}

// --- Init ---

async function init() {
  let res;
  try {
    res = await fetch(`/api/surveys/${surveyId}`);
    if (!res.ok) { show('not-found'); return; }
    survey = await res.json();
  } catch { show('not-found'); return; }

  document.getElementById('sidebar-title').textContent = survey.title;
  document.title = survey.title;
  buildQuestionList();

  // QR code — use real LAN IP so phones on the same network can reach the server
  const { baseUrl } = await fetch('/api/server-info').then(r => r.json());
  const surveyUrl = `${baseUrl}/survey/${surveyId}`;
  new QRCode(document.getElementById('qr-container'), {
    text: surveyUrl,
    width: 180,
    height: 180,
    colorDark: '#1d1d1f',
    colorLight: '#ffffff',
  });

  // Load initial results
  const rRes = await fetch(`/api/surveys/${surveyId}/results`);
  currentResults = await rRes.json();
  setResponseCount(currentResults.totalResponses);

  // Load pinned question from state
  const stateRes = await fetch('/api/state');
  const state = await stateRes.json();
  if (state.pinnedQuestionId) {
    setActivePinBtn(state.pinnedQuestionId);
    renderQuestion(state.pinnedQuestionId, currentResults);
  }

  show('display');

  // WebSocket
  socket.emit('join_display', { surveyId });

  socket.on('results_update', data => {
    if (data.surveyId !== surveyId) return;
    currentResults = data;
    setResponseCount(data.totalResponses);
    const pinned = document.getElementById('viz-container').dataset.pinnedQuestion;
    if (pinned) renderQuestion(pinned, currentResults);
  });

  socket.on('question_pinned', data => {
    if (data.surveyId !== surveyId) return;
    document.getElementById('viz-container').dataset.pinnedQuestion = data.questionId;
    setActivePinBtn(data.questionId);
    renderQuestion(data.questionId, currentResults);
  });

  socket.on('new_response', data => {
    if (data.surveyId !== surveyId) return;
    setResponseCount(data.totalCount);
  });
}

init();

// Safety-net poll in case the socket drops — re-fetches data but only re-renders
// if the underlying results actually changed (lastRenderKey guards against flicker).
setInterval(async () => {
  try {
    const [rRes, stateRes] = await Promise.all([
      fetch(`/api/surveys/${surveyId}/results`),
      fetch('/api/state'),
    ]);
    if (!rRes.ok) return;
    currentResults = await rRes.json();
    setResponseCount(currentResults.totalResponses);

    const state = await stateRes.json();
    const pinned = state.pinnedQuestionId;
    if (pinned) {
      document.getElementById('viz-container').dataset.pinnedQuestion = pinned;
      setActivePinBtn(pinned);
      renderQuestion(pinned, currentResults);
    }
  } catch { /* network blip — try again next tick */ }
}, 10_000);
