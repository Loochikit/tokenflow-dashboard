// ==========================================================================
// TOKENFLOW FRONTEND SYSTEM ENGINE
// ==========================================================================

let socket;

// Referencias a los Gráficos de Chart.js
let liveChart = null;
let modelsDoughnutChart = null;
let historyBarChart = null;

// Acumulador por segundo para la gráfica de línea temporal en vivo
let liveSecondAccumulator = {
  inputTokens: 0,
  outputTokens: 0,
  requestCount: 0
};

// Modelos cargados en la sesión actual
let currentModels = [];

// Elementos del DOM
const systemStatusDot = document.getElementById('system-status-dot');
const systemStatusText = document.getElementById('system-status-text');
const modelsListContainer = document.getElementById('models-list-container');
const syslogConsole = document.getElementById('syslog-console');

// KPIs
const kpiTokensVal = document.getElementById('kpi-tokens-val');
const kpiTokensIn = document.getElementById('kpi-tokens-in');
const kpiTokensOut = document.getElementById('kpi-tokens-out');
const kpiCostVal = document.getElementById('kpi-cost-val');
const kpiLatencyVal = document.getElementById('kpi-latency-val');
const kpiSuccessVal = document.getElementById('kpi-success-val');
const kpiErrorsCount = document.getElementById('kpi-errors-count');
const kpiSuccessErrorsLbl = document.getElementById('kpi-success-errors-lbl');
const kpiSuccessIconWrap = document.getElementById('kpi-success-icon-wrap');

// Modales
const modelModalOverlay = document.getElementById('model-modal-overlay');
const modelForm = document.getElementById('model-form');
const modalTitleText = document.getElementById('modal-title-text');
const modelIdInput = document.getElementById('model-id');
const modelNameInput = document.getElementById('model-name');
const modelProviderInput = document.getElementById('model-provider');
const modelPriceInInput = document.getElementById('model-price-in');
const modelPriceOutInput = document.getElementById('model-price-out');
const btnSaveModel = document.getElementById('btn-save-model');

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initWebSocket();
  
  // Actualizar la gráfica en vivo cada segundo (Agregación temporal)
  setInterval(tickLiveChart, 1000);
});

// Inicializar WebSockets
function initWebSocket() {
  socket = io();

  // Eventos de Conexión
  socket.on('connect', () => {
    systemStatusDot.className = 'pulse-dot';
    systemStatusText.innerText = 'CONEXIÓN ESTABLECIDA';
    logToConsole('SYS', 'Conectado al servidor de telemetría Socket.io.', false);
  });

  socket.on('disconnect', () => {
    systemStatusDot.className = 'pulse-dot error';
    systemStatusText.innerText = 'CONEXIÓN PERDIDA - RECONECTANDO...';
    logToConsole('ERR', 'Se perdió la conexión con el servidor. Intentando reconectar...', true);
  });

  // Evento: Inicializar Modelos
  socket.on('models_init', (models) => {
    currentModels = models;
    renderModelsList(models);
  });

  // Evento: Actualización de Modelos
  socket.on('models_updated', (models) => {
    currentModels = models;
    renderModelsList(models);
    logToConsole('SYS', 'La lista y precios de modelos han sido actualizados en caliente.', false);
  });

  // Evento: Métricas Principales de Hoy
  socket.on('today_metrics', (metrics) => {
    updateKPIs(metrics);
  });

  // Evento: Inicializar Historial
  socket.on('history_init', (history) => {
    initHistoricalChartsData(history);
  });

  // Evento: Cambio en Modo de Tráfico
  socket.on('traffic_mode_changed', (mode) => {
    updateTrafficUI(mode);
  });

  // Evento: Recepción de Evento de Consumo de Tokens (En Tiempo Real)
  socket.on('token_event', (event) => {
    // 1. Acumular datos para el tick de la gráfica en vivo
    if (!event.error) {
      liveSecondAccumulator.inputTokens += event.inputTokens;
      liveSecondAccumulator.outputTokens += event.outputTokens;
      liveSecondAccumulator.requestCount += 1;
    }
    
    // 2. Registrar en consola de syslog
    if (event.error) {
      logToConsole('ERR', `Fallo al procesar petición en [${event.model}]: ${event.errorMessage}`, true);
    } else {
      logToConsole('REQ', `${event.model} (${event.provider}) | +${event.inputTokens + event.outputTokens} tokens | Latencia: ${event.latency}ms | Costo: $${event.cost.toFixed(6)}`, false);
    }

    // 3. Actualizar la última barra de la gráfica histórica
    updateHistoryChartWithLiveEvent(event);
  });
}

// ==========================================================================
// CHARTS SETUP
// ==========================================================================
function initCharts() {
  // Configuración de Estilo Global de Chart.js para encajar con el Tema Oscuro
  Chart.defaults.color = 'hsl(215, 20%, 75%)';
  Chart.defaults.font.family = 'Outfit, system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10, 15, 28, 0.95)';
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = '#fff';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;

  // 1. Gráfico en Vivo (Línea Temporal de Tokens/s)
  const ctxLive = document.getElementById('chart-live-telemetry').getContext('2d');
  const gradientLive = ctxLive.createLinearGradient(0, 0, 0, 160);
  gradientLive.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
  gradientLive.addColorStop(1, 'rgba(168, 85, 247, 0.01)');

  liveChart = new Chart(ctxLive, {
    type: 'line',
    data: {
      labels: Array(30).fill(''), // 30 segundos
      datasets: [{
        label: 'Tokens / Segundo',
        data: Array(30).fill(0),
        borderColor: 'hsl(180, 100%, 50%)',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradientLive,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: 'hsl(180, 100%, 50%)',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false }
        },
        y: {
          min: 0,
          suggestedMax: 1000,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false
          }
        }
      }
    }
  });

  // 2. Gráfico de Pastel (Distribución por Modelo)
  const ctxDoughnut = document.getElementById('chart-models-doughnut').getContext('2d');
  modelsDoughnutChart = new Chart(ctxDoughnut, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#a855f7', // GPT-4o / OpenAI (Purple)
          '#00f0ff', // Claude / Anthropic (Cyan)
          '#f59e0b', // Gemini / Google (Yellow)
          '#10b981', // Llama / Meta (Green)
          '#ef4444', // Others (Red)
          '#ec4899', '#3b82f6', '#84cc16'
        ],
        borderWidth: 1.5,
        borderColor: 'hsl(224, 20%, 12%)',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            padding: 12,
            font: { size: 10 }
          }
        }
      },
      cutout: '65%'
    }
  });

  // 3. Gráfico de Consumo Histórico (Últimas 24 horas - Stacked Bar)
  const ctxBar = document.getElementById('chart-history-bar').getContext('2d');
  historyBarChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Tokens de Entrada (Prompt)',
          data: [],
          backgroundColor: 'rgba(168, 85, 247, 0.85)',
          borderRadius: 4
        },
        {
          label: 'Tokens de Salida (Completion)',
          data: [],
          backgroundColor: 'rgba(0, 240, 255, 0.85)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, padding: 8 }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false }
        },
        y: {
          stacked: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawBorder: false
          }
        }
      }
    }
  });
}

// Actualizar las gráficas estáticas al conectar/recibir el historial
function initHistoricalChartsData(history) {
  // 1. Distribución de costos por modelo (Doughnut)
  // Agrupar costos por modelo de todo el historial diario
  const modelCosts = {};
  Object.values(history.daily).forEach(dayData => {
    Object.keys(dayData).forEach(modelId => {
      if (!modelCosts[modelId]) modelCosts[modelId] = 0;
      modelCosts[modelId] += dayData[modelId].cost;
    });
  });

  // Mapear nombres descriptivos para los labels
  const doughnutLabels = [];
  const doughnutData = [];
  
  Object.keys(modelCosts).forEach(modelId => {
    const modelObj = currentModels.find(m => m.id === modelId);
    doughnutLabels.push(modelObj ? modelObj.name : modelId.toUpperCase());
    doughnutData.push(parseFloat(modelCosts[modelId].toFixed(4)));
  });

  modelsDoughnutChart.data.labels = doughnutLabels;
  modelsDoughnutChart.data.datasets[0].data = doughnutData;
  modelsDoughnutChart.update();

  // 2. Consumo histórico por horas (Bar)
  const barLabels = [];
  const barDataInput = [];
  const barDataOutput = [];

  history.hourly.forEach(hourRecord => {
    barLabels.push(hourRecord.hour);
    barDataInput.push(hourRecord.inputTokens);
    barDataOutput.push(hourRecord.outputTokens);
  });

  historyBarChart.data.labels = barLabels;
  historyBarChart.data.datasets[0].data = barDataInput;
  historyBarChart.data.datasets[1].data = barDataOutput;
  historyBarChart.update();
}

// ==========================================================================
// ACTUALIZACIÓN DE GRÁFICAS EN TIEMPO REAL
// ==========================================================================

// Función que corre cada segundo para alimentar la línea temporal
function tickLiveChart() {
  if (!liveChart) return;

  const now = new Date();
  const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Sumar entrada y salida
  const totalTokensSec = liveSecondAccumulator.inputTokens + liveSecondAccumulator.outputTokens;

  // Insertar dato nuevo al final
  liveChart.data.labels.push(timeLabel);
  liveChart.data.datasets[0].data.push(totalTokensSec);

  // Mantener solo los últimos 30 segundos
  if (liveChart.data.labels.length > 30) {
    liveChart.data.labels.shift();
    liveChart.data.datasets[0].data.shift();
  }

  // Actualizar la gráfica sin animación (para fluidez de scroll)
  liveChart.update('none');

  // Resetear acumulador para el siguiente segundo
  liveSecondAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0
  };
}

// Actualizar en caliente la gráfica de barras de la última hora
function updateHistoryChartWithLiveEvent(event) {
  if (!historyBarChart || event.error) return;

  const now = new Date();
  const currentHourStr = `${String(now.getHours()).padStart(2, '0')}:00`;
  const datasets = historyBarChart.data.datasets;
  const labels = historyBarChart.data.labels;

  const lastIndex = labels.length - 1;

  if (lastIndex >= 0 && labels[lastIndex] === currentHourStr) {
    // Es la hora actual, acumulamos los tokens
    datasets[0].data[lastIndex] += event.inputTokens;
    datasets[1].data[lastIndex] += event.outputTokens;
  } else {
    // Si cambió de hora en el cliente, añadimos un nuevo dataset y rotamos
    labels.push(currentHourStr);
    datasets[0].data.push(event.inputTokens);
    datasets[1].data.push(event.outputTokens);

    if (labels.length > 24) {
      labels.shift();
      datasets[0].data.shift();
      datasets[1].data.shift();
    }
  }

  // Actualizar doughnut de distribución de costos en tiempo real
  const modelName = event.model;
  const doughnutLabels = modelsDoughnutChart.data.labels;
  const doughnutDataset = modelsDoughnutChart.data.datasets[0].data;
  
  const mIndex = doughnutLabels.indexOf(modelName);
  if (mIndex !== -1) {
    doughnutDataset[mIndex] = parseFloat((doughnutDataset[mIndex] + event.cost).toFixed(6));
  } else {
    // Nuevo modelo registrado en vuelo
    modelsDoughnutChart.data.labels.push(modelName);
    modelsDoughnutChart.data.datasets[0].data.push(parseFloat(event.cost.toFixed(6)));
  }

  // Actualizaciones de rendimiento
  historyBarChart.update('none');
  modelsDoughnutChart.update('none');
}

// ==========================================================================
// INTERFAZ DE USUARIO: METRICAS Y KPIS
// ==========================================================================
function updateKPIs(metrics) {
  // Formateador de números
  const numFormatter = new Intl.NumberFormat('es-ES');
  
  kpiTokensVal.innerText = numFormatter.format(metrics.totalTokens);
  kpiTokensIn.innerText = numFormatter.format(metrics.inputTokens);
  kpiTokensOut.innerText = numFormatter.format(metrics.outputTokens);
  
  kpiCostVal.innerText = `$${metrics.cost.toFixed(4)}`;
  
  kpiErrorsCount.innerText = metrics.errors;
  
  // Calcular latencia promedio basada en el live buffer del server
  // Si no hay datos todavía, queda en 0
  if (metrics.requests > 0) {
    // Tasa de éxito
    const successRate = 100 - metrics.errorRate;
    kpiSuccessVal.innerText = `${successRate.toFixed(1)}%`;
    
    if (successRate < 90) {
      kpiSuccessIconWrap.className = 'kpi-icon-wrapper red';
      kpiSuccessErrorsLbl.className = 'mono font-sm text-red';
    } else {
      kpiSuccessIconWrap.className = 'kpi-icon-wrapper cyan';
      kpiSuccessErrorsLbl.className = 'mono font-sm text-muted';
    }
  } else {
    kpiSuccessVal.innerText = '100%';
    kpiSuccessIconWrap.className = 'kpi-icon-wrapper cyan';
    kpiSuccessErrorsLbl.className = 'mono font-sm text-muted';
  }
  
  // Estimar latencia media de las últimas peticiones exitosas
  fetch('/api/v1/models')
    .then(r => r.json())
    .then(modelsList => {
      // Pedimos al servidor los datos si es necesario, o podemos calcular latencia
      // Para simplificar, el servidor nos enviará la latencia media directamente
      // Pero por ahora, calcularemos la latencia a partir de los eventos recibidos.
    });
}

// Actualizar visualmente la latencia media en caliente
function updateLatencyKPI(latency) {
  kpiLatencyVal.innerText = `${latency} ms`;
}

// ==========================================================================
// SIDEBAR: LISTA DE MODELOS
// ==========================================================================
function renderModelsList(models) {
  modelsListContainer.innerHTML = '';
  
  if (models.length === 0) {
    modelsListContainer.innerHTML = `
      <div class="loading-placeholder">
        No hay modelos registrados.
      </div>
    `;
    return;
  }

  models.forEach(model => {
    const item = document.createElement('div');
    item.className = `model-card-item ${model.active ? '' : 'disabled'}`;
    
    item.innerHTML = `
      <div class="model-info-meta">
        <h4>${model.name}</h4>
        <p>${model.provider} // ID: ${model.id}</p>
      </div>
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <div class="model-pricing-info">
          In: $${model.inputPricePerMillion}/M<br>
          Out: $${model.outputPricePerMillion}/M
        </div>
        <div class="model-actions-toggle">
          <button class="switch-btn ${model.active ? 'active' : ''}" onclick="toggleModel('${model.id}')" title="${model.active ? 'Desactivar Modelo' : 'Activar Modelo'}">
            <i class="fa-solid ${model.active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
          </button>
        </div>
      </div>
    `;
    
    modelsListContainer.appendChild(item);
  });
}

// Cambiar estado activo/inactivo de un modelo
function toggleModel(modelId) {
  fetch('/api/v1/models/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: modelId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      logToConsole('SYS', `Modelo [${data.model.name}] cambiado a: ${data.model.active ? 'ACTIVO' : 'INACTIVO'}`, false);
    }
  })
  .catch(err => console.error('Error toggling model:', err));
}

// ==========================================================================
// SIMULADOR: MODOS DE TRAFICO
// ==========================================================================
function setTrafficMode(mode) {
  fetch('/api/v1/traffic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      // La UI se actualizará mediante el evento WS 'traffic_mode_changed'
    }
  })
  .catch(err => console.error('Error setting traffic mode:', err));
}

// Actualizar los botones de la UI del simulador
function updateTrafficUI(mode) {
  // Limpiar clase active
  document.getElementById('btn-traffic-idle').classList.remove('active');
  document.getElementById('btn-traffic-normal').classList.remove('active');
  document.getElementById('btn-traffic-peak').classList.remove('active');
  document.getElementById('btn-traffic-errors').classList.remove('active');
  
  // Activar el correspondiente
  const activeBtn = document.getElementById(`btn-traffic-${mode}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  logToConsole('SYS', `Servidor cambió perfil de tráfico simulado a: ${mode.toUpperCase()}`, false);
}

// ==========================================================================
// CONSOLA DE SYSLOG EN TIEMPO REAL
// ==========================================================================
function logToConsole(tag, text, isError) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  const line = document.createElement('div');
  line.className = 'console-line';
  if (isError) line.classList.add('error-line');

  let tagClass = 'tag-sys';
  if (tag === 'REQ') tagClass = 'tag-req';
  if (tag === 'ERR') tagClass = 'tag-err';

  line.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-tag ${tagClass}">${tag}</span>
    <span class="log-text">${text}</span>
  `;

  syslogConsole.appendChild(line);
  
  // Limitar número de líneas en la consola para rendimiento del DOM (máx 150 líneas)
  if (syslogConsole.childNodes.length > 150) {
    syslogConsole.removeChild(syslogConsole.firstChild);
  }

  // Scroll automático si está al final
  syslogConsole.scrollTop = syslogConsole.scrollHeight;

  // Actualizar KPI de latencia de forma reactiva si es un request exitoso
  if (tag === 'REQ') {
    // Parsear latencia de la cadena "Latency: XXms"
    const match = text.match(/Latencia:\s*(\d+)ms/);
    if (match && match[1]) {
      updateLatencyKPI(match[1]);
    }
  }
}

// Limpiar logs
function clearConsoleLogs() {
  syslogConsole.innerHTML = `
    <div class="console-line system-line">
      <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
      <span class="log-tag tag-sys">SYS</span>
      <span class="log-text">Consola limpiada por el usuario. Esperando eventos...</span>
    </div>
  `;
}

// Filtrar logs en vivo mediante la barra de búsqueda
function filterLogs() {
  const query = document.getElementById('log-search-input').value.toLowerCase();
  const lines = syslogConsole.getElementsByClassName('console-line');
  
  Array.from(lines).forEach(line => {
    const text = line.innerText.toLowerCase();
    if (text.includes(query)) {
      line.style.display = 'flex';
    } else {
      line.style.display = 'none';
    }
  });
}

// ==========================================================================
// MODAL: REGISTRO DE MODELOS NUEVOS
// ==========================================================================
function openModelModal() {
  modelModalOverlay.classList.add('open');
  modelForm.reset();
  modelIdInput.disabled = false;
  modalTitleText.innerHTML = '<i class="fa-solid fa-robot"></i> Registrar Nuevo Modelo LLM';
  btnSaveModel.innerText = 'Guardar Configuración';
}

function closeModelModal() {
  modelModalOverlay.classList.remove('open');
}

// Guardar Modelo
function saveModelEvent(event) {
  event.preventDefault();
  
  const id = modelIdInput.value.trim();
  const name = modelNameInput.value.trim();
  const provider = modelProviderInput.value.trim();
  const inputPrice = parseFloat(modelPriceInInput.value);
  const outputPrice = parseFloat(modelPriceOutInput.value);
  
  if (!id || !name || !provider || isNaN(inputPrice) || isNaN(outputPrice)) {
    alert('Por favor, rellene todos los campos correctamente.');
    return;
  }

  const payload = {
    id,
    name,
    provider,
    inputPricePerMillion: inputPrice,
    outputPricePerMillion: outputPrice,
    active: true
  };

  fetch('/api/v1/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      closeModelModal();
      logToConsole('SYS', `Modelo registrado con éxito: ${name} [${id}]`, false);
    } else {
      alert('Error: ' + data.error);
    }
  })
  .catch(err => {
    console.error('Error guardando modelo:', err);
    alert('Error al guardar el modelo.');
  });
}

// ==========================================================================
// MODAL: GUIA DE INTEGRACIÓN DE APIS EN TIEMPO REAL
// ==========================================================================
const integrationModalOverlay = document.getElementById('integration-modal-overlay');

function openIntegrationModal() {
  integrationModalOverlay.classList.add('open');
}

function closeIntegrationModal() {
  integrationModalOverlay.classList.remove('open');
}

function switchTab(tabId) {
  // Ocultar todos los contenidos de pestañas
  document.getElementById('tab-openai').style.display = 'none';
  document.getElementById('tab-anthropic').style.display = 'none';
  document.getElementById('tab-gemini').style.display = 'none';
  
  // Mostrar pestaña seleccionada
  document.getElementById(tabId).style.display = 'block';
  
  // Limpiar estilos y clases de los botones de pestañas
  const tabButtons = ['btn-tab-openai', 'btn-tab-anthropic', 'btn-tab-gemini'];
  tabButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.remove('active');
      btn.style.color = 'var(--text-secondary)';
      btn.style.borderBottom = 'none';
    }
  });
  
  // Activar botón seleccionado
  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.color = 'var(--color-cyan)';
    activeBtn.style.borderBottom = '2px solid var(--color-cyan)';
  }
}

