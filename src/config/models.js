/**
 * Model Configuration for MedScribe
 *
 * STT Model: LFM2.5-Audio-1.5B
 * - Format: ONNX Q4 quantization
 * - Runtime: WebGPU (with WASM fallback)
 * - Language: English (configurable for Arabic support)
 *
 * LLM Model: LFM2.5-1.2B-Instruct
 * - Format: ONNX Q4 quantization
 * - Runtime: WebGPU (with WASM fallback)
 */

export const MODEL_CONFIG = {
  // STT Model Configuration
  stt: {
    modelId: 'LiquidAI/LFM2.5-Audio-1.5B-ONNX',
    quantization: 'q4',
    sampleRate: 16000,
    chunkDuration: 30, // seconds
    language: 'english', // 'english' or 'arabic'
    enableCache: true,
  },

  // LLM Model Configuration
  llm: {
    modelId: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    quantization: 'q4',
    temperature: 0.1, // Low temperature for consistent structured output
    maxTokens: 2048,
    enableCache: true,
  },

  // Caching Configuration
  cache: {
    cacheName: 'medscribe-models-v1',
    idbName: 'medscribe-model-cache',
    idbStore: 'models',
  },
};

export const EXTRACTION_MODEL_OPTIONS = {
  'LiquidAI/LFM2.5-1.2B-Instruct-ONNX': {
    modelId: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    subfolder: 'onnx',
    modelFileName: 'model_q4',
    dtype: 'q4',
    preferredDevice: 'webgpu',
    requiresWebGPU: true,
  },
  'Xenova/Qwen2.5-1.5B-Instruct': {
    modelId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    subfolder: 'onnx',
    modelFileName: 'model_q4',
    dtype: 'q4',
    preferredDevice: 'webgpu',
  },
  'Xenova/Phi-3-mini-4k-instruct': {
    modelId: 'Xenova/Phi-3-mini-4k-instruct',
    subfolder: 'onnx',
    modelFileName: 'model_q4',
    dtype: 'q4',
    preferredDevice: 'webgpu',
  },
  'Xenova/TinyLlama-1.1B-chat': {
    modelId: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
    subfolder: 'onnx',
    modelFileName: 'model_q4',
    dtype: 'q4',
    preferredDevice: 'webgpu',
  },
};

export function getExtractionModelConfig(modelId) {
  if (modelId === 'keyword') {
    return null;
  }

  return EXTRACTION_MODEL_OPTIONS[modelId] || {
    modelId,
    subfolder: 'onnx',
    modelFileName: 'model_q4',
    dtype: 'q4',
    preferredDevice: 'webgpu',
  };
}

/**
 * Medical extraction system prompt
 * Instructs the LLM to return structured JSON
 */
export const MEDICAL_EXTRACTION_PROMPT = `You are a medical documentation assistant. Extract structured information from the consultation transcript and return it as a JSON object with the following schema:

{
  "incident_record": "Detailed description of the patient's chief complaint and history",
  "prescription": [
    {
      "drug": "medication name",
      "dose": "dosage amount",
      "frequency": "how often to take",
      "duration": "how long to take"
    }
  ],
  "lab_recommendations": ["test 1", "test 2"],
  "radiology_recommendations": ["imaging 1", "imaging 2"],
  "treatment_plan": "step-by-step treatment approach",
  "diet_advice": ["dietary recommendation 1", "recommendation 2"],
  "summary": "brief consultation summary"
}

Important rules:
- Return ONLY valid JSON, no markdown formatting
- If a section has no information, use empty string "" or empty array []
- Be concise and accurate
- Use professional medical terminology
- Include all medications mentioned`;

// Cache API helpers for model caching
export class ModelCache {
  constructor(config) {
    this.cacheName = config.cache.cacheName;
    this.idbName = config.cache.idbName;
    this.idbStore = config.cache.idbStore;
    this.idbPromise = null;
  }

  async openIDB() {
    if (this.idbPromise) return this.idbPromise;

    this.idbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.idbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.idbStore)) {
          db.createObjectStore(this.idbStore);
        }
      };
    });

    return this.idbPromise;
  }

  async idbGet(key) {
    try {
      const db = await this.openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.idbStore, 'readonly');
        const store = tx.objectStore(this.idbStore);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } catch (e) {
      return null;
    }
  }

  async idbSet(key, value) {
    try {
      const db = await this.openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.idbStore, 'readwrite');
        const store = tx.objectStore(this.idbStore);
        const request = store.put(value, key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      // Ignore cache write failures
    }
  }

  async fetchWithCache(url) {
    const fileName = url.split('/').pop();

    // Try Cache API first
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(this.cacheName);
        const cached = await cache.match(url);
        if (cached) {
          console.log(`[Cache HIT] ${fileName}`);
          return cached;
        }

        console.log(`[Cache MISS] Fetching ${fileName}...`);
        const response = await fetch(url);

        if (response.ok) {
          cache.put(url, response.clone());
        }

        return response;
      } catch (e) {
        // Fall through to IndexedDB
      }
    }

    // Try IndexedDB fallback
    if (typeof indexedDB !== 'undefined') {
      try {
        const cached = await this.idbGet(url);
        if (cached) {
          console.log(`[IDB HIT] ${fileName}`);
          return new Response(cached);
        }

        console.log(`[IDB MISS] Fetching ${fileName}...`);
        const response = await fetch(url);

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          await this.idbSet(url, buffer);
          return new Response(buffer);
        }

        return response;
      } catch (e) {
        console.error('Cache error:', e);
      }
    }

    // Final fallback: direct fetch
    return fetch(url);
  }
}
