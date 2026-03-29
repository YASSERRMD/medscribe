/**
 * ONNX LLM Engine
 *
 * Browser-based inference for ONNX language models
 * Supports models like Qwen2.5, Phi-3, and future Liquid AI LFM
 */

export class ONNXLlmEngine {
  constructor(config = {}) {
    this.model = null;
    this.tokenizer = null;
    this.isInitialized = false;
    this.isModelLoading = false;

    // Model configuration
    this.modelConfig = {
      modelId: config.modelId || 'Xenova/Qwen2.5-1.5B-Instruct', // Can be swapped for Liquid AI
      modelFile: config.modelFile || 'onnx/model_quantized.onnx',
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature ?? 0.7,
      topP: config.topP ?? 0.9,
      repetitionPenalty: config.repetitionPenalty ?? 1.1,
      ...config
    };

    // Progress callback
    this.onProgress = config.onProgress || (() => {});
  }

  async initialize() {
    if (this.isInitialized) return;
    if (this.isModelLoading) {
      throw new Error('Model is already loading. Please wait.');
    }

    this.isModelLoading = true;
    this.onProgress(10, 'Importing transformers library...');

    try {
      // Dynamic import to reduce initial bundle
      const { pipeline, env } = await import('@huggingface/transformers');

      // Configure environment
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      this.onProgress(30, 'Loading model and tokenizer...');

      // Initialize the text generation pipeline
      this.generator = await pipeline('text-generation', this.modelConfig.modelId, {
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            const percent = progress.progress || 0;
            this.onProgress(
              30 + Math.floor(percent * 0.5),
              `Downloading model: ${Math.floor(percent)}%`
            );
          } else if (progress.status === 'loading') {
            this.onProgress(80, 'Loading model into memory...');
          }
        }
      });

      this.onProgress(100, 'Model loaded successfully!');
      this.isInitialized = true;
      this.isModelLoading = false;

      console.log(`ONNX LLM Engine initialized with ${this.modelConfig.modelId}`);
    } catch (error) {
      this.isModelLoading = false;
      console.error('Model initialization failed:', error);
      throw new Error(`Failed to load model: ${error.message}`);
    }
  }

  /**
   * Generate text using the model
   */
  async generate(prompt, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      maxNewTokens = options.maxNewTokens || 1024,
      temperature = options.temperature || this.modelConfig.temperature,
      topP = options.topP || this.modelConfig.topP,
      doSample = options.doSample ?? true,
      stopTokens = options.stopTokens || []
    } = options;

    try {
      const output = await this.generator(prompt, {
        max_new_tokens: maxNewTokens,
        temperature,
        top_p: topP,
        do_sample: doSample,
        return_full_text: false
      });

      let generatedText = output[0].generated_text;

      // Remove stop tokens if present
      for (const stopToken of stopTokens) {
        const idx = generatedText.indexOf(stopToken);
        if (idx !== -1) {
          generatedText = generatedText.substring(0, idx);
        }
      }

      return generatedText.trim();
    } catch (error) {
      console.error('Generation failed:', error);
      throw new Error(`Text generation failed: ${error.message}`);
    }
  }

  /**
   * Generate structured JSON output
   */
  async generateJson(prompt, schema = {}) {
    const fullPrompt = this.buildJsonPrompt(prompt, schema);
    const text = await this.generate(fullPrompt, {
      temperature: 0.3, // Lower temperature for more structured output
      maxNewTokens: 2048
    });

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found in response');
    } catch (error) {
      console.error('JSON parsing error:', error);
      // Return partial data or fallback
      return this.parseStructuredText(text);
    }
  }

  /**
   * Build a prompt for JSON generation
   */
  buildJsonPrompt(userPrompt, schema) {
    return `<|im_start|>system
You are a medical data extraction assistant. Extract structured information from medical consultation transcripts.
Always respond with valid JSON only. No markdown, no explanations, just the JSON object.
<|im_end|>
<|im_start|>user
${userPrompt}

Required schema:
${JSON.stringify(schema, null, 2)}
<|im_end|>
<|im_start|>assistant
`;
  }

  /**
   * Fallback: Parse structured text if JSON fails
   */
  parseStructuredText(text) {
    // Simple key-value extraction
    const result = {};
    const lines = text.split('\n');

    let currentKey = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Look for patterns like "Key: value" or "Key - value"
      const match = trimmed.match(/^([A-Za-z_]+)\s*[:\-]\s*(.+)$/);
      if (match) {
        currentKey = match[1];
        result[currentKey] = match[2];
      } else if (currentKey) {
        result[currentKey] += ' ' + trimmed;
      }
    }

    return result;
  }

  /**
   * Check if model is ready
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      modelId: this.modelConfig.modelId,
      isInitialized: this.isInitialized,
      isLoading: this.isModelLoading,
      maxTokens: this.modelConfig.maxTokens
    };
  }

  /**
   * Clear model from memory
   */
  async dispose() {
    if (this.generator) {
      await this.generator.dispose();
      this.generator = null;
    }
    this.isInitialized = false;
    console.log('Model disposed from memory');
  }
}
