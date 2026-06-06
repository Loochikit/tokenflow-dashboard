# 📊 TokenFlow - LLMOps Real-Time Observability & Cost Tracking Portal

**TokenFlow** es una plataforma web full-stack de observabilidad en tiempo real diseñada para monitorear, auditar y controlar el consumo de tokens y los costos financieros asociados al uso de Modelos de Lenguaje (LLMs) como GPT-4o, Claude 3.5, Gemini y modelos locales (Llama 3/Ollama).

Este proyecto está diseñado para demostrar competencias avanzadas en **arquitectura full-stack**, **comunicación bidireccional en tiempo real**, **sincronización de estado distribuido** y **optimización de rendimiento gráfico en el navegador**.

---

## 🚀 Características Clave

*   **Telemetría en Tiempo Real:** Comunicación persistente y bidireccional mediante **WebSockets (Socket.io)** para actualización instantánea de métricas en el cliente.
*   **Registro Dinámico de Modelos (Extensible):** Registro de modelos y tarifas flexible. Permite añadir nuevos modelos (ej. GPT-5) y configurar costos de Entrada/Salida por millón de tokens en caliente desde la interfaz.
*   **Simulador de Tráfico (SRE Testbed):** Generador de flujo de telemetría con múltiples modos de carga de trabajo (*Idle*, *Normal*, *Peak Load*, *Error Spike (HTTP 429)*) para auditar la resistencia del dashboard.
*   **Visualización Premium (UI/UX):** Interfaz oscura moderna utilizando técnicas de **Glassmorphism**, variables CSS HSL neón, y gráficas fluidas con **Chart.js** (optimizadas mediante acumulación temporal en cliente).
*   **Persistencia Ligera:** Base de datos modular local basada en sistemas de archivos JSON (`models.json` y `history.json`), facilitando la ejecución inmediata sin necesidad de configurar servicios de bases de datos externas (ideal para evaluaciones técnicas rápidas).

---

## 🛠️ Tecnologías Utilizadas

*   **Backend:** Node.js, Express, Socket.io (Engine de WebSockets), FS Persistencia
*   **Frontend:** HTML5 Semántico, CSS3 (Gradients, Flexbox, CSS Grid, Backdrop Filters), JavaScript (ES6+ Nativo), Chart.js (Visualizaciones)
*   **Despliegue y APIs:** REST API para Ingesta Externa de Telemetría

---

## 💻 Instalación y Ejecución Local

Para ejecutar el portal en tu entorno de desarrollo local, sigue estos sencillos pasos:

1. **Navega al directorio del proyecto:**
   ```bash
   cd tokenflow
   ```

2. **Instala las dependencias necesarias:**
   ```bash
   npm install
   ```

3. **Inicia el servidor en modo desarrollo:**
   ```bash
   npm run dev
   ```

4. **Accede al portal:**
   * Abre **`http://localhost:4000`** en tu navegador.
   * Abre múltiples pestañas para observar la sincronización de WebSockets en tiempo real.

---

## 📡 Integración en Producción (Ingesta de Logs Reales)

**TokenFlow** admite dos métodos para capturar y monitorear peticiones reales en tiempo real:

### Método A: Usar TokenFlow como un Proxy LLM (Recomendado)
Este método es el más limpio. Tu aplicación no necesita reportar logs manualmente; simplemente cambia el `baseURL` (punto de acceso) de tus SDKs de IA para que pasen a través del servidor local de TokenFlow. El proxy reenviará la llamada al proveedor oficial, interceptará el uso de tokens y devolverá la respuesta intacta a tu aplicación de manera transparente.

#### 1. OpenAI, Groq, DeepSeek u Ollama Local
Cambia el `baseURL` en tu SDK por `http://localhost:4000/v1`:

*   **En Python:**
    ```python
    from openai import OpenAI
    
    # Apunta el cliente al proxy local de TokenFlow
    client = OpenAI(
        base_url="http://localhost:4000/v1",
        api_key="TU_OPENAI_API_KEY" # Se enviará de forma segura al proveedor
    )
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hola, genera una lista de 3 ideas."}]
    )
    print(response.choices[0].message.content)
    ```

*   **En Node.js:**
    ```javascript
    const { OpenAI } = require('openai');
    
    const openai = new OpenAI({
      baseURL: 'http://localhost:4000/v1',
      apiKey: 'TU_OPENAI_API_KEY'
    });
    
    async function main() {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: '¿Qué es un socket?' }],
      });
      console.log(completion.choices[0].message.content);
    }
    main();
    ```

#### 2. Anthropic (Claude)
Apunta la dirección base del cliente al proxy de Anthropic `http://localhost:4000/v1`:

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:4000/v1",
    api_key="TU_ANTHROPIC_API_KEY"
)

message = client.messages.create(
    model="claude-3-5-sonnet",
    max_tokens=1000,
    temperature=0,
    messages=[{"role": "user", "content": "Hola Claude, ¿cómo estás?"}]
)
print(message.content[0].text)
```

#### 3. Google Gemini
Apunta tu cliente HTTP al proxy de Gemini reemplazando `generativelanguage.googleapis.com` por `localhost:4000`:
*   URL Proxy: `POST http://localhost:4000/v1beta/models/gemini-1.5-pro:generateContent?key=TU_GEMINI_API_KEY`

---

### Método B: Ingesta Manual mediante API REST `/api/v1/track`
Si prefieres procesar las llamadas por tu cuenta y reportar los datos de forma independiente, haz un `POST` al endpoint `/api/v1/track`.

#### Ejemplo de Payload:
```json
{
  "model": "gpt-4o",
  "promptTokens": 150,
  "completionTokens": 320,
  "latency": 450,
  "error": false
}
```

*   **Ejemplo en Python:**
    ```python
    import requests
    
    payload = {
        "model": "gpt-4o",
        "promptTokens": 120,
        "completionTokens": 350,
        "latency": 250,
        "error": False
    }
    requests.post("http://localhost:4000/api/v1/track", json=payload)
    ```

---

## 💡 Conceptos de Ingeniería de Software Demostrados

*   **Principio de Abierto/Cerrado (SOLID Open-Closed):** La arquitectura de modelos no está acoplada al código duro. Cualquier modelo e inteligencia tarifaria se registra dinámicamente y el sistema recalcula los agregados automáticamente.
*   **Agregación y Reducción de Ruido en Gráficos (Debouncing / Bucketing):** Para evitar ralentizar el navegador del cliente con cientos de actualizaciones por segundo en picos de tráfico, el cliente agrupa y suma los eventos recibidos dentro de ventanas de 1 segundo antes de actualizar la gráfica en vivo.
*   **Manejo Eficiente de Conexiones Persistentes:** Sincronización automática de estado al conectar un cliente (envío del catálogo de modelos, métricas históricas de 24 horas y acumulados diarios) minimizando la latencia inicial percibida.
