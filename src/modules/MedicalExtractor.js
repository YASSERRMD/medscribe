/**
 * Medical Data Extraction Module
 *
 * Uses LFM2.5-1.2B-Instruct to extract structured medical data
 * from consultation transcript
 */

import { pipeline, env } from '@huggingface/transformers';
import { MODEL_CONFIG, ModelCache, MEDICAL_EXTRACTION_PROMPT } from '../config/models.js';

// Disable remote model loading (we handle caching ourselves)
env.allowLocalModels = true;

export class MedicalExtractor {
  constructor() {
    this.config = MODEL_CONFIG.llm;
    this.cache = new ModelCache(MODEL_CONFIG);
    this.generator = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing LLM model...');

    try {
      // Monkey-patch fetch to use our cache
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        const url = args[0];
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
          return this.cache.fetchWithCache(url);
        }
        return originalFetch(...args);
      };

      // Load text generation pipeline
      this.generator = await pipeline('text-generation', this.config.modelId, {
        quantization: this.config.quantization,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`[LLM] Downloading: ${progress.file} (${progress.progress.toFixed(1)}%)`);
          } else if (progress.status === 'loading') {
            console.log(`[LLM] Loading: ${progress.file}`);
          }
        },
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

      this.isInitialized = true;
      console.log('LLM model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize LLM model:', error);
      throw error;
    }
  }

  /**
   * Extract structured medical data from transcript
   * @param {string} transcript - Consultation transcript
   * @returns {Promise<Object>} Structured medical data
   */
  async extract(transcript) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('Extracting medical data...');

    try {
      // Construct prompt
      const prompt = `${MEDICAL_EXTRACTION_PROMPT}\n\nTranscript:\n${transcript}\n\nJSON Output:`;

      // Generate response
      const result = await this.generator(prompt, {
        max_new_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        do_sample: this.config.temperature > 0,
        return_full_text: false,
      });

      const responseText = result[0]?.generated_text || '';

      // Parse JSON response
      const medicalData = this.parseJSONResponse(responseText);

      console.log('Medical data extracted successfully');
      return medicalData;
    } catch (error) {
      console.error('Extraction error:', error);
      throw new Error(`Medical data extraction failed: ${error.message}`);
    }
  }

  /**
   * Parse JSON response from LLM
   * Handles markdown code blocks and malformed JSON
   */
  parseJSONResponse(text) {
    try {
      // Remove markdown code blocks if present
      let cleaned = text.trim();

      // Remove ```json and ``` markers
      cleaned = cleaned.replace(/```json\s*/gi, '');
      cleaned = cleaned.replace(/```\s*/g, '');

      // Try to find JSON object in the text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // Parse JSON
      const parsed = JSON.parse(cleaned);

      // Validate structure
      return {
        incident_record: parsed.incident_record || '',
        prescription: Array.isArray(parsed.prescription) ? parsed.prescription : [],
        lab_recommendations: Array.isArray(parsed.lab_recommendations) ? parsed.lab_recommendations : [],
        radiology_recommendations: Array.isArray(parsed.radiology_recommendations) ? parsed.radiology_recommendations : [],
        treatment_plan: parsed.treatment_plan || '',
        diet_advice: Array.isArray(parsed.diet_advice) ? parsed.diet_advice : [],
        summary: parsed.summary || '',
      };
    } catch (error) {
      console.error('JSON parse error:', error);
      console.error('Raw text:', text);

      // Return empty structure on error
      return {
        incident_record: '',
        prescription: [],
        lab_recommendations: [],
        radiology_recommendations: [],
        treatment_plan: '',
        diet_advice: [],
        summary: '',
      };
    }
  }
}
