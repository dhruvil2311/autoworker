# Ghost Desktop Evidence Intelligence Engine

Python-based media ingestion, frame extraction, spatial OCR, visual UI detection, pointer/keyboard tracking, desktop state reconstruction, and semantic business process understanding for the Ghost autonomous worker platform.

## Architecture

```
VIDEO / SCREENSHOT / DESKTOP RECORDING
               ↓
        Media Ingestion
               ↓
Adaptive Frame Sampling & Scene Detection
               ↓
    Spatial OCR & UI Detection
               ↓
   Desktop State Reconstruction (t)
               ↓
    Action & Event Reconstruction
  (OBSERVED / INFERRED / UNKNOWN)
               ↓
        Semantic Events
               ↓
 Business Process Intelligence (BPI)
               ↓
Operational Intent Representation (OIR)
               ↓
   Executable Capability Workflow
```
