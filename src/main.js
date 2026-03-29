/**
 * MedScribe - Privacy-First AI Medical Consultation
 *
 * Main entry point - orchestrates all modules
 */

import { AudioRecorder } from './modules/AudioRecorder.js';
import { SpeechToText } from './modules/SpeechToText.js';
import { MedicalExtractor } from './modules/MedicalExtractor.js';
import { UIManager } from './modules/UIManager.js';
import { SessionHistory } from './modules/SessionHistory.js';
import { PrintManager } from './modules/PrintManager.js';

class MedScribe {
  constructor() {
    this.ui = new UIManager();
    this.recorder = new AudioRecorder();
    this.stt = null;
    this.extractor = null;
    this.history = new SessionHistory();

    this.isRecording = false;
    this.audioBlob = null;
    this.currentTranscript = '';
    this.currentMedicalData = null;

    // Loading screen elements
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
  }

  updateProgress(percent, message) {
    if (this.progressFill) {
      this.progressFill.style.width = `${percent}%`;
    }
    if (this.progressText) {
      this.progressText.textContent = message;
    }
  }

  hideLoadingScreen() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('hidden');
    }
  }

  async initialize() {
    this.updateProgress(10, 'Starting...');

    try {
      // Initialize models sequentially with progress updates
      this.updateProgress(20, 'Initializing Speech-to-Text model...');
      this.stt = new SpeechToText();

      // Track STT loading progress
      const originalLog = console.log;
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('[STT]')) {
          if (message.includes('Downloading')) {
            const match = message.match(/([\d.]+)%/);
            if (match) {
              const progress = 20 + (parseInt(match[1]) * 0.3);
              this.updateProgress(progress, message);
            }
          } else if (message.includes('loaded successfully')) {
            this.updateProgress(50, 'STT model loaded');
          }
        }
        originalLog.apply(console, args);
      };

      await this.stt.initialize();

      console.log = originalLog;
      this.updateProgress(60, 'Initializing Medical Extractor...');

      this.extractor = new MedicalExtractor();
      await this.extractor.initialize();

      this.updateProgress(80, 'Loading session history...');
      await this.history.initialize();

      this.updateProgress(100, 'Ready!');
      setTimeout(() => this.hideLoadingScreen(), 500);

      this.ui.setStatus('ready', 'Ready - Models loaded successfully');
      this.ui.enableControls(true);
    } catch (error) {
      console.error('Initialization error:', error);
      this.updateProgress(0, `Error: ${error.message}`);
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
      this.currentTranscript = transcript;
      this.ui.updateTranscript(transcript);

      this.ui.setStatus('processing', 'Extracting medical data...');
      const medicalData = await this.extractor.extract(transcript);
      this.currentMedicalData = medicalData;
      this.ui.updateDashboard(medicalData);

      // Save session to history
      await this.history.saveSession({
        transcript,
        medicalData
      });

      this.ui.setStatus('ready', 'Report generated successfully');
      this.ui.enableControls(true);
      this.ui.enablePrintButton(true);
    } catch (error) {
      console.error('Error processing consultation:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
      this.ui.enableControls(true);
    }
  }

  printReport() {
    if (!this.currentMedicalData) {
      alert('No report to print. Please complete a consultation first.');
      return;
    }

    PrintManager.printReport(
      this.currentMedicalData,
      this.currentTranscript,
      {} // Doctor info can be added later
    );
  }
}

// Initialize app when DOM is ready
const app = new MedScribe();

// Wire up event listeners
document.getElementById('startBtn').addEventListener('click', () => app.startConsultation());
document.getElementById('stopBtn').addEventListener('click', () => app.endConsultation());
document.getElementById('printBtn')?.addEventListener('click', () => app.printReport());

// Start initialization
app.initialize();
