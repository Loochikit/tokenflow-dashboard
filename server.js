const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ruta explícita para servir el index.html en el root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Archivos de Persistencia
const MODELS_FILE = path.join(__dirname, 'models.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Estado de la Aplicación
let models = [];
let history = {
  daily: {},  // Agrupado por fecha (AAAA-MM-DD): { modelId: { inputTokens, outputTokens, cost, requests, errors } }
  hourly: [], // Últimas 24 horas: [ { hour: '13:00', inputTokens, outputTokens, cost, requests, errors } ]
  liveBuffer: [] // Últimas 60 peticiones individuales para la gráfica live
};
let trafficMode = 'normal'; // 'idle', 'normal', 'peak', 'errors'
let simulatorIntervalId = null;

// Cargar Modelos desde models.json
function loadModels() {
  try {
    if (fs.existsSync(MODELS_FILE)) {
      const data = fs.readFileSync(MODELS_FILE, 'utf8');
      models = JSON.parse(data);
      console.log(`[ModelRegistry] Cargados ${models.length} modelos con éxito.`);
    } else {
      // Fallback si no existe el archivo
      models = [
        { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", inputPricePerMillion: 5.0, outputPricePerMillion: 15.0, active: true },
        { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", inputPricePerMillion: 3.0, outputPricePerMillion: 15.0, active: true },
        { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", inputPricePerMillion: 3.5, outputPricePerMillion: 10.5, active: true }
      ];
      fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
    }
  } catch (err) {
    console.error('[ModelRegistry] Error cargando modelos:', err);
  }
}

// Guardar Modelos a models.json
function saveModels() {
  try {
    fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2));
  } catch (err) {
    console.error('[ModelRegistry] Error guardando modelos:', err);
  }
}

// Cargar Historial
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      history = JSON.parse(data);
      console.log('[History] Historial cargado desde el disco.');
    } else {
      preseedHistory();
      saveHistory();
    }
  } catch (err) {
    console.error('[History] Error cargando historial:', err);
    preseedHistory();
  }
}

// Guardar Historial
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('[History] Error guardando historial:', err);
  }
}

// Pre-sembrar historial realista de los últimos 7 días y 24 horas
function preseedHistory() {
  console.log('[History] Generando datos históricos realistas para el portafolio...');
  const daily = {};
  const hourly = [];
  
  const now = new Date();
  
  // 1. Sembrar historial de los últimos 7 días
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    daily[dateStr] = {};
    
    // Generar consumo diario por cada modelo activo
    models.forEach(model => {
      if (!model.active) return;
      
      // Multiplicador aleatorio por día para ver picos y valles realistas
      const dayFactor = 0.5 + Math.random() * 1.5;
      let requests = Math.round(1500 * dayFactor);
      let inputTokens = Math.round(requests * (300 + Math.random() * 500));
      let outputTokens = Math.round(requests * (200 + Math.random() * 400));
      let errors = Math.round(requests * (0.005 + Math.random() * 0.015)); // ~1% de errores
      
      const cost = ((inputTokens * model.inputPricePerMillion) + (outputTokens * model.outputPricePerMillion)) / 1000000;
      
      daily[dateStr][model.id] = {
        inputTokens,
        outputTokens,
        cost: parseFloat(cost.toFixed(4)),
        requests,
        errors
      };
    });
  }
  
  // 2. Sembrar historial por hora (últimas 24 horas)
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now.getTime() - (i * 60 * 60 * 1000));
    const hourStr = `${String(h.getHours()).padStart(2, '0')}:00`;
    
    let inputTokens = 0;
    let outputTokens = 0;
    let cost = 0;
    let requests = 0;
    let errors = 0;
    
    // Suma de los consumos de modelos activos en esa hora
    models.forEach(model => {
      if (!model.active) return;
      
      // Curva diaria: menos uso en la madrugada (2 AM - 6 AM), pico a las 2 PM - 6 PM
      const hourVal = h.getHours();
      let hourFactor = 1.0;
      if (hourVal >= 1 && hourVal <= 6) hourFactor = 0.2; // Madrugada baja
      else if (hourVal >= 13 && hourVal <= 18) hourFactor = 1.8; // Horas pico
      
      const rand = 0.7 + Math.random() * 0.6;
      const hourRequests = Math.round(75 * hourFactor * rand);
      const hourInput = Math.round(hourRequests * (400 + Math.random() * 300));
      const hourOutput = Math.round(hourRequests * (250 + Math.random() * 250));
      const hourErr = Math.round(hourRequests * (Math.random() > 0.95 ? 0.05 : 0.005));
      const hourCost = ((hourInput * model.inputPricePerMillion) + (hourOutput * model.outputPricePerMillion)) / 1000000;
      
      inputTokens += hourInput;
      outputTokens += hourOutput;
      cost += hourCost;
      requests += hourRequests;
      errors += hourErr;
    });
    
    hourly.push({
      hour: hourStr,
      inputTokens,
      outputTokens,
      cost: parseFloat(cost.toFixed(4)),
      requests,
      errors
    });
  }
  
  history = {
    daily,
    hourly,
    liveBuffer: []
  };
}

// Registrar un log de consumo de token
function registerTokenUsage(data) {
  const { model: modelId, promptTokens, completionTokens, latency, error = false, errorMessage = '' } = data;
  
  // Encontrar modelo en base de datos. Si no existe, lo agregamos dinámicamente.
  let model = models.find(m => m.id === modelId);
  if (!model) {
    // Intentar deducir proveedor
    let provider = 'Otros';
    if (modelId.startsWith('gpt') || modelId.startsWith('o1')) provider = 'OpenAI';
    else if (modelId.startsWith('claude')) provider = 'Anthropic';
    else if (modelId.startsWith('gemini')) provider = 'Google';
    else if (modelId.startsWith('llama')) provider = 'Meta';
    
    model = {
      id: modelId,
      name: modelId.toUpperCase(),
      provider: provider,
      inputPricePerMillion: 1.5, // Tarifas genéricas
      outputPricePerMillion: 4.5,
      active: true
    };
    models.push(model);
    saveModels();
    io.emit('models_updated', models);
  }
  
  // Calcular Costo en USD
  let calculatedCost = 0;
  if (!error) {
    calculatedCost = ((promptTokens * model.inputPricePerMillion) + (completionTokens * model.outputPricePerMillion)) / 1000000;
  }
  
  calculatedCost = parseFloat(calculatedCost.toFixed(6));
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = `${String(now.getHours()).padStart(2, '0')}:00`;
  
  // 1. Actualizar consumo diario
  if (!history.daily[dateStr]) {
    history.daily[dateStr] = {};
  }
  if (!history.daily[dateStr][modelId]) {
    history.daily[dateStr][modelId] = { inputTokens: 0, outputTokens: 0, cost: 0, requests: 0, errors: 0 };
  }
  
  const dayMetric = history.daily[dateStr][modelId];
  dayMetric.requests += 1;
  if (error) {
    dayMetric.errors += 1;
  } else {
    dayMetric.inputTokens += promptTokens;
    dayMetric.outputTokens += completionTokens;
    dayMetric.cost = parseFloat((dayMetric.cost + calculatedCost).toFixed(4));
  }
  
  // 2. Actualizar consumo por hora (última hora en la lista)
  let currentHourRecord = history.hourly[history.hourly.length - 1];
  if (!currentHourRecord || currentHourRecord.hour !== hourStr) {
    currentHourRecord = { hour: hourStr, inputTokens: 0, outputTokens: 0, cost: 0, requests: 0, errors: 0 };
    history.hourly.push(currentHourRecord);
    if (history.hourly.length > 24) {
      history.hourly.shift();
    }
  }
  
  currentHourRecord.requests += 1;
  if (error) {
    currentHourRecord.errors += 1;
  } else {
    currentHourRecord.inputTokens += promptTokens;
    currentHourRecord.outputTokens += completionTokens;
    currentHourRecord.cost = parseFloat((currentHourRecord.cost + calculatedCost).toFixed(4));
  }
  
  // 3. Registrar en búfer de eventos en tiempo real
  const logEvent = {
    timestamp: now.toLocaleTimeString(),
    model: model.name,
    modelId: model.id,
    provider: model.provider,
    inputTokens: error ? 0 : promptTokens,
    outputTokens: error ? 0 : completionTokens,
    latency,
    cost: calculatedCost,
    error,
    errorMessage
  };
  
  history.liveBuffer.push(logEvent);
  if (history.liveBuffer.length > 60) {
    history.liveBuffer.shift();
  }
  
  // Transmitir evento individual a clientes WebSocket
  io.emit('token_event', logEvent);
  
  // Transmitir métricas agregadas de hoy
  io.emit('today_metrics', getTodayAggregates());
  
  return logEvent;
}

// Obtener las métricas acumuladas de hoy (para los KPI principales del frontend)
function getTodayAggregates() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const dayData = history.daily[dateStr] || {};
  
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let totalRequests = 0;
  let totalErrors = 0;
  
  Object.keys(dayData).forEach(modelId => {
    const metric = dayData[modelId];
    totalInput += metric.inputTokens;
    totalOutput += metric.outputTokens;
    totalCost += metric.cost;
    totalRequests += metric.requests;
    totalErrors += metric.errors;
  });
  
  return {
    date: dateStr,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    cost: parseFloat(totalCost.toFixed(4)),
    requests: totalRequests,
    errors: totalErrors,
    errorRate: totalRequests > 0 ? parseFloat(((totalErrors / totalRequests) * 100).toFixed(2)) : 0
  };
}

// Simulador de tráfico LLM
function runTrafficSimulation() {
  if (trafficMode === 'idle') return; // En modo inactivo no inyectamos tráfico mock
  
  let numRequests = 0;
  let errorRate = 0.02; // 2% normal
  
  switch (trafficMode) {
    case 'normal':
      numRequests = Math.floor(Math.random() * 2) + 1;
      break;
    case 'peak':
      numRequests = Math.floor(Math.random() * 5) + 4;
      break;
    case 'errors':
      numRequests = Math.floor(Math.random() * 3) + 2;
      errorRate = 0.65;
      break;
  }
  
  const activeModels = models.filter(m => m.active);
  if (activeModels.length === 0) return;
  
  for (let i = 0; i < numRequests; i++) {
    // Selección ponderada de modelos
    const weights = activeModels.map(m => {
      if (m.id.includes('flash') || m.id.includes('3.5-turbo')) return 4;
      if (m.id.includes('sonnet') || m.id.includes('gpt-4o')) return 3;
      return 1;
    });
    
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomVal = Math.random() * totalWeight;
    let selectedModel = activeModels[0];
    
    for (let j = 0; j < activeModels.length; j++) {
      randomVal -= weights[j];
      if (randomVal <= 0) {
        selectedModel = activeModels[j];
        break;
      }
    }
    
    const isError = Math.random() < errorRate;
    let promptTokens = 0;
    let completionTokens = 0;
    let latency = 0;
    let errorMessage = '';
    
    if (isError) {
      latency = Math.round(100 + Math.random() * 200);
      errorMessage = Math.random() > 0.5 
        ? '429 Too Many Requests: Rate limit exceeded for organization'
        : '503 Service Unavailable: Provider API overload';
    } else {
      promptTokens = Math.round(150 + Math.random() * 1200);
      completionTokens = Math.round(50 + Math.random() * 800);
      const modelBaseLatency = selectedModel.id.includes('pro') || selectedModel.id.includes('opus') || selectedModel.id.includes('gpt-4o') ? 800 : 250;
      latency = Math.round(modelBaseLatency + (completionTokens * 1.5) + Math.random() * 300);
    }
    
    registerTokenUsage({
      model: selectedModel.id,
      promptTokens,
      completionTokens,
      latency,
      error: isError,
      errorMessage
    });
  }
}

// Iniciar ciclo de simulación
function startSimulator() {
  if (simulatorIntervalId) {
    clearInterval(simulatorIntervalId);
  }
  simulatorIntervalId = setInterval(runTrafficSimulation, 1000);
}

// Cargar estado inicial
loadModels();
loadHistory();
startSimulator();

// ==========================================================================
// 📡 PROXY INTERCEPTOR GATEWAY (Soporte Multi-Modelo Real-Time)
// ==========================================================================

// Friendly GET info route to prevent confusion in browser
app.get('/v1', (req, res) => {
  res.json({
    status: "active",
    message: "TokenFlow LLM Proxy is active! Please send POST requests through your AI SDKs (OpenAI, Claude, Gemini, Ollama) using this address as the baseURL.",
    endpoints: {
      openai_compatibility: "POST /v1/chat/completions",
      anthropic_claude: "POST /v1/messages",
      google_gemini: "POST /v1beta/models/:modelAndAction"
    },
    documentation: "See the project README.md for Python and Node.js code examples."
  });
});

// 1. OpenAI, Ollama, Groq, DeepSeek Proxy Route
app.post('/v1/chat/completions', async (req, res) => {
  const startTime = Date.now();
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Falta cabecera Authorization (Bearer Token)' });
  }

  const modelId = req.body.model;
  let targetUrl = 'https://api.openai.com/v1/chat/completions';
  
  // Enrutamiento inteligente según el modelo solicitado
  if (modelId && (modelId.startsWith('llama') || modelId.startsWith('ollama') || modelId.includes('local'))) {
    targetUrl = 'http://localhost:11434/v1/chat/completions'; // Ollama Local
  } else if (modelId && (modelId.startsWith('deepseek') || modelId.includes('deepseek'))) {
    targetUrl = 'https://api.deepseek.com/v1/chat/completions'; // DeepSeek Oficial
  } else if (modelId && modelId.startsWith('groq/')) {
    targetUrl = 'https://api.groq.com/openai/v1/chat/completions'; // Groq
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (response.ok && data.usage) {
      // Registrar consumo real de tokens
      registerTokenUsage({
        model: modelId,
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        latency,
        error: false
      });
    } else if (!response.ok) {
      // Registrar error real del proveedor
      registerTokenUsage({
        model: modelId || 'openai-model-error',
        promptTokens: 0,
        completionTokens: 0,
        latency,
        error: true,
        errorMessage: data.error?.message || `API Error: ${response.status}`
      });
    }

    res.status(response.status).json(data);
  } catch (err) {
    const latency = Date.now() - startTime;
    registerTokenUsage({
      model: modelId || 'openai-model-connection-error',
      promptTokens: 0,
      completionTokens: 0,
      latency,
      error: true,
      errorMessage: `Proxy Network Error: ${err.message}`
    });
    res.status(502).json({ error: 'Bad Gateway: No se pudo conectar con el proveedor de IA.', details: err.message });
  }
});

// 2. Anthropic Claude Proxy Route
app.post('/v1/messages', async (req, res) => {
  const startTime = Date.now();
  const apiKey = req.headers['x-api-key'];
  const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';

  if (!apiKey) {
    return res.status(401).json({ error: 'Falta cabecera x-api-key para la API de Anthropic' });
  }

  const modelId = req.body.model;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (response.ok && data.usage) {
      registerTokenUsage({
        model: modelId,
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        latency,
        error: false
      });
    } else if (!response.ok) {
      registerTokenUsage({
        model: modelId || 'anthropic-model-error',
        promptTokens: 0,
        completionTokens: 0,
        latency,
        error: true,
        errorMessage: data.error?.message || `Anthropic API Error: ${response.status}`
      });
    }

    res.status(response.status).json(data);
  } catch (err) {
    const latency = Date.now() - startTime;
    registerTokenUsage({
      model: modelId || 'anthropic-model-connection-error',
      promptTokens: 0,
      completionTokens: 0,
      latency,
      error: true,
      errorMessage: `Proxy Network Error (Anthropic): ${err.message}`
    });
    res.status(502).json({ error: 'Bad Gateway: No se pudo conectar con Anthropic.', details: err.message });
  }
});

// 3. Google Gemini API Proxy Route
app.post('/v1beta/models/:modelAndAction', async (req, res) => {
  const startTime = Date.now();
  const apiKey = req.query.key;
  const modelAndAction = req.params.modelAndAction; // Ej: "gemini-1.5-pro:generateContent"
  
  if (!apiKey) {
    return res.status(400).json({ error: 'Falta parámetro API Key (?key=YOUR_GEMINI_KEY)' });
  }

  const parts = modelAndAction.split(':');
  const modelId = parts[0];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelAndAction}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (response.ok && data.usageMetadata) {
      registerTokenUsage({
        model: modelId,
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        latency,
        error: false
      });
    } else if (!response.ok) {
      registerTokenUsage({
        model: modelId || 'gemini-model-error',
        promptTokens: 0,
        completionTokens: 0,
        latency,
        error: true,
        errorMessage: data.error?.message || `Gemini API Error: ${response.status}`
      });
    }

    res.status(response.status).json(data);
  } catch (err) {
    const latency = Date.now() - startTime;
    registerTokenUsage({
      model: modelId || 'gemini-model-connection-error',
      promptTokens: 0,
      completionTokens: 0,
      latency,
      error: true,
      errorMessage: `Proxy Network Error (Gemini): ${err.message}`
    });
    res.status(502).json({ error: 'Bad Gateway: No se pudo conectar con Google Gemini API.', details: err.message });
  }
});


// ==========================================================================
// 🛠️ RUTAS DE ADMINISTRACIÓN REST
// ==========================================================================

// 1. Obtener todos los modelos
app.get('/api/v1/models', (req, res) => {
  res.json(models);
});

// 2. Crear o editar modelo
app.post('/api/v1/models', (req, res) => {
  const { id, name, provider, inputPricePerMillion, outputPricePerMillion, active = true } = req.body;
  
  if (!id || !name || !provider || inputPricePerMillion === undefined || outputPricePerMillion === undefined) {
    return res.status(400).json({ error: 'Faltan campos obligatorios en el modelo.' });
  }
  
  const existingIdx = models.findIndex(m => m.id === id);
  const modelData = {
    id: id.toLowerCase().replace(/\s+/g, '-'),
    name,
    provider,
    inputPricePerMillion: parseFloat(inputPricePerMillion),
    outputPricePerMillion: parseFloat(outputPricePerMillion),
    active: !!active
  };
  
  if (existingIdx !== -1) {
    models[existingIdx] = modelData;
  } else {
    models.push(modelData);
  }
  
  saveModels();
  io.emit('models_updated', models);
  res.json({ success: true, model: modelData });
});

// 3. Activar/Desactivar un modelo
app.post('/api/v1/models/toggle', (req, res) => {
  const { id } = req.body;
  const model = models.find(m => m.id === id);
  if (!model) {
    return res.status(404).json({ error: 'Modelo no encontrado.' });
  }
  
  model.active = !model.active;
  saveModels();
  
  io.emit('models_updated', models);
  res.json({ success: true, model });
});

// 4. Ingesta manual de logs
app.post('/api/v1/track', (req, res) => {
  const { model, promptTokens, completionTokens, latency, error, errorMessage } = req.body;
  
  if (!model) {
    return res.status(400).json({ error: 'El campo "model" es obligatorio.' });
  }
  
  const logEvent = registerTokenUsage({
    model,
    promptTokens: parseInt(promptTokens || 0),
    completionTokens: parseInt(completionTokens || 0),
    latency: parseInt(latency || 100),
    error: !!error,
    errorMessage: errorMessage || ''
  });
  
  if (!logEvent) {
    return res.status(500).json({ error: 'No se pudo procesar la métrica de consumo.' });
  }
  
  res.json({ success: true, trackedEvent: logEvent });
});

// 5. Ajustar el modo de tráfico
app.post('/api/v1/traffic', (req, res) => {
  const { mode } = req.body;
  if (!['idle', 'normal', 'peak', 'errors'].includes(mode)) {
    return res.status(400).json({ error: 'Modo de tráfico inválido.' });
  }
  
  trafficMode = mode;
  io.emit('traffic_mode_changed', trafficMode);
  console.log(`[Simulator] Modo de tráfico cambiado a: ${trafficMode.toUpperCase()}`);
  res.json({ success: true, mode: trafficMode });
});

// WebSockets: Conexión de clientes
io.on('connection', (socket) => {
  console.log(`[WS] Dashboard conectado: ${socket.id}`);
  socket.emit('models_init', models);
  socket.emit('today_metrics', getTodayAggregates());
  socket.emit('history_init', history);
  socket.emit('traffic_mode_changed', trafficMode);
  
  socket.on('disconnect', () => {
    console.log(`[WS] Dashboard desconectado: ${socket.id}`);
  });
});

// Guardar historial periódicamente (5 min)
setInterval(saveHistory, 5 * 60 * 1000);

// Apagado controlado
process.on('SIGINT', () => {
  console.log('\n[Server] Guardando modelos e historial antes de apagar...');
  saveModels();
  saveHistory();
  process.exit(0);
});

// Puerto dinámico
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 TokenFlow Gateways Activos en el Puerto ${PORT}`);
  console.log(`🔗 Dashboard Web:       http://localhost:${PORT}`);
  console.log(`🔑 Proxy OpenAI/Ollama: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`🔑 Proxy Anthropic:     http://localhost:${PORT}/v1/messages`);
  console.log(`🔑 Proxy Google Gemini: http://localhost:${PORT}/v1beta/models/...`);
  console.log(`=============================================================\n`);
});
