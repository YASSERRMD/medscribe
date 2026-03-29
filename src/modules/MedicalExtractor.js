/**
 * Medical Data Extraction Module
 *
 * Uses ONNX LLM for intelligent extraction
 * Outputs detailed medical data in markdown format
 */

import { ONNXLlmEngine } from './ONNXLlmEngine.js';
import { getExtractionModelConfig } from '../config/models.js';

export class MedicalExtractor {
  constructor() {
    this.isInitialized = false;
    this.llm = null;
    this.useLLM = true;
    this.currentModel = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';
    this.maxDirectTranscriptChars = 6000;
    this.maxChunkChars = 3200;
  }

  async initialize(onProgress, modelId = null) {
    if (modelId && modelId !== this.currentModel) {
      this.currentModel = modelId;
      this.isInitialized = false;
    }

    if (this.isInitialized) return;

    console.log('Initializing Medical Extractor...');
    this.useLLM = this.currentModel !== 'keyword';

    if (!this.useLLM) {
      this.llm = null;
      this.isInitialized = true;
      console.log('Using keyword extraction mode');
      return;
    }

    const runtimeConfig = getExtractionModelConfig(this.currentModel);
    const browserHasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu;

    if (runtimeConfig?.requiresWebGPU && !browserHasWebGPU) {
      console.warn(`WebGPU is required for ${this.currentModel}. Falling back to keyword extraction.`);
      this.useLLM = false;
      this.llm = null;
      if (onProgress) {
        onProgress(100, 'WebGPU unavailable. Using keyword extraction.');
      }
      this.isInitialized = true;
      return;
    }

    try {
      this.llm = new ONNXLlmEngine({
        ...runtimeConfig,
        maxTokens: 2048,
        temperature: 0.1,
        onProgress: (percent, message) => {
          if (onProgress) onProgress(percent, message);
        }
      });

      await this.llm.initialize();
      console.log(`LLM Engine ready with model: ${runtimeConfig?.modelId || this.currentModel}`);
    } catch (error) {
      console.warn('LLM initialization failed, falling back to keyword extraction:', error);
      this.useLLM = false;
      this.llm = null;
      if (onProgress) {
        onProgress(100, 'Model unavailable. Using keyword extraction.');
      }
    }

    this.isInitialized = true;
    console.log('Medical Extractor initialized successfully');
  }

  async dispose() {
    if (this.llm) {
      await this.llm.dispose();
      this.llm = null;
    }
    this.isInitialized = false;
    console.log('Medical Extractor disposed');
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
        medicalData = this.extractExplicitFallback(transcript);
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
    if (this.shouldBatchTranscript(transcript)) {
      return this.extractUsingBatchedLLM(transcript);
    }

    const prompt = this.buildMedicalPrompt(transcript);

    try {
      return await this.generateStructuredMedicalData(prompt, transcript);
    } catch (error) {
      console.error('LLM extraction failed, falling back to keywords:', error);
      this.useLLM = false;
      return this.extractExplicitFallback(transcript);
    }
  }

  async extractUsingBatchedLLM(transcript) {
    console.log('Transcript exceeds direct context budget. Processing in batches...');

    const chunks = this.chunkTranscript(transcript);
    const partialResults = [];

    for (const [index, chunk] of chunks.entries()) {
      try {
        const prompt = this.buildMedicalPrompt(
          chunk,
          `This is segment ${index + 1} of ${chunks.length} from a longer consultation. Extract only the facts explicitly present in this segment.`
        );

        const partial = await this.generateStructuredMedicalData(prompt, chunk, {
          maxNewTokens: 1400,
          allowExplicitFallback: true
        });
        partialResults.push(partial);
      } catch (error) {
        console.warn(`Chunk ${index + 1} extraction failed, using explicit transcript fallback for this segment:`, error);
        partialResults.push(this.extractExplicitFallback(chunk));
      }
    }

    const merged = this.mergePartialResults(partialResults);
    const consolidated = await this.consolidateNarratives(partialResults, merged, transcript);

    return {
      incident_record: consolidated.incident_record || merged.incident_record || '',
      prescription: merged.prescription || [],
      lab_recommendations: merged.lab_recommendations || [],
      radiology_recommendations: merged.radiology_recommendations || [],
      treatment_plan: consolidated.treatment_plan || merged.treatment_plan || '',
      diet_advice: merged.diet_advice || [],
      summary: consolidated.summary || merged.summary || ''
    };
  }

  /**
   * Build the medical extraction prompt
   */
  buildMedicalPrompt(transcript, additionalInstruction = '') {
    return `<|im_start|>system
You are an expert medical consultation assistant. Extract structured medical information from the consultation transcript.

IMPORTANT RULES:
1. Respond with valid JSON only - no markdown, no explanations, no code fences
2. Extract only information explicitly mentioned in the transcript
3. Use professional medical terminology
4. For medication names, use generic names unless brand name is specifically mentioned
5. If a field is not mentioned, use empty string [] or "" as appropriate
6. incident_record, treatment_plan, and summary should be detailed paragraphs
7. prescription should be an array of objects with exact structure: [{"drug": "", "dose": "", "frequency": "", "duration": ""}]

JSON STRUCTURE REQUIRED:
{
  "incident_record": "Detailed paragraph including: chief complaint, history of present illness, symptoms, duration, onset",
  "prescription": [
    {"drug": "medication name", "dose": "e.g., 500mg", "frequency": "e.g., twice daily", "duration": "e.g., 5 days"}
  ],
  "lab_recommendations": ["Complete Blood Count", "Fasting Blood Sugar", ...],
  "radiology_recommendations": ["Chest X-ray", "CT Scan", ...],
  "treatment_plan": "Detailed paragraph explaining the treatment approach, primary interventions, and management strategy",
  "diet_advice": ["Specific dietary recommendation 1", "Specific dietary recommendation 2", ...],
  "summary": "Comprehensive summary covering: patient presentation, key findings, assessment, and plan"
}

EXAMPLES:
- For doses: use formats like "500mg", "10mg", "5ml"
- For frequency: use "once daily", "twice daily", "three times daily", "every 8 hours", "as needed"
- For duration: use "5 days", "1 week", "2 weeks", "until completion"
- For labs: use specific test names like "Complete Blood Count (CBC)", "Fasting Blood Sugar", "Lipid Profile"
- For radiology: use specific studies like "Chest X-ray", "CT Scan abdomen", "MRI brain"
${additionalInstruction ? `\nADDITIONAL INSTRUCTION:\n${additionalInstruction}` : ''}
<|im_end|>
<|im_start|>user
Please analyze this medical consultation transcript and extract structured medical data:

TRANSCRIPT:
${transcript}

Provide the extracted information as JSON following the structure above.
<|im_end|>
<|im_start|>assistant
`;
  }

  buildConsolidationPrompt(partialResults) {
    return `<|im_start|>system
You are an expert medical documentation assistant. You will be given structured outputs extracted from multiple transcript segments of the same consultation.

IMPORTANT RULES:
1. Respond with valid JSON only
2. Merge overlapping details into one coherent clinical note
3. Do not invent facts that are not present in the partial extractions
4. Write incident_record, treatment_plan, and summary as polished clinical prose

JSON STRUCTURE REQUIRED:
{
  "incident_record": "",
  "treatment_plan": "",
  "summary": ""
}
<|im_end|>
<|im_start|>user
Combine the following partial consultation extractions into one coherent final narrative:

${JSON.stringify(partialResults, null, 2)}
<|im_end|>
<|im_start|>assistant
`;
  }

  buildRepairPrompt(rawResponse) {
    return `<|im_start|>system
You are a medical data extraction assistant. Convert the provided model output into valid JSON only.

IMPORTANT RULES:
1. Respond with valid JSON only
2. If a field is missing, leave it as an empty string or empty array
3. Do not add information that is not present in the supplied output

JSON STRUCTURE REQUIRED:
{
  "incident_record": "",
  "prescription": [
    {"drug": "", "dose": "", "frequency": "", "duration": ""}
  ],
  "lab_recommendations": [],
  "radiology_recommendations": [],
  "treatment_plan": "",
  "diet_advice": [],
  "summary": ""
}
<|im_end|>
<|im_start|>user
Repair this model output into valid JSON:

${rawResponse}
<|im_end|>
<|im_start|>assistant
`;
  }

  /**
   * Parse LLM response and extract JSON
   */
  parseLLMResponse(response) {
    try {
      // Remove markdown code fences if present
      let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Try to extract JSON from response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate structure
        return this.validateAndNormalize(parsed);
      }

      // If no JSON found, return empty structure
      console.warn('No JSON found in LLM response, using fallback');
      return {};
    } catch (error) {
      console.error('Failed to parse LLM JSON response:', error);
      console.log('Response was:', response);
      return {};
    }
  }

  async generateStructuredMedicalData(prompt, transcript, options = {}) {
    const response = await this.llm.generate(prompt, {
      maxNewTokens: options.maxNewTokens || 2048,
      temperature: 0.1
    });

    let medicalData = this.parseLLMResponse(response);
    if (this.isEmptyExtraction(medicalData)) {
      medicalData = await this.repairStructuredMedicalData(response);
    }

    const fallbackData = options.allowExplicitFallback
      ? this.extractExplicitFallback(transcript)
      : null;

    return {
      incident_record: medicalData.incident_record || fallbackData?.incident_record || '',
      prescription: medicalData.prescription || [],
      lab_recommendations: (medicalData.lab_recommendations && medicalData.lab_recommendations.length > 0)
        ? medicalData.lab_recommendations
        : (fallbackData?.lab_recommendations || []),
      radiology_recommendations: (medicalData.radiology_recommendations && medicalData.radiology_recommendations.length > 0)
        ? medicalData.radiology_recommendations
        : (fallbackData?.radiology_recommendations || []),
      treatment_plan: medicalData.treatment_plan || fallbackData?.treatment_plan || '',
      diet_advice: (medicalData.diet_advice && medicalData.diet_advice.length > 0)
        ? medicalData.diet_advice
        : (fallbackData?.diet_advice || []),
      summary: medicalData.summary || fallbackData?.summary || ''
    };
  }

  /**
   * Validate and normalize extracted data
   */
  validateAndNormalize(data) {
    const normalized = {
      incident_record: this.ensureString(data.incident_record),
      prescription: this.ensureArray(data.prescription).map(med => ({
        drug: this.ensureString(med?.drug),
        dose: this.ensureString(med?.dose),
        frequency: this.ensureString(med?.frequency),
        duration: this.ensureString(med?.duration)
      })).filter(med => med.drug), // Remove empty prescriptions
      lab_recommendations: this.ensureArray(data.lab_recommendations).filter(Boolean),
      radiology_recommendations: this.ensureArray(data.radiology_recommendations).filter(Boolean),
      treatment_plan: this.ensureString(data.treatment_plan),
      diet_advice: this.ensureArray(data.diet_advice).filter(Boolean),
      summary: this.ensureString(data.summary)
    };

    return normalized;
  }

  /**
   * Ensure value is a string
   */
  ensureString(value) {
    if (typeof value === 'string') return value.trim();
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  /**
   * Ensure value is an array
   */
  ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
  }

  isEmptyExtraction(data) {
    if (!data) return true;
    return !data.incident_record &&
      (!data.prescription || data.prescription.length === 0) &&
      (!data.lab_recommendations || data.lab_recommendations.length === 0) &&
      (!data.radiology_recommendations || data.radiology_recommendations.length === 0) &&
      !data.treatment_plan &&
      (!data.diet_advice || data.diet_advice.length === 0) &&
      !data.summary;
  }

  async repairStructuredMedicalData(rawResponse) {
    try {
      const repairedResponse = await this.llm.generate(this.buildRepairPrompt(rawResponse), {
        maxNewTokens: 1200,
        temperature: 0.1
      });
      return this.parseLLMResponse(repairedResponse);
    } catch (error) {
      console.warn('Failed to repair malformed LLM response:', error);
      return {};
    }
  }

  shouldBatchTranscript(transcript) {
    return transcript.length > this.maxDirectTranscriptChars;
  }

  chunkTranscript(transcript) {
    const blocks = transcript
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .filter(Boolean);

    const chunks = [];
    let current = '';

    for (const block of blocks) {
      if (block.length > this.maxChunkChars) {
        const smallerChunks = this.splitLargeBlock(block);
        for (const smaller of smallerChunks) {
          if (current) {
            chunks.push(current.trim());
            current = '';
          }
          chunks.push(smaller.trim());
        }
        continue;
      }

      const candidate = current ? `${current}\n\n${block}` : block;
      if (candidate.length > this.maxChunkChars) {
        chunks.push(current.trim());
        current = block;
      } else {
        current = candidate;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : this.splitLargeBlock(transcript);
  }

  splitLargeBlock(text) {
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (trimmed.length > this.maxChunkChars) {
        if (current.trim()) {
          chunks.push(current.trim());
          current = '';
        }

        for (let start = 0; start < trimmed.length; start += this.maxChunkChars) {
          chunks.push(trimmed.slice(start, start + this.maxChunkChars).trim());
        }
        continue;
      }

      const candidate = current ? `${current} ${trimmed}` : trimmed;
      if (candidate.length > this.maxChunkChars) {
        chunks.push(current.trim());
        current = trimmed;
      } else {
        current = candidate;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.filter(Boolean);
  }

  mergePartialResults(partialResults) {
    const merged = {
      incident_record: '',
      prescription: [],
      lab_recommendations: [],
      radiology_recommendations: [],
      treatment_plan: '',
      diet_advice: [],
      summary: ''
    };

    const incidentSections = [];
    const treatmentSections = [];
    const summarySections = [];
    const prescriptionKeys = new Set();

    partialResults.forEach(partial => {
      if (partial.incident_record) incidentSections.push(partial.incident_record);
      if (partial.treatment_plan) treatmentSections.push(partial.treatment_plan);
      if (partial.summary) summarySections.push(partial.summary);

      (partial.prescription || []).forEach(med => {
        const key = [
          this.ensureString(med.drug).toLowerCase(),
          this.ensureString(med.dose).toLowerCase(),
          this.ensureString(med.frequency).toLowerCase(),
          this.ensureString(med.duration).toLowerCase()
        ].join('|');

        if (!prescriptionKeys.has(key) && med.drug) {
          prescriptionKeys.add(key);
          merged.prescription.push({
            drug: this.ensureString(med.drug),
            dose: this.ensureString(med.dose),
            frequency: this.ensureString(med.frequency),
            duration: this.ensureString(med.duration)
          });
        }
      });

      merged.lab_recommendations = this.mergeUniqueStrings(merged.lab_recommendations, partial.lab_recommendations || []);
      merged.radiology_recommendations = this.mergeUniqueStrings(merged.radiology_recommendations, partial.radiology_recommendations || []);
      merged.diet_advice = this.mergeUniqueStrings(merged.diet_advice, partial.diet_advice || []);
    });

    merged.incident_record = this.combineNarrativeSections(incidentSections);
    merged.treatment_plan = this.combineNarrativeSections(treatmentSections);
    merged.summary = this.combineNarrativeSections(summarySections);

    return merged;
  }

  async consolidateNarratives(partialResults, merged, transcript) {
    if (!this.llm || partialResults.length <= 1) {
      return {
        incident_record: merged.incident_record,
        treatment_plan: merged.treatment_plan,
        summary: merged.summary
      };
    }

    try {
      const response = await this.llm.generate(this.buildConsolidationPrompt(partialResults), {
        maxNewTokens: 1400,
        temperature: 0.1
      });

      const consolidated = this.parseLLMResponse(response);
      return {
        incident_record: consolidated.incident_record || merged.incident_record || '',
        treatment_plan: consolidated.treatment_plan || merged.treatment_plan || '',
        summary: consolidated.summary || merged.summary || ''
      };
    } catch (error) {
      console.warn('Narrative consolidation failed, using merged partial narratives:', error);
      return {
        incident_record: merged.incident_record || '',
        treatment_plan: merged.treatment_plan || '',
        summary: merged.summary || ''
      };
    }
  }

  mergeUniqueStrings(existing, incoming) {
    const map = new Map(existing.map(item => [item.toLowerCase(), item]));
    incoming.forEach(item => {
      const value = this.ensureString(item);
      if (!value) return;
      const key = value.toLowerCase();
      if (!map.has(key)) {
        map.set(key, value);
      }
    });
    return [...map.values()];
  }

  combineNarrativeSections(sections) {
    const uniqueSections = this.mergeUniqueStrings([], sections);
    return uniqueSections.join('\n\n');
  }

  extractExplicitFallback(transcript) {
    const text = transcript.toLowerCase();
    return {
      incident_record: this.extractExplicitNarrative(transcript, [
        'complain', 'complains', 'presents', 'history', 'reports', 'pain', 'fever', 'cough'
      ]) || transcript.trim(),
      prescription: this.extractPrescriptionFromTranscript(transcript),
      lab_recommendations: this.extractLabs(text),
      radiology_recommendations: this.extractRadiology(text),
      treatment_plan: this.extractExplicitNarrative(transcript, [
        'prescribed', 'advised', 'recommended', 'started on', 'take', 'plan', 'follow'
      ]),
      diet_advice: this.extractDietAdviceFromTranscript(transcript),
      summary: this.extractExplicitNarrative(transcript, [
        'assessment', 'diagnosis', 'impression', 'plan', 'recommended'
      ]) || transcript.trim()
    };
  }

  extractExplicitNarrative(text, keywords) {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    const matches = sentences.filter(sentence => {
      const lower = sentence.toLowerCase();
      return keywords.some(keyword => lower.includes(keyword));
    });

    return this.mergeUniqueStrings([], matches).join(' ');
  }

  extractPrescriptionFromTranscript(text) {
    const medicationNames = [
      'paracetamol', 'ibuprofen', 'amoxicillin', 'azithromycin', 'metformin',
      'lisinopril', 'atorvastatin', 'omeprazole', 'acetaminophen'
    ];
    const frequencyPatterns = [
      'once daily', 'twice daily', 'three times daily', 'four times daily',
      'daily', 'bid', 'tid', 'qid', 'prn', 'every 8 hours', 'every 12 hours'
    ];
    const durationPattern = /\b\d+\s*(?:day|days|week|weeks|month|months)\b/i;
    const dosePattern = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml)\b/i;
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(sentence => sentence.trim()).filter(Boolean);
    const prescriptions = [];
    const seen = new Set();

    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();
      const medication = medicationNames.find(name => lower.includes(name));
      if (!medication) return;

      const dose = sentence.match(dosePattern)?.[0] || '';
      const frequency = frequencyPatterns.find(pattern => lower.includes(pattern)) || '';
      const duration = sentence.match(durationPattern)?.[0] || '';
      const key = [medication, dose.toLowerCase(), frequency.toLowerCase(), duration.toLowerCase()].join('|');

      if (seen.has(key)) return;
      seen.add(key);
      prescriptions.push({
        drug: this.capitalize(medication),
        dose,
        frequency,
        duration
      });
    });

    return prescriptions;
  }

  extractDietAdviceFromTranscript(text) {
    return this.extractAdviceSentences(text, [
      'diet', 'avoid', 'fluid', 'water', 'hydrate', 'meal', 'eat', 'rest', 'sleep', 'exercise'
    ]);
  }

  extractAdviceSentences(text, keywords) {
    const sentences = text.split(/(?<=[.!?])\s+|\n+/).map(sentence => sentence.trim()).filter(Boolean);
    return this.mergeUniqueStrings([], sentences.filter(sentence => {
      const lower = sentence.toLowerCase();
      return keywords.some(keyword => lower.includes(keyword));
    }));
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

    return lines.join('\n');
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

    return labs.length > 0 ? [...new Set(labs)] : [];
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

    return advice.length > 0 ? [...new Set(advice)] : [];
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

    return '';
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

    return '';
  }

  extractLifestyle(text) {
    return this.extractAdviceSentences(text, ['rest', 'exercise', 'activity', 'stress', 'sleep']);
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

    return '';
  }

  extractPlan(text) {
    return this.extractPrimaryTreatment(text);
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
