# Autoworker Design System

This document outlines the visual system for the Autoworker digital workforce platform. The system is designed to reject generic AI SaaS tropes (purple gradients, excessive cards, meaningless floaters) in favor of a "digital workplace" aesthetic that feels premium, spatial, and highly intentional.

## 1. Core Aesthetic Principles

- **The Product Metaphor:** The "Workspace is the Identity". We DO NOT use characters, avatars, mascots, or generic robots. The worker is represented entirely by its spatial, 3D-transforming digital environment (documents, nodes, browser view).
- **Color Discipline:** Deep, cinematic dark mode (`#0a0a0a` to `#161616`). A single, highly calibrated accent color per worker role (e.g., Electric Teal for Default, Amber for Exceptions). Pure black is banned.
- **Materiality:** True glassmorphism with 1px inner borders for refraction. Use advanced CSS 3D transforms (`rotateX`, `rotateY`, `translateZ`) to create layered depth, rather than flat cards.
- **Perpetual Physics:** Use spring-based physics (`stiffness: 100, damping: 20`) for all layout and interaction transitions. No linear CSS.
- **States as Story:** Loading states, empty states, and errors are narrative beats (e.g., documents assembling into logic, process halting with amber lighting). No generic spinners.

## 2. Typography

We strictly avoid using Inter everywhere.

- **Display / Headlines:** `Outfit` (sans-serif)
  - Characteristics: Geometric, modern, highly legible at large sizes.
  - Usage: `font-headline`, `font-display`. Tightly tracked (`tracking-tight`).
- **Body:** `Inter`
  - Characteristics: Clean, neutral, high readability for long-form text.
  - Usage: `font-body`. Relaxed line height (`leading-relaxed`).
- **Telemetry / Code / Data:** `JetBrains Mono`
  - Characteristics: Monospaced, tabular numbers.
  - Usage: `font-code`, `font-label-caps`.

## 3. Color Palette

- **Base (Backgrounds):**
  - `background`: `#0a0a0a` (Deep Space)
  - `surface`: `#111111`
  - `surface-container`: `#1a1a1a`
  - `surface-container-high`: `#222222`
- **Accents (Role-based):**
  - Operations / Default: `#6bd8cb` (Electric Teal)
  - Finance: `#34d399` (Emerald)
  - Exceptions / Needs Help: `#f59e0b` (Amber)
  - Error: `#ef4444` (Rose)
- **Text:**
  - `on-surface`: `#f8fafc` (Slate 50)
  - `on-surface-variant`: `#94a3b8` (Slate 400)

## 4. Spatial Architecture (Layout)

- **The Workforce HQ (Overview):** An isometric or expansive spatial view of the workforce. Rendered as distinct 3D workstations, not character avatars.
- **The Worker Environment (Detail):** 
  - Left Zone: Identity (The 3D Workspace rendering)
  - Center Zone: Active Execution / Process Graph
  - Right Zone: Memory & Knowledge Map
- **Navigation:** The left sidebar is removed. Global navigation moves to a spatial, floating command dock.

## 5. Animation Engine (Framer Motion)

- **Transitions:** `transition={{ type: "spring", stiffness: 100, damping: 20 }}`
- **Micro-Interactions:** `:active` states use `scale: 0.98` for tactile feedback.
- **Scrolltelling:** Use `useScroll` and `useTransform` mapped to scroll progress to drive CSS 3D values (`rotateX`, `translateZ`) to create cinematic, camera-driven storytelling.

## 6. The 3D Digital Workspace System

- An advanced CSS 3D + SVG + Framer Motion hybrid architecture.
- Replaces all character illustrations.
- **States:** 
  - `raw_input`: Messy 3D document layers.
  - `understanding`: Documents break into structured fragments.
  - `process`: Fragments assemble into a workflow graph.
  - `execution`: Folds into a realistic 3D browser.
  - `needs_help`: Environment freezes, lights turn amber.
  - `learning`: Physical morphing of the workflow.
