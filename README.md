# MedScribe

> Privacy-First AI Medical Consultation App - 100% Browser-Based, Zero Server

MedScribe is a fully local AI-powered medical consultation assistant that runs entirely in your browser. Record doctor-patient conversations, and get instant transcriptions with structured medical data extraction - all offline, all private.

## Features

- **🎤 Voice Recording**: Record consultations directly in the browser
- **📝 Live Transcription**: Speech-to-text powered by LFM2.5-Audio-1.5B
- **🏥 Medical Data Extraction**: Automatically extracts structured medical information
- **🔒 100% Private**: No server, no API calls, no data transmission
- **💻 Local-First**: Runs entirely in-browser via WebGPU/WASM
- **📊 Structured Dashboard**: Auto-fills medical report sections

## Privacy Architecture

MedScribe is designed with privacy as the core principle:

| Feature | Implementation |
|---------|----------------|
| **Audio Processing** | Done locally in-browser |
| **Mic Privacy** | Released immediately after recording |
| **AI Models** | Run locally via ONNX Runtime Web |
| **Data Storage** | Models cached in IndexedDB (first visit only) |
| **Network Access** | Only for initial model download from HuggingFace |
| **Telemetry** | None. Zero. Nada. |

## Tech Stack

- **STT Model**: Liquid AI LFM2.5-Audio-1.5B (ONNX Q4)
- **LLM Model**: Liquid AI LFM2.5-1.2B-Instruct (ONNX Q4)
- **Build Tool**: Vite 5
- **Inference**: ONNX Runtime Web + Transformers.js
- **Runtime**: WebGPU (with WASM fallback)

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Browser Requirements

- Chrome/Edge 113+ (for WebGPU support)
- Firefox 117+ (WebGPU support)
- Safari 18.2+ (WebGPU support)

For unsupported browsers, the app automatically falls back to WASM.

## First Launch

On first launch, the app will download AI models (~500MB). This is a one-time operation:

1. Models are downloaded from HuggingFace
2. Cached to browser's IndexedDB
3. Subsequent launches load from cache (offline-capable)

## Usage

1. **Open the app** in a WebGPU-supported browser
2. **Wait for models to load** (first run: ~2-5 minutes for download)
3. **Click "Start Consultation"** - grant microphone permission
4. **Record the consultation** - the app listens in the background
5. **Click "End & Generate Report"** - mic closes, processing starts
6. **View the dashboard** - transcript and extracted medical data appear

## Medical Data Extraction

The app automatically extracts:

- **Incident Record**: Patient complaint and history
- **Prescription**: Medications with dose, frequency, duration
- **Lab Recommendations**: Required lab tests
- **Radiology Recommendations**: Required imaging
- **Treatment Plan**: Step-by-step treatment approach
- **Diet Advice**: Dietary recommendations
- **Consultation Summary**: Brief overview

## Project Structure

```
medscribe/
├── src/
│   ├── config/
│   │   └── models.js          # Model configuration
│   ├── modules/
│   │   ├── AudioRecorder.js   # Microphone handling
│   │   ├── SpeechToText.js    # STT pipeline
│   │   ├── MedicalExtractor.js # LLM extraction
│   │   └── UIManager.js        # Dashboard rendering
│   └── main.js                 # App orchestration
├── index.html                  # Main UI
├── vite.config.js             # COOP/COEP headers for WebGPU
└── package.json
```

## Offline Usage

After the first model download, MedScribe works completely offline:

1. Models persist in IndexedDB
2. No external requests are made
3. All processing is local

## Language Support

Currently configured for **English** transcription.

To enable **Arabic** support, modify `src/config/models.js`:

```javascript
stt: {
  language: 'arabic', // Change from 'english'
}
```

## License

This project uses models subject to the [LFM 1.0 License](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-ONNX/blob/main/LICENSE).

## Disclaimer

MedScribe is an AI assistant and should not replace professional medical judgment. Always verify extracted information for accuracy.

---

Built with ❤️ for privacy-first healthcare
