/**
 * Script de prueba de integración de TokenFlow
 * 
 * Ejecuta este script desde la terminal para enviar peticiones en tiempo real
 * al proxy y verificar cómo se actualiza el Dashboard instantáneamente.
 */

async function runTests() {
  console.log("=================================================");
  console.log("🧪 Iniciando Prueba de Integración de TokenFlow");
  console.log("=================================================\n");

  const BASE_URL = "http://localhost:4000";

  // 1. Simular una llamada exitosa de OpenAI GPT-4o (Vía API de logs manuales)
  console.log("1. Enviando telemetría de éxito de OpenAI GPT-4o...");
  try {
    const res = await fetch(`${BASE_URL}/api/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        promptTokens: 450,
        completionTokens: 850,
        latency: 420,
        error: false
      })
    });
    const data = await res.json();
    console.log("👉 Respuesta del servidor:", data.success ? "ÉXITO" : "ERROR");
  } catch (err) {
    console.error("❌ Error de red:", err.message);
  }

  // Esperar 2 segundos antes del siguiente envío
  await new Promise(r => setTimeout(r, 2000));

  // 2. Simular una llamada exitosa de Claude 3.5 Sonnet (Vía API de logs manuales)
  console.log("\n2. Enviando telemetría de éxito de Claude 3.5 Sonnet...");
  try {
    const res = await fetch(`${BASE_URL}/api/v1/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-3-5-sonnet",
        promptTokens: 280,
        completionTokens: 620,
        latency: 780,
        error: false
      })
    });
    const data = await res.json();
    console.log("👉 Respuesta del servidor:", data.success ? "ÉXITO" : "ERROR");
  } catch (err) {
    console.error("❌ Error de red:", err.message);
  }

  // Esperar 2 segundos
  await new Promise(r => setTimeout(r, 2000));

  // 3. Simular llamada fallida al Proxy de Gemini (Google API)
  console.log("\n3. Probando enrutamiento del Proxy de Gemini (Fallo controlado)...");
  try {
    const res = await fetch(`${BASE_URL}/v1beta/models/gemini-1.5-flash:generateContent?key=CLAVE_FALSA`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Prueba de proxy" }] }]
      })
    });
    
    const data = await res.json();
    console.log("👉 Código HTTP del Proxy:", res.status);
    console.log("👉 Respuesta interceptada:", data.error ? `ÉXITO (Capturó el error: ${data.error.message})` : "ERROR");
  } catch (err) {
    console.error("❌ Error de red conectando al Proxy:", err.message);
  }

  console.log("\n=================================================");
  console.log("✅ Pruebas finalizadas.");
  console.log("Revisa tu Dashboard en http://localhost:4000");
  console.log("Deberías ver 2 peticiones exitosas (moradas) y 1 error (rojo).");
  console.log("=================================================");
}

runTests();
