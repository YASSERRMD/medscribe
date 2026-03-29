/**
 * MedScribe - Privacy-First AI Medical Consultation
 *
 * Main entry point - live transcription & extraction
 */

import { AudioRecorder } from './modules/AudioRecorder.js';
import { SpeechToText } from './modules/SpeechToText.js';
import { MedicalExtractor } from './modules/MedicalExtractor.js';
import { UIManager } from './modules/UIManager.js';
import { SessionHistory } from './modules/SessionHistory.js';
import { PrintManager } from './modules/PrintManager.js';

const DEFAULT_EXTRACTION_MODEL = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';

class MedScribe {
  constructor() {
    this.ui = new UIManager();
    this.recorder = new AudioRecorder();
    this.stt = new SpeechToText();
    this.extractor = new MedicalExtractor();
    this.history = new SessionHistory();

    this.isRecording = false;
    this.audioBlob = null;
    this.liveTranscript = '';
    this.finalTranscript = '';
    this.currentMedicalData = null;

    // UI elements
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.recordingWave = document.getElementById('recordingWave');
    this.manualInputSection = document.getElementById('manualInputSection');
    this.manualTextInput = document.getElementById('manualTextInput');
    this.toggleManualBtn = document.getElementById('toggleManualBtn');
    this.clearManualTextBtn = document.getElementById('clearManualTextBtn');
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
    this.updateProgress(30, 'Initializing Speech Recognition...');

    try {
      // Initialize STT (Web Speech API - instant)
      await this.stt.initialize();

      // Initialize MedicalExtractor with LLM (includes model download)
      this.updateProgress(60, 'Initializing Medical Extractor...');
      await this.extractor.initialize((percent, message) => {
        this.updateProgress(60 + Math.floor(percent * 0.3), message);
      }, DEFAULT_EXTRACTION_MODEL);

      // Initialize session history
      this.updateProgress(90, 'Loading session history...');
      await this.history.initialize();

      this.updateProgress(100, 'Ready!');
      setTimeout(() => this.hideLoadingScreen(), 500);

      this.ui.setStatus('ready', 'Ready to start consultation');
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
      this.audioBlob = null;
      this.liveTranscript = '';
      this.finalTranscript = '';
      this.setManualInputVisible(false);
      this.ui.hideAudioPlayer();

      // Show recording wave animation
      if (this.recordingWave) {
        this.recordingWave.classList.add('active');
      }

      this.ui.setStatus('recording', 'Recording in progress');
      this.ui.enableControls(false);
      this.ui.updateTranscript('<div class="placeholder">Listening. Start speaking to capture the consultation transcript.</div>');

      // Start recording
      await this.recorder.start();

      // Start live transcription
      await this.stt.startLiveTranscription((transcript) => {
        this.liveTranscript = transcript;
        this.ui.updateTranscript(`<div class="transcript-live">${this.formatTranscript(transcript)}</div>`);
      });

      this.ui.enableStopButton(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
      this.isRecording = false;
      if (this.recordingWave) {
        this.recordingWave.classList.remove('active');
      }
      this.ui.enableControls(true);
    }
  }

  async endConsultation() {
    try {
      this.ui.setStatus('processing', 'Finalizing the session...');

      // Stop live transcription
      await this.stt.stopLiveTranscription();

      // Stop recording and get audio blob
      this.audioBlob = await this.recorder.stop();
      this.isRecording = false;

      // Hide recording wave animation
      if (this.recordingWave) {
        this.recordingWave.classList.remove('active');
      }

      // Get final transcript
      this.finalTranscript = await this.stt.getFinalTranscript();
      this.updateManualText(this.finalTranscript, { overwrite: true });

      await this.generateReportFromTranscript(this.finalTranscript, {
        showAudioPlayer: true,
        successMessage: 'Report generated successfully'
      });
    } catch (error) {
      console.error('Error processing consultation:', error);
      this.ui.setStatus('error', `Error: ${error.message}`);
      if (this.recordingWave) {
        this.recordingWave.classList.remove('active');
      }
      this.ui.enableControls(true);
    }
  }

  formatTranscript(text) {
    // Convert markdown-like formatting to HTML
    if (!text) return '<div class="placeholder">No transcript available</div>';

    // Escape HTML
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers: ## or ###
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
  }

  setManualInputVisible(visible) {
    if (this.manualInputSection) {
      this.manualInputSection.classList.toggle('active', visible);
    }

    if (this.toggleManualBtn) {
      this.toggleManualBtn.textContent = visible
        ? 'Hide Manual Entry'
        : 'Manual Entry';
    }

    if (visible) {
      this.updateManualText(this.finalTranscript || this.liveTranscript);
      this.manualTextInput?.focus();
    }
  }

  updateManualText(text, { overwrite = false } = {}) {
    if (!this.manualTextInput) return;
    if (overwrite || !this.manualTextInput.value.trim()) {
      this.manualTextInput.value = text || '';
    }
  }

  async generateReportFromTranscript(transcript, options = {}) {
    const {
      showAudioPlayer = false,
      successMessage = 'Report generated successfully'
    } = options;
    const normalizedTranscript = transcript.trim();

    this.ui.setStatus('processing', 'Extracting medical data...');
    this.finalTranscript = normalizedTranscript;
    this.liveTranscript = normalizedTranscript;

    if (showAudioPlayer && this.audioBlob) {
      this.ui.showAudioPlayer(this.audioBlob);
    } else {
      this.audioBlob = null;
      this.ui.hideAudioPlayer();
    }

    const medicalData = await this.extractor.extract(normalizedTranscript);
    this.currentMedicalData = medicalData;

    this.ui.updateTranscript(`<div class="transcript-live">${this.formatTranscript(normalizedTranscript)}</div>`);
    this.ui.updateDashboard(medicalData);
    await this.history.saveSession({
      transcript: normalizedTranscript,
      medicalData
    });

    this.ui.setStatus('ready', successMessage);
    this.ui.enableControls(true);
    this.ui.enablePrintButton(true);
  }

  printReport() {
    if (!this.currentMedicalData) {
      alert('No report to print. Please complete a consultation first.');
      return;
    }

    PrintManager.printReport(
      this.currentMedicalData,
      this.finalTranscript,
      {} // Doctor info can be added later
    );
  }
}

// Initialize app
const app = new MedScribe();

// Wire up event listeners
document.getElementById('startBtn').addEventListener('click', () => app.startConsultation());
document.getElementById('stopBtn').addEventListener('click', () => app.endConsultation());
document.getElementById('printBtn')?.addEventListener('click', () => app.printReport());

// Manual text input toggle
document.getElementById('toggleManualBtn')?.addEventListener('click', () => {
  const isVisible = app.manualInputSection?.classList.contains('active');
  app.setManualInputVisible(!isVisible);
});

// Process manual text input
document.getElementById('processTextBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('manualTextInput')?.value || '';

  if (!text.trim()) {
    alert('Please enter a consultation transcript first.');
    return;
  }

  try {
    await app.generateReportFromTranscript(text, {
      successMessage: 'Report generated successfully from manual text'
    });
  } catch (error) {
    console.error('Error processing text:', error);
    app.ui.setStatus('error', `Error: ${error.message}`);
    app.ui.showError(error.message);
  }
});

document.getElementById('clearManualTextBtn')?.addEventListener('click', () => {
  if (app.manualTextInput) {
    app.manualTextInput.value = '';
    app.manualTextInput.focus();
  }
});

// Start initialization
app.initialize();
