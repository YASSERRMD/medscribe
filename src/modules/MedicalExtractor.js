/**
 * Medical Data Extraction Module
 *
 * Uses GPT-2 for structured medical data extraction
 * Runs entirely in-browser via Transformers.js
 */

import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export class MedicalExtractor {
  constructor() {
    // Use a model that actually works with Transformers.js
    this.modelId = 'Xenova/distilgpt2';
    this.generator = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing Medical Extraction LLM...');

    try {
      // Load text generation pipeline
      this.generator = await pipeline('text-generation', this.modelId, {
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`[LLM] Downloading: ${progress.file} (${progress.progress.toFixed(1)}%)`);
          } else if (progress.status === 'loading') {
            console.log(`[LLM] Loading: ${progress.file}`);
          } else if (progress.status === 'done') {
            console.log(`[LLM] Model loaded successfully`);
          }
        },
      });

      this.isInitialized = true;
      console.log('Medical Extraction LLM initialized successfully');
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      // Fall back to keyword extraction if LLM fails
      console.log('Falling back to keyword-based extraction');
      this.isInitialized = true;
      this.generator = null; // Will trigger keyword extraction
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
      // If LLM is available, use it
      if (this.generator) {
        return await this.extractWithLLM(transcript);
      }
      // Otherwise use keyword extraction
      return this.extractUsingKeywords(transcript);
    } catch (error) {
      console.error('LLM extraction failed, using keywords:', error);
      return this.extractUsingKeywords(transcript);
    }
  }

  /**
   * Extract using LLM
   */
  async extractWithLLM(transcript) {
    const prompt = `Medical consultation: ${transcript.substring(0, 500)}\n\nSummary:`;

    try {
      const result = await this.generator(prompt, {
        max_new_tokens: 150,
        temperature: 0.7,
        do_sample: true,
        return_full_text: false,
      });

      const summary = result[0]?.generated_text || transcript;

      return {
        incident_record: transcript,
        prescription: this.extractPrescription(transcript),
        lab_recommendations: this.extractLabs(transcript),
        radiology_recommendations: this.extractRadiology(transcript),
        treatment_plan: summary.substring(0, 200),
        diet_advice: this.extractDietAdvice(transcript),
        summary: summary,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extract medical data using keyword patterns
   */
  extractUsingKeywords(transcript) {
    const text = transcript.toLowerCase();

    return {
      incident_record: transcript,
      prescription: this.extractPrescription(text),
      lab_recommendations: this.extractLabs(text),
      radiology_recommendations: this.extractRadiology(text),
      treatment_plan: 'Follow-up recommended based on consultation.',
      diet_advice: this.extractDietAdvice(text),
      summary: transcript.length > 200
        ? transcript.substring(0, 300) + '...'
        : transcript,
    };
  }

  extractPrescription(text) {
    const medications = [];
    const medicationKeywords = [
      'paracetamol', 'ibuprofen', 'amoxicillin', 'azithromycin',
      'metformin', 'lisinopril', 'atorvastatin', 'omeprazole',
      'antibiotic', 'painkiller', 'tablet', 'capsule', 'syrup'
    ];

    medicationKeywords.forEach(med => {
      if (text.includes(med)) {
        medications.push({
          drug: med.charAt(0).toUpperCase() + med.slice(1),
          dose: 'As prescribed',
          frequency: 'As directed',
          duration: 'As prescribed'
        });
      }
    });

    return medications;
  }

  extractLabs(text) {
    const labs = [];
    const labKeywords = [
      'blood test', 'cbc', 'complete blood count', 'blood sugar',
      'fasting', 'hba1c', 'lipid profile', 'thyroid',
      'liver', 'kidney', 'urine', 'culture'
    ];

    labKeywords.forEach(lab => {
      if (text.includes(lab)) {
        labs.push(lab.charAt(0).toUpperCase() + lab.slice(1));
      }
    });

    return labs.length > 0 ? labs : ['Complete Blood Count'];
  }

  extractRadiology(text) {
    const radiology = [];
    const radioKeywords = [
      'x-ray', 'chest x-ray', 'ct scan', 'mri', 'ultrasound',
      'ecg', 'echo', 'xray', 'angiography'
    ];

    radioKeywords.forEach(radio => {
      if (text.includes(radio)) {
        radiology.push(radio.charAt(0).toUpperCase() + radio.slice(1));
      }
    });

    return radiology;
  }

  extractDietAdvice(text) {
    const advice = [];

    if (text.includes('diabetes') || text.includes('sugar')) {
      advice.push('Avoid sugary foods and drinks');
      advice.push('Monitor carbohydrate intake');
    }

    if (text.includes('blood pressure') || text.includes('hypertension')) {
      advice.push('Reduce salt intake');
      advice.push('Avoid processed foods');
    }

    return advice.length > 0 ? advice : ['Maintain balanced diet'];
  }
}
