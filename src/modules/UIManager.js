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
   * Update transcript widget
   * @param {string} transcript - Consultation transcript
   */
  updateTranscript(transcript) {
    this.setWidgetContent(this.widgets.transcript, transcript);
  }

  /**
   * Update all dashboard widgets with medical data
   * @param {Object} medicalData - Structured medical data
   */
  updateDashboard(medicalData) {
    // Update each widget
    this.setWidgetContent(this.widgets.incident, medicalData.incident_record);
    this.renderPrescription(medicalData.prescription);
    this.renderList(this.widgets.lab, medicalData.lab_recommendations);
    this.renderList(this.widgets.radiology, medicalData.radiology_recommendations);
    this.setWidgetContent(this.widgets.treatment, medicalData.treatment_plan);
    this.renderList(this.widgets.diet, medicalData.diet_advice);
    this.setWidgetContent(this.widgets.summary, medicalData.summary);
  }

  /**
   * Set widget content
   * @param {HTMLElement} widget - Widget element
   * @param {string} content - Content to display
   */
  setWidgetContent(widget, content) {
    if (!content || content.trim() === '') {
      widget.innerHTML = '<div class="placeholder">No information available</div>';
    } else {
      widget.textContent = content;
    }
  }

  /**
   * Render prescription table
   * @param {Array} prescriptions - Array of prescription objects
   */
  renderPrescription(prescriptions) {
    const widget = this.widgets.prescription;

    if (!prescriptions || prescriptions.length === 0) {
      widget.innerHTML = '<div class="placeholder">No prescriptions</div>';
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
      widget.innerHTML = '<div class="placeholder">None</div>';
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
