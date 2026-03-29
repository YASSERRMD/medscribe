/**
 * Audio Recording Module
 *
 * Records audio from microphone using MediaRecorder API
 * Handles privacy by immediately releasing mic after recording
 */

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
  }

  /**
   * Start recording audio from microphone
   */
  async start() {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder with optimal codec
      const options = this.getRecorderOptions();
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.audioChunks = [];

      // Collect data chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;

      console.log('Audio recording started');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw new Error(`Failed to access microphone: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio blob
   * @returns {Promise<Blob>} Audio blob
   */
  async stop() {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = async () => {
        try {
          // Immediately release microphone for privacy
          await this.stopStream();

          // Create audio blob from chunks
          const audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder.mimeType,
          });

          this.audioChunks = [];
          this.isRecording = false;

          console.log('Audio recording stopped');
          resolve(audioBlob);
        } catch (error) {
          reject(error);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop all media tracks and release microphone
   * Privacy-critical: mic must be released immediately after recording
   */
  async stopStream() {
    if (this.stream) {
      const tracks = this.stream.getTracks();
      for (const track of tracks) {
        track.stop();
      }
      this.stream = null;
    }
  }

  /**
   * Get optimal MediaRecorder options for the browser
   */
  getRecorderOptions() {
    const mimeType = this.getSupportedMimeType();
    return {
      mimeType,
      audioBitsPerSecond: 128000, // 128 kbps
    };
  }

  /**
   * Get supported MIME type for audio recording
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback (browser will use default)
    return '';
  }

  /**
   * Check if microphone access is available
   */
  async checkPermission() {
    try {
      // Check permission status
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      return permissionStatus.state;
    } catch (error) {
      // Permissions API not supported, try to get user media
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await this.stopStream();
        return 'granted';
      } catch (e) {
        return 'denied';
      }
    }
  }
}
