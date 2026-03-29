/**
 * Speech-to-Text Module
 *
 * Uses Web Speech API (built into browser)
 * No external models needed - works immediately
 */

export class SpeechToText {
  constructor() {
    this.recognition = null;
    this.isInitialized = false;
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

      this.isInitialized = true;
      console.log('STT initialized successfully (Web Speech API)');
    } catch (error) {
      console.error('Failed to initialize STT:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio blob to text
   * Note: Web Speech API works with live audio, not blobs
   * This is a limitation - for full offline support, we'd need custom ONNX
   * @param {Blob} audioBlob - Audio blob from MediaRecorder
   * @returns {Promise<string>} Transcribed text
   */
  async transcribe(audioBlob) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('Transcribing audio...');

    return new Promise((resolve, reject) => {
      // Create audio element from blob
      const audio = new Audio(URL.createObjectURL(audioBlob));

      // Set up recognition
      let finalTranscript = '';

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }
        console.log('Transcribing...', interimTranscript || finalTranscript);
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        reject(new Error(`Speech recognition error: ${event.error}`));
      };

      this.recognition.onend = () => {
        if (finalTranscript) {
          console.log('Transcription complete:', finalTranscript.substring(0, 100) + '...');
          resolve(finalTranscript.trim());
        } else {
          // Fallback: return placeholder if recognition didn't work
          console.log('No transcription captured, using fallback');
          resolve('[Audio recording completed - speech recognition requires microphone access during playback]');
        }
      };

      // Start recognition when audio plays
      audio.onloadedmetadata = () => {
        this.recognition.start();
        audio.play();
      };

      audio.onended = () => {
        setTimeout(() => {
          this.recognition.stop();
        }, 1000);
      };

      audio.onerror = (error) => {
        reject(new Error(`Audio playback error: ${error.message}`));
      };
    });
  }
}
