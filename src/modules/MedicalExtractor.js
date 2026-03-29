/**
 * Medical Data Extraction Module
 *
 * Uses ONNX LLM for intelligent extraction
 * Outputs detailed medical data in markdown format
 */

import { ONNXLlmEngine } from './ONNXLlmEngine.js';

export class MedicalExtractor {
  constructor() {
    this.isInitialized = false;
    this.llm = null;
    this.useLLM = true; // Set to false to fallback to keyword extraction
  }

  async initialize(onProgress) {
    if (this.isInitialized) return;

    console.log('Initializing Medical Extractor...');

    if (this.useLLM) {
      try {
        // Initialize the LLM engine
        this.llm = new ONNXLlmEngine({
          // Can be swapped to Liquid AI LFM when available:
          // modelId: 'Liquid4All/LFM2.5-1.2B-Instruct'
          modelId: 'Xenova/Qwen2.5-1.5B-Instruct', // Works well now
          maxTokens: 2048,
          temperature: 0.1, // Low temp for consistent structured output
          onProgress: (percent, message) => {
            if (onProgress) onProgress(percent, message);
          }
        });

        await this.llm.initialize();
        console.log('LLM Engine ready for extraction');
      } catch (error) {
        console.warn('LLM initialization failed, falling back to keyword extraction:', error);
        this.useLLM = false;
      }
    }

    this.isInitialized = true;
    console.log('Medical Extractor initialized successfully');
  }

  /**
   * Extract structured medical data from transcript
   * @param {string} transcript - Consultation transcript
   * @returns {Promise<Object>} Structured medical data with markdown content
   */
  async extract(transcript) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('Extracting medical data...');

    try {
      let medicalData;

      if (this.useLLM && this.llm && this.llm.isReady()) {
        // Use LLM for intelligent extraction
        console.log('Using LLM for extraction...');
        medicalData = await this.extractUsingLLM(transcript);
      } else {
        // Fallback to keyword extraction
        console.log('Using keyword extraction fallback...');
        medicalData = this.extractUsingKeywords(transcript);

        // Generate formatted markdown descriptions
        medicalData.incident_record = this.generateIncidentMarkdown(transcript, medicalData);
        medicalData.treatment_plan = this.generateTreatmentMarkdown(transcript, medicalData);
        medicalData.summary = this.generateSummaryMarkdown(transcript, medicalData);
      }

      console.log('Medical data extracted successfully');
      return medicalData;
    } catch (error) {
      console.error('Extraction error:', error);
      throw new Error(`Medical data extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract medical data using LLM
   */
  async extractUsingLLM(transcript) {
    const prompt = this.buildMedicalPrompt(transcript);

    try {
      const response = await this.llm.generate(prompt, {
        maxNewTokens: 2048,
        temperature: 0.1
      });

      // Parse the JSON response
      const medicalData = this.parseLLMResponse(response);

      // Ensure all required fields exist
      return {
        incident_record: medicalData.incident_record || this.generateIncidentMarkdown(transcript, medicalData),
        prescription: medicalData.prescription || [],
        lab_recommendations: medicalData.lab_recommendations || [],
        radiology_recommendations: medicalData.radiology_recommendations || [],
        treatment_plan: medicalData.treatment_plan || this.generateTreatmentMarkdown(transcript, medicalData),
        diet_advice: medicalData.diet_advice || [],
        summary: medicalData.summary || this.generateSummaryMarkdown(transcript, medicalData)
      };
    } catch (error) {
      console.error('LLM extraction failed, falling back to keywords:', error);
      this.useLLM = false;
      return this.extractUsingKeywords(transcript);
    }
  }

  /**
   * Build the medical extraction prompt
   */
  buildMedicalPrompt(transcript) {
    return `<|im_start|>system
You are a medical consultation assistant. Extract structured information from the consultation transcript below.
Respond with valid JSON only. No markdown, no explanations, just the JSON object.

Extract the following fields:
- incident_record: A detailed paragraph describing the patient's chief complaint, history, and symptoms
- prescription: Array of objects with drug, dose, frequency, duration
- lab_recommendations: Array of recommended lab tests
- radiology_recommendations: Array of recommended imaging studies
- treatment_plan: Detailed paragraph describing the treatment approach
- diet_advice: Array of dietary recommendations
- summary: Comprehensive consultation summary paragraph
<|im_end|>
<|im_start|>user
Consultation Transcript:
${transcript}
<|im_end|>
<|im_start|>assistant
`;
  }

  /**
   * Parse LLM response and extract JSON
   */
  parseLLMResponse(response) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // If no JSON found, return empty structure
      console.warn('No JSON found in LLM response, using fallback');
      return {};
    } catch (error) {
      console.error('Failed to parse LLM JSON response:', error);
      return {};
    }
  }

  /**
   * Generate markdown for incident record
   */
  generateIncidentMarkdown(transcript, extractedData) {
    const lines = [];

    // Chief complaint
    const complaint = this.extractChiefComplaint(transcript);
    if (complaint) {
      lines.push(`**Chief Complaint:**`);
      lines.push(complaint);
      lines.push('');
    }

    // History
    const history = this.extractHistory(transcript);
    if (history) {
      lines.push(`**History of Present Illness:**`);
      lines.push(history);
      lines.push('');
    }

    // Symptoms
    const symptoms = this.extractSymptoms(transcript);
    if (symptoms.length > 0) {
      lines.push(`**Symptoms:**`);
      symptoms.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }

    // Duration
    const duration = this.extractDuration(transcript);
    if (duration) {
      lines.push(`**Duration:** ${duration}`);
      lines.push('');
    }

    // If no structured data found, return full transcript
    if (lines.length === 0) {
      return transcript;
    }

    return lines.join('\n');
  }

  /**
   * Generate markdown for treatment plan
   */
  generateTreatmentMarkdown(transcript, extractedData) {
    const lines = [];

    // Primary treatment
    const primary = this.extractPrimaryTreatment(transcript);
    if (primary) {
      lines.push(`**Primary Treatment:**`);
      lines.push(primary);
      lines.push('');
    }

    // Medications
    if (extractedData.prescription && extractedData.prescription.length > 0) {
      lines.push(`**Medications Prescribed:**`);
      extractedData.prescription.forEach(med => {
        lines.push(`- **${med.drug}** (${med.dose})`);
        lines.push(`  - Frequency: ${med.frequency}`);
        lines.push(`  - Duration: ${med.duration}`);
      });
      lines.push('');
    }

    // Follow-up
    const followup = this.extractFollowUp(transcript);
    if (followup) {
      lines.push(`**Follow-up:**`);
      lines.push(followup);
      lines.push('');
    }

    // Lifestyle recommendations
    const lifestyle = this.extractLifestyle(transcript);
    if (lifestyle.length > 0) {
      lines.push(`**Lifestyle Recommendations:**`);
      lifestyle.forEach(rec => lines.push(`- ${rec}`));
    }

    return lines.join('\n') || 'Follow-up as needed based on clinical assessment.';
  }

  /**
   * Generate markdown for summary
   */
  generateSummaryMarkdown(transcript, extractedData) {
    const lines = [];

    lines.push(`**Consultation Summary**`);
    lines.push('');

    // Patient presentation
    const presentation = this.extractPresentation(transcript);
    lines.push(`**Presentation:** ${presentation}`);
    lines.push('');

    // Key findings
    const findings = this.extractFindings(transcript);
    if (findings.length > 0) {
      lines.push(`**Key Findings:**`);
      findings.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }

    // Assessment
    const assessment = this.extractAssessment(transcript);
    lines.push(`**Assessment:** ${assessment}`);
    lines.push('');

    // Plan
    const plan = this.extractPlan(transcript);
    lines.push(`**Plan:** ${plan}`);

    return lines.join('\n');
  }

  /**
   * Extract medical data using enhanced keyword patterns
   */
  extractUsingKeywords(transcript) {
    const text = transcript.toLowerCase();

    return {
      incident_record: transcript, // Will be replaced with markdown
      prescription: this.extractPrescription(text),
      lab_recommendations: this.extractLabs(text),
      radiology_recommendations: this.extractRadiology(text),
      treatment_plan: transcript, // Will be replaced with markdown
      diet_advice: this.extractDietAdvice(text),
      summary: transcript, // Will be replaced with markdown
    };
  }

  extractChiefComplaint(text) {
    const patterns = [
      /complain[s]?\s+(?:of\s+)?(.+?)(?:\n|\.|,)/i,
      /patient\s+presents?\s+with\s+(.+?)(?:\n|\.|,)/i,
      /came\s+for\s+(.+?)(?:\n|\.|,)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return this.capitalize(match[1].trim());
      }
    }

    return null;
  }

  extractHistory(text) {
    const historyIndicators = ['history of', 'has been experiencing', 'reports', 'states', 'mentioned'];
    const sentences = text.split(/[.!?]+/);

    const historySentences = sentences.filter(s =>
      historyIndicators.some(ind => s.toLowerCase().includes(ind))
    );

    if (historySentences.length > 0) {
      return historySentences.join('. ').trim();
    }

    return null;
  }

  extractSymptoms(text) {
    const symptomKeywords = [
      'pain', 'fever', 'cough', 'headache', 'nausea', 'vomiting',
      'fatigue', 'weakness', 'dizziness', 'shortness of breath',
      'chest pain', 'abdominal pain', 'rash', 'swelling',
      'constipation', 'diarrhea', 'sore throat', 'congestion'
    ];

    const symptoms = [];
    symptomKeywords.forEach(symptom => {
      if (text.toLowerCase().includes(symptom)) {
        const context = this.getSymptomContext(text, symptom);
        symptoms.push(context);
      }
    });

    return [...new Set(symptoms)]; // Remove duplicates
  }

  getSymptomContext(text, symptom) {
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(symptom)) {
        return sentence.trim();
      }
    }
    return this.capitalize(symptom);
  }

  extractDuration(text) {
    const patterns = [
      /(\d+\s+(?:days?|weeks?|months?|years?))/i,
      /since\s+(.+?)(?:\n|\.|,)/i,
      /for\s+(?:the\s+past\s+)?(\d+\s+(?:days?|weeks?|months?))/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  extractPrescription(text) {
    const medications = [];
    const medicationPatterns = [
      { name: 'paracetamol', dose: ['500mg', '650mg', '1g'], freq: ['TID', 'QID', 'PRN'] },
      { name: 'ibuprofen', dose: ['400mg', '600mg', '800mg'], freq: ['TID', 'PRN'] },
      { name: 'amoxicillin', dose: ['250mg', '500mg'], freq: ['TID', 'Q8H'] },
      { name: 'azithromycin', dose: ['250mg', '500mg'], freq: ['Daily', 'QD'] },
      { name: 'metformin', dose: ['500mg', '850mg', '1000mg'], freq: ['BID', 'TID'] },
      { name: 'lisinopril', dose: ['5mg', '10mg', '20mg'], freq: ['Daily', 'QD'] },
      { name: 'atorvastatin', dose: ['10mg', '20mg', '40mg'], freq: ['Daily', 'QHS'] },
      { name: 'omeprazole', dose: ['20mg', '40mg'], freq: ['Daily', 'BID', 'PRN'] },
    ];

    medicationPatterns.forEach(med => {
      if (text.includes(med.name)) {
        medications.push({
          drug: this.capitalize(med.name),
          dose: med.dose[0] || 'As prescribed',
          frequency: med.freq[0] || 'As directed',
          duration: this.extractDuration(text) || 'As prescribed'
        });
      }
    });

    // Check for generic mentions
    const genericMentions = ['antibiotic', 'painkiller', 'analgesic'];
    genericMentions.forEach(mention => {
      if (text.includes(mention)) {
        medications.push({
          drug: this.capitalize(mention),
          dose: 'As prescribed',
          frequency: 'As directed',
          duration: 'As prescribed'
        });
      }
    });

    return medications;
  }

  extractLabs(text) {
    const labs = [];
    const labTests = [
      { name: 'Complete Blood Count (CBC)', keywords: ['cbc', 'complete blood count', 'blood count', 'hemoglobin'] },
      { name: 'Fasting Blood Sugar', keywords: ['fasting blood sugar', 'fbs', 'fasting glucose', 'hba1c'] },
      { name: 'Lipid Profile', keywords: ['lipid profile', 'cholesterol', 'triglycerides', 'ldl', 'hdl'] },
      { name: 'Thyroid Function Test', keywords: ['thyroid', 'tsh', 't3', 't4'] },
      { name: 'Liver Function Test', keywords: ['liver function', 'lft', 'sgot', 'sgpt', 'alt', 'ast'] },
      { name: 'Kidney Function Test', keywords: ['kidney function', 'kft', 'creatinine', 'urea', 'bun'] },
      { name: 'Urinalysis', keywords: ['urine', 'urinalysis', 'routine urine'] },
      { name: 'Chest X-ray', keywords: ['chest xray', 'chest x-ray', 'cxr'] },
    ];

    labTests.forEach(lab => {
      if (lab.keywords.some(kw => text.includes(kw))) {
        labs.push(lab.name);
      }
    });

    return labs.length > 0 ? [...new Set(labs)] : ['Complete Blood Count', 'Fasting Blood Sugar'];
  }

  extractRadiology(text) {
    const radiology = [];
    const imaging = [
      { name: 'Chest X-ray', keywords: ['chest xray', 'chest x-ray', 'cxr', 'chest film'] },
      { name: 'CT Scan', keywords: ['ct scan', 'computed tomography'] },
      { name: 'MRI', keywords: ['mri', 'magnetic resonance'] },
      { name: 'Ultrasound', keywords: ['ultrasound', 'sonography', 'usg'] },
      { name: 'ECG/EKG', keywords: ['ecg', 'ekg', 'electrocardiogram'] },
      { name: 'Echocardiogram', keywords: ['echo', 'echocardiogram', '2d echo'] },
      { name: 'X-ray', keywords: ['x-ray', 'xray'] },
    ];

    imaging.forEach(img => {
      if (img.keywords.some(kw => text.includes(kw))) {
        radiology.push(img.name);
      }
    });

    return [...new Set(radiology)];
  }

  extractDietAdvice(text) {
    const advice = [];

    if (text.includes('diabetes') || text.includes('sugar') || text.includes('diabetic')) {
      advice.push('Avoid sugary foods and drinks');
      advice.push('Monitor carbohydrate intake');
      advice.push('Eat regular, balanced meals');
    }

    if (text.includes('blood pressure') || text.includes('hypertension') || text.includes('bp')) {
      advice.push('Reduce salt intake');
      advice.push('Avoid processed and canned foods');
      advice.push('Increase potassium-rich foods');
    }

    if (text.includes('weight') || text.includes('obese') || text.includes('overweight')) {
      advice.push('Follow a calorie-controlled diet');
      advice.push('Increase physical activity');
      advice.push('Limit high-fat foods');
    }

    if (text.includes('constipation') || text.includes('digestive')) {
      advice.push('Increase fiber intake');
      advice.push('Drink plenty of water');
      advice.push('Include fruits and vegetables');
    }

    if (text.includes('acidity') || text.includes('gerd') || text.includes('reflux')) {
      advice.push('Avoid spicy and oily foods');
      advice.push('Eat smaller, frequent meals');
      advice.push('Don\'t lie down immediately after eating');
    }

    return advice.length > 0 ? [...new Set(advice)] : ['Maintain balanced diet', 'Stay hydrated', 'Regular exercise'];
  }

  extractPrimaryTreatment(text) {
    const treatmentKeywords = [
      'prescribed', 'advised', 'recommended', 'started on',
      'give', 'take', 'administer', 'treatment'
    ];

    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (treatmentKeywords.some(kw => sentence.toLowerCase().includes(kw))) {
        return sentence.trim();
      }
    }

    return 'Symptomatic treatment and observation';
  }

  extractFollowUp(text) {
    const patterns = [
      /follow[- ]?up\s+(?:after\s+)?(\d+\s+(?:days?|weeks?))/i,
      /review\s+(?:after\s+)?(\d+\s+(?:days?|weeks?))/i,
      /come\s+back\s+(?:if|when)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return 'Follow up after 1 week or earlier if symptoms worsen';
  }

  extractLifestyle(text) {
    const recommendations = [];

    if (text.includes('rest')) recommendations.push('Take adequate rest');
    if (text.includes('exercise') || text.includes('activity')) recommendations.push('Regular exercise as tolerated');
    if (text.includes('stress')) recommendations.push('Stress management');
    if (text.includes('sleep')) recommendations.push('Maintain regular sleep schedule');

    return recommendations;
  }

  extractPresentation(text) {
    const firstSentence = text.split(/[.!?]+/)[0];
    return firstSentence ? firstSentence.trim() : 'Patient presented for consultation';
  }

  extractFindings(text) {
    const findings = [];
    const sentences = text.split(/[.!?]+/);

    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();
      // Look for examination findings
      if (lower.includes('examination') || lower.includes('revealed') ||
          lower.includes('showed') || lower.includes('normal')) {
        findings.push(sentence.trim());
      }
    });

    return findings.slice(0, 5); // Limit to top 5 findings
  }

  extractAssessment(text) {
    const assessmentKeywords = ['diagnosis', 'assessment', 'impression', 'conclusion'];
    const sentences = text.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (assessmentKeywords.some(kw => sentence.toLowerCase().includes(kw))) {
        return sentence.trim();
      }
    }

    return 'Clinical assessment based on history and examination';
  }

  extractPlan(text) {
    return this.extractPrimaryTreatment(text);
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
