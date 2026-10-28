import fs from 'fs';
import path from 'path';
import type { Observation, NormalizedDemonstration } from '../src/index.js';

export function generateAdversarialRecording(): NormalizedDemonstration {
  const observations: Observation[] = [];
  const urlBase = "https://ghost.retail.app/adversarial";
  
  let seq = 0;
  let time = 1700000000000;

  // 1. Context Switch & Wait
  observations.push({
    sequence: seq++, timestamp: new Date(time).toISOString(), action: "NAVIGATE",
    context: { url: urlBase + "/start", page_title: "Start" }
  });
  time += 15000; // 15s pause

  // 2. Contradictory inputs
  observations.push({
    sequence: seq++, timestamp: new Date(time).toISOString(), action: "INPUT",
    context: { url: urlBase + "/start", page_title: "Start" },
    target: { dom_evidence: { tag: "INPUT", attributes: { id: "search" } } },
    value: { classification: { value: "USER_INPUT", confidence: 1, classification: "OBSERVED_FACT", evidence: [] }, is_sensitive: false, raw_value: "A" }
  });
  time += 1000;
  observations.push({
    sequence: seq++, timestamp: new Date(time).toISOString(), action: "KEYBOARD",
    context: { url: urlBase + "/start", page_title: "Start" },
    target: { dom_evidence: { tag: "INPUT", attributes: { id: "search" } } },
    value: { classification: { value: "USER_INPUT", confidence: 1, classification: "OBSERVED_FACT", evidence: [] }, is_sensitive: false, raw_value: "Backspace" }
  });
  time += 1000;
  observations.push({
    sequence: seq++, timestamp: new Date(time).toISOString(), action: "INPUT",
    context: { url: urlBase + "/start", page_title: "Start" },
    target: { dom_evidence: { tag: "INPUT", attributes: { id: "search" } } },
    value: { classification: { value: "USER_INPUT", confidence: 1, classification: "OBSERVED_FACT", evidence: [] }, is_sensitive: false, raw_value: "Final Query" }
  });
  time += 500;

  // 3. Repeated corrections (Duplicate clicks with delays)
  for (let i = 0; i < 5; i++) {
    observations.push({
      sequence: seq++, timestamp: new Date(time).toISOString(), action: "CLICK",
      context: { url: urlBase + "/start", page_title: "Start" },
      target: { dom_evidence: { tag: "BUTTON", attributes: { id: "submit" } } }
    });
    time += 500;
  }

  // 4. Nested loops (e.g. adding 3 items to cart)
  for (let item = 1; item <= 3; item++) {
    observations.push({
      sequence: seq++, timestamp: new Date(time).toISOString(), action: "CLICK",
      context: { url: urlBase + "/products", page_title: "Products" },
      target: { dom_evidence: { tag: "DIV", attributes: { class: `product-${item}` } } }
    });
    time += 1000;
    observations.push({
      sequence: seq++, timestamp: new Date(time).toISOString(), action: "CLICK",
      context: { url: urlBase + "/products", page_title: "Products" },
      target: { dom_evidence: { tag: "BUTTON", text: "Add to Cart", attributes: { class: "add" } } }
    });
    time += 2000;
  }

  return {
    recording_id: "adv_001",
    tenant_id: "test",
    source: "synthetic",
    started_at: new Date(1700000000000).toISOString(),
    ended_at: new Date(time).toISOString(),
    observations
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Generated adversarial recording with " + generateAdversarialRecording().observations.length + " events.");
}
