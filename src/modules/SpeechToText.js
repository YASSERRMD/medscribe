/**
 * Speech-to-Text Module with Live Transcription
 *
 * Uses Web Speech API for real-time transcription
 */

export class SpeechToText {
  constructor() {
    this.recognition = null;
    this.isInitialized = false;
    this.isTranscribing = false;
    this.onTranscriptCallback = null;
    this.finalTranscript = '';
    this.interimTranscript = '';
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing STT (Web Speech API)...');

    try {
      // Check for browser support
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.isInitialized = true;
      console.log('STT initialized successfully (Web Speech API)');
    } catch (error) {
      console.error('Failed to initialize STT:', error);
      throw error;
    }
  }

  /**
   * Start live transcription with callback
   * @param {Function} onTranscript - Callback function(transcript)
   */
  async startLiveTranscription(onTranscript) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.onTranscriptCallback = onTranscript;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.isTranscribing = true;

    console.log('Starting live transcription...');

    return new Promise((resolve, reject) => {
      this.recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript + ' ';
            this.finalTranscript += transcript + ' ';
          } else {
            interim += transcript;
            this.interimTranscript = interim;
          }
        }

        // Combine final and interim for live display
        const combined = this.finalTranscript + interim;
        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(combined);
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);

        if (event.error === 'not-allowed') {
          reject(new Error('Microphone permission denied. Please allow microphone access.'));
        } else if (event.error === 'no-speech') {
          // No speech detected, but don't fail
          console.log('No speech detected yet...');
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        if (this.isTranscribing) {
          // Auto-restart if we're still supposed to be transcribing
          try {
            this.recognition.start();
          } catch (e) {
            console.log('Recognition stopped');
          }
        }
      };

      this.recognition.onstart = () => {
        console.log('Recognition started');
        resolve();
      };

      try {
        this.recognition.start();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop live transcription
   */
  async stopLiveTranscription() {
    this.isTranscribing = false;

    return new Promise((resolve) => {
      this.recognition.onend = () => {
        console.log('Recognition stopped');
        resolve();
      };

      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped
        resolve();
      }
    });
  }

  /**
   * Get final transcript
   * @returns {string} Final transcript
   */
  async getFinalTranscript() {
    return this.finalTranscript.trim();
  }

  /**
   * Legacy method for compatibility - transcribe audio blob
   * NOTE: Web Speech API doesn't support blob transcription
   */
  async transcribe(audioBlob) {
    // This method is kept for compatibility but returns the live transcript
    return this.finalTranscript.trim() || 'No transcript available';
  }
}
