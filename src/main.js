/**
 * MedScribe - Privacy-First AI Medical Consultation
 *
 * Main entry point - orchestrates all modules
 */

import { AudioRecorder } from './modules/AudioRecorder.js';
import { SpeechToText } from './modules/SpeechToText.js';
import { MedicalExtractor } from './modules/MedicalExtractor.js';
import { UIManager } from './modules/UIManager.js';

class MedScribe {
  constructor() {
    this.ui = new UIManager();
    this.recorder = new AudioRecorder();
    this.stt = null;
    this.extractor = null;

    this.isRecording = false;
    this.audioBlob = null;
  }

  async initialize() {
    this.ui.setStatus('ready', 'Loading AI models... (this may take a minute on first load)');

    try {
      // Initialize models in parallel
      this.stt = new SpeechToText();
      this.extractor = new MedicalExtractor();

      await Promise.all([
        this.stt.initialize(),
        this.extractor.initialize()
      ]);

      this.ui.setStatus('ready', 'Ready - Models loaded successfully');
      this.ui.enableControls(true);
    } catch (error) {
      console.error('Initialization error:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
    }
  }

  async startConsultation() {
    try {
      this.isRecording = true;
      this.ui.setStatus('recording', 'Recording consultation...');
      this.ui.enableControls(false);

      await this.recorder.start();
      this.ui.enableStopButton(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
      this.isRecording = false;
      this.ui.enableControls(true);
    }
  }

  async endConsultation() {
    try {
      this.ui.setStatus('processing', 'Stopping recording...');
      this.audioBlob = await this.recorder.stop();
      this.isRecording = false;

      this.ui.setStatus('processing', 'Transcribing audio...');
      const transcript = await this.stt.transcribe(this.audioBlob);
      this.ui.updateTranscript(transcript);

      this.ui.setStatus('processing', 'Extracting medical data...');
      const medicalData = await this.extractor.extract(transcript);
      this.ui.updateDashboard(medicalData);

      this.ui.setStatus('ready', 'Report generated successfully');
      this.ui.enableControls(true);
    } catch (error) {
      console.error('Error processing consultation:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
      this.ui.enableControls(true);
    }
  }
}

// Initialize app
const app = new MedScribe();

// Wire up event listeners
document.getElementById('startBtn').addEventListener('click', () => app.startConsultation());
document.getElementById('stopBtn').addEventListener('click', () => app.endConsultation());

// Start initialization
app.initialize();
