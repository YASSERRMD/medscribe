/**
 * Model Configuration for MedScribe
 */

export const MODEL_CONFIG = {
  stt: {
    modelId: 'LiquidAI/LFM2.5-Audio-1.5B-ONNX',
    quantization: 'q4',
    sampleRate: 16000,
    chunkDuration: 30,
    language: 'english',
    enableCache: true,
  },
  llm: {
    modelId: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    quantization: 'q4',
    temperature: 0.1,
    maxTokens: 2048,
    enableCache: true,
  },
  cache: {
    cacheName: 'medscribe-models-v1',
    idbName: 'medscribe-model-cache',
    idbStore: 'models',
  },
};

export const MEDICAL_EXTRACTION_PROMPT = `Extract structured medical data as JSON with: incident_record, prescription array, lab_recommendations array, radiology_recommendations array, treatment_plan, diet_advice array, summary.`;

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

  async fetchWithCache(url) {
    const fileName = url.split('/').pop();
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
        if (response.ok) cache.put(url, response.clone());
        return response;
      } catch (e) {}
    }
    return fetch(url);
  }
}
