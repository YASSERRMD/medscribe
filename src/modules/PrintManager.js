/**
 * Print Manager Module
 *
 * Handles printing and exporting consultation reports
 */

export class PrintManager {
  /**
   * Print the current consultation report
   * @param {Object} medicalData - Medical data to print
   * @param {string} transcript - Full transcript
   * @param {Object} doctorInfo - Doctor information (optional)
   */
  static printReport(medicalData, transcript, doctorInfo = {}) {
    const printWindow = window.open('', '_blank');
    const date = new Date().toLocaleDateString();

    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Medical Consultation Report - ${date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    header h1 {
      font-size: 24pt;
      margin-bottom: 10px;
    }
    header .info {
      font-size: 11pt;
      color: #333;
    }
    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 14pt;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .section p, .section li {
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    table th, table td {
      border: 1px solid #000;
      padding: 8px;
      text-align: left;
    }
    table th {
      background: #f0f0f0;
      font-weight: bold;
    }
    ul {
      margin-left: 20px;
    }
    .transcript {
      page-break-before: always;
    }
    .transcript h2 {
      font-size: 14pt;
      margin-bottom: 15px;
    }
    .transcript-content {
      font-size: 10pt;
      line-height: 1.8;
      white-space: pre-wrap;
    }
    @media print {
      body { padding: 0; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Medical Consultation Report</h1>
    <div class="info">
      ${doctorInfo.clinic ? `<p><strong>Clinic:</strong> ${this.escapeHtml(doctorInfo.clinic)}</p>` : ''}
      ${doctorInfo.name ? `<p><strong>Doctor:</strong> ${this.escapeHtml(doctorInfo.name)}</p>` : ''}
      <p><strong>Date:</strong> ${date}</p>
    </div>
  </header>

  ${this.renderSection('Incident Record', medicalData.incident_record)}
  ${this.renderPrescription(medicalData.prescription)}
  ${this.renderListSection('Lab Recommendations', medicalData.lab_recommendations)}
  ${this.renderListSection('Radiology Recommendations', medicalData.radiology_recommendations)}
  ${this.renderSection('Treatment Plan', medicalData.treatment_plan)}
  ${this.renderListSection('Diet Advice', medicalData.diet_advice)}
  ${this.renderSection('Consultation Summary', medicalData.summary)}

  <div class="transcript">
    <h2>Full Transcript</h2>
    <div class="transcript-content">${this.escapeHtml(transcript)}</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() {
        window.close();
      };
    };
  </script>
</body>
</html>
    `);
    printWindow.document.close();
  }

  static renderSection(title, content) {
    if (!content || content.trim() === '') return '';
    return `
      <div class="section">
        <h2>${title}</h2>
        <p>${this.escapeHtml(content)}</p>
      </div>
    `;
  }

  static renderPrescription(prescriptions) {
    if (!prescriptions || prescriptions.length === 0) return '';

    return `
      <div class="section">
        <h2>Prescription</h2>
        <table>
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
        </table>
      </div>
    `;
  }

  static renderListSection(title, items) {
    if (!items || items.length === 0) return '';

    return `
      <div class="section">
        <h2>${title}</h2>
        <ul>
          ${items.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
