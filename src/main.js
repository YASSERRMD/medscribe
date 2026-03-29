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

      // Get selected model from dropdown
      const modelSelect = document.getElementById('modelSelect');
      const selectedModel = modelSelect ? modelSelect.value : 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';

      // Initialize MedicalExtractor with LLM (includes model download)
      this.updateProgress(60, 'Initializing Medical Extractor...');
      await this.extractor.initialize((percent, message) => {
        this.updateProgress(60 + Math.floor(percent * 0.3), message);
      }, selectedModel);

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
      this.liveTranscript = '';
      this.finalTranscript = '';

      // Show recording wave animation
      if (this.recordingWave) {
        this.recordingWave.classList.add('active');
      }

      this.ui.setStatus('recording', '🎤 Recording... Speak now');
      this.ui.enableControls(false);
      this.ui.updateTranscript('<div class="placeholder">🎤 Listening... Start speaking...</div>');

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
      this.ui.setStatus('processing', '⏹️ Stopping recording...');

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

      // Show audio player
      this.ui.showAudioPlayer(this.audioBlob);

      // Update transcript with final version
      this.ui.updateTranscript(`<div class="transcript-live">${this.formatTranscript(this.finalTranscript)}</div>`);

      this.ui.setStatus('processing', '🔍 Extracting medical data...');
      const medicalData = await this.extractor.extract(this.finalTranscript);
      this.currentMedicalData = medicalData;

      // Fill all widgets with HTML content
      this.ui.updateDashboard(medicalData);

      // Save session to history
      await this.history.saveSession({
        transcript: this.finalTranscript,
        medicalData
      });

      this.ui.setStatus('ready', '✅ Report generated successfully');
      this.ui.enableControls(true);
      this.ui.enablePrintButton(true);
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
document.getElementById('toggleManualBtn').addEventListener('click', () => {
  const section = document.getElementById('manualInputSection');
  const recordingControls = document.getElementById('recordingControls');
  const isVisible = section.style.display !== 'none';

  section.style.display = isVisible ? 'none' : 'block';
  recordingControls.style.display = isVisible ? 'flex' : 'none';
});

// Process manual text input
document.getElementById('processTextBtn').addEventListener('click', async () => {
  const text = document.getElementById('manualTextInput').value;

  if (!text.trim()) {
    alert('Please enter a consultation transcript first.');
    return;
  }

  try {
    app.ui.setStatus('processing', '🔍 Extracting medical data from text...');

    // Extract medical data
    const medicalData = await app.extractor.extract(text);
    app.currentMedicalData = medicalData;
    app.finalTranscript = text;

    // Update UI with formatted content
    app.ui.updateTranscript(`<div class="transcript-live">${app.formatTranscript(text)}</div>`);
    app.ui.updateDashboard(medicalData);

    // Save session to history
    await app.history.saveSession({
      transcript: text,
      medicalData
    });

    app.ui.setStatus('ready', '✅ Report generated successfully from text');
    app.ui.enablePrintButton(true);
  } catch (error) {
    console.error('Error processing text:', error);
    app.ui.setStatus('error', `Error: ${error.message}`);
    app.ui.showError(error.message);
  }
});

// Model selection change handler
document.getElementById('modelSelect')?.addEventListener('change', async (e) => {
  const newModel = e.target.value;

  if (app.extractor.isInitialized) {
    const confirmed = confirm(
      'Changing the model will reinitialize the extraction engine. Continue?'
    );

    if (confirmed) {
      app.ui.setStatus('processing', '🔄 Switching model...');
      app.ui.enableControls(false);

      try {
        await app.extractor.dispose();

        await app.extractor.initialize((percent, message) => {
          app.ui.setStatus('processing', `🔄 Loading model: ${Math.floor(percent)}%`);
        }, newModel);

        app.ui.setStatus('ready', `✅ Model switched to ${e.target.options[e.target.selectedIndex].text}`);
      } catch (error) {
        app.ui.setStatus('error', `Failed to switch model: ${error.message}`);
      }

      app.ui.enableControls(true);
    } else {
      e.target.value = app.extractor.currentModel;
    }
  }
});

// Start initialization
app.initialize();
