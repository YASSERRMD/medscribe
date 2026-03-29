/**
 * UI Manager Module
 *
 * Manages all UI updates and interactions
 */

export class UIManager {
  constructor() {
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.printBtn = document.getElementById('printBtn');
    this.audioPlayer = document.getElementById('audioPlayer');

    // Widget elements
    this.widgets = {
      transcript: document.getElementById('transcriptWidget'),
      incident: document.getElementById('incidentWidget'),
      prescription: document.getElementById('prescriptionWidget'),
      lab: document.getElementById('labWidget'),
      radiology: document.getElementById('radiologyWidget'),
      treatment: document.getElementById('treatmentWidget'),
      diet: document.getElementById('dietWidget'),
      summary: document.getElementById('summaryWidget'),
    };
  }

  /**
   * Update status bar
   * @param {string} state - 'ready' | 'recording' | 'processing' | 'error'
   * @param {string} message - Status message
   */
  setStatus(state, message) {
    this.statusIndicator.className = `status-indicator ${state}`;
    this.statusText.textContent = message;
  }

  /**
   * Enable/disable control buttons
   * @param {boolean} enabled - Whether controls should be enabled
   */
  enableControls(enabled) {
    this.startBtn.disabled = !enabled;
    this.stopBtn.disabled = true;
  }

  /**
   * Enable stop button during recording
   * @param {boolean} enabled - Whether stop button should be enabled
   */
  enableStopButton(enabled) {
    this.stopBtn.disabled = !enabled;
    this.startBtn.disabled = enabled;
  }

  /**
   * Enable print button after report generation
   * @param {boolean} enabled - Whether print button should be enabled
   */
  enablePrintButton(enabled) {
    if (this.printBtn) {
      this.printBtn.disabled = !enabled;
    }
  }

  /**
   * Show audio player with recorded audio
   * @param {Blob} audioBlob - Audio blob from recording
   */
  showAudioPlayer(audioBlob) {
    if (this.audioPlayer && audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob);
      this.audioPlayer.src = audioUrl;
      this.audioPlayer.style.display = 'block';
    }
  }

  /**
   * Update transcript widget
   * @param {string} htmlContent - HTML content for transcript
   */
  updateTranscript(htmlContent) {
    if (this.widgets.transcript) {
      this.widgets.transcript.innerHTML = htmlContent;
    }
  }

  /**
   * Update all dashboard widgets with medical data
   * @param {Object} medicalData - Structured medical data
   */
  updateDashboard(medicalData) {
    // Update each widget with HTML rendering
    this.setWidgetHTML(this.widgets.incident, medicalData.incident_record || 'No incident record available');
    this.renderPrescription(medicalData.prescription || []);
    this.renderList(this.widgets.lab, medicalData.lab_recommendations || []);
    this.renderList(this.widgets.radiology, medicalData.radiology_recommendations || []);
    this.setWidgetHTML(this.widgets.treatment, medicalData.treatment_plan || 'No treatment plan available');
    this.renderList(this.widgets.diet, medicalData.diet_advice || []);
    this.setWidgetHTML(this.widgets.summary, medicalData.summary || 'No summary available');
  }

  /**
   * Set widget content with HTML
   * @param {HTMLElement} widget - Widget element
   * @param {string} content - Content to display (will be converted to HTML)
   */
  setWidgetHTML(widget, content) {
    if (!content || content.trim() === '') {
      widget.innerHTML = '<div class="placeholder">No information available</div>';
    } else {
      // Convert text to formatted HTML
      const html = this.formatAsHTML(content);
      widget.innerHTML = html;
    }
  }

  /**
   * Format text as HTML with proper formatting
   * @param {string} text - Plain text content
   * @returns {string} Formatted HTML
   */
  formatAsHTML(text) {
    if (!text) return '';

    // Escape HTML first
    let html = this.escapeHtml(text);

    // Convert line breaks to <br> or paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph
    return `<p>${html}</p>`;
  }

  /**
   * Render prescription table
   * @param {Array} prescriptions - Array of prescription objects
   */
  renderPrescription(prescriptions) {
    const widget = this.widgets.prescription;

    if (!prescriptions || prescriptions.length === 0) {
      widget.innerHTML = '<div class="placeholder">No prescriptions prescribed</div>';
      return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Drug</th>
          <th>Dose</th>
          <th>Frequency</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${prescriptions.map(p => `
          <tr>
            <td>${this.escapeHtml(p.drug || '')}</td>
            <td>${this.escapeHtml(p.dose || '')}</td>
            <td>${this.escapeHtml(p.frequency || '')}</td>
            <td>${this.escapeHtml(p.duration || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    `;

    widget.innerHTML = '';
    widget.appendChild(table);
  }

  /**
   * Render bullet list
   * @param {HTMLElement} widget - Widget element
   * @param {Array} items - Array of items
   */
  renderList(widget, items) {
    if (!items || items.length === 0) {
      widget.innerHTML = '<div class="placeholder">None recommended</div>';
      return;
    }

    const ul = document.createElement('ul');
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });

    widget.innerHTML = '';
    widget.appendChild(ul);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    alert(`Error: ${message}`);
  }
}
