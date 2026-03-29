/**
 * Speech-to-Text Module
 *
 * Transcribes audio using Whisper model via Transformers.js
 * Runs entirely in-browser via WebGPU/WASM
 */

import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js
env.allowLocalModels = false; // Allow remote model loading
env.useBrowserCache = true; // Use browser cache

export class SpeechToText {
  constructor() {
    // Use Xenon/whisper-tiny - a model that actually works with Transformers.js
    this.modelId = 'Xenova/whisper-tiny';
    this.asr = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing STT model (Whisper Tiny)...');

    try {
      // Load ASR pipeline with progress callback
      this.asr = await pipeline('automatic-speech-recognition', this.modelId, {
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`[STT] Downloading: ${progress.file} (${progress.progress.toFixed(1)}%)`);
          } else if (progress.status === 'loading') {
            console.log(`[STT] Loading: ${progress.file}`);
          } else if (progress.status === 'done') {
            console.log(`[STT] Model loaded successfully`);
          }
        },
      });

      this.isInitialized = true;
      console.log('STT model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize STT model:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio blob to text
   * @param {Blob} audioBlob - Audio blob from MediaRecorder
   * @returns {Promise<string>} Transcribed text
   */
  async transcribe(audioBlob) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('Transcribing audio...');

    try {
      // Convert blob to audio URL for the pipeline
      const audioUrl = URL.createObjectURL(audioBlob);

      // Run transcription
      const result = await this.asr(audioUrl, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
        return_timestamps: false,
      });

      // Clean up object URL
      URL.revokeObjectURL(audioUrl);

      const transcript = result?.text || '';

      console.log('Transcription complete:', transcript.substring(0, 100) + '...');
      return transcript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }
}
