/**
 * Speech-to-Text Module
 *
 * Transcribes audio using LFM2.5-Audio-1.5B model
 * Runs entirely in-browser via WebGPU/WASM
 */

import { pipeline, env } from '@huggingface/transformers';
import { MODEL_CONFIG, ModelCache } from '../config/models.js';

// Disable remote model loading (we handle caching ourselves)
env.allowLocalModels = true;

export class SpeechToText {
  constructor() {
    this.config = MODEL_CONFIG.stt;
    this.cache = new ModelCache(MODEL_CONFIG);
    this.asr = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing STT model...');

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

      // Load ASR pipeline
      this.asr = await pipeline('automatic-speech-recognition', this.config.modelId, {
        quantization: this.config.quantization,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            console.log(`[STT] Downloading: ${progress.file} (${progress.progress.toFixed(1)}%)`);
          } else if (progress.status === 'loading') {
            console.log(`[STT] Loading: ${progress.file}`);
          }
        },
      });

      // Restore original fetch
      globalThis.fetch = originalFetch;

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
      // Decode audio to required format
      const audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get audio data as float32 array
      const audioData = audioBuffer.getChannelData(0);

      // For long audio, chunk it to avoid memory issues
      const samplesPerChunk = this.config.sampleRate * this.config.chunkDuration;
      const chunks = [];

      for (let i = 0; i < audioData.length; i += samplesPerChunk) {
        const chunk = audioData.slice(i, i + samplesPerChunk);
        chunks.push(chunk);
      }

      console.log(`Processing ${chunks.length} chunk(s)...`);

      // Transcribe each chunk
      const transcripts = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Transcribing chunk ${i + 1}/${chunks.length}...`);

        // Convert Float32Array to WAV-like format
        const wavData = this.float32ToWav(chunks[i]);

        const result = await this.asr(wavData, {
          chunk_length_s: this.config.chunkDuration,
          stride_length_s: 5,
          language: this.config.language,
          task: 'transcribe',
        });

        transcripts.push(result.text || '');
      }

      // Combine transcripts
      const fullTranscript = transcripts.join(' ').trim();

      console.log('Transcription complete');
      return fullTranscript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Convert Float32Array to WAV format for the model
   */
  float32ToWav(float32Array) {
    // The model expects float32 audio data directly
    // No conversion needed - return as-is
    return float32Array;
  }
}
