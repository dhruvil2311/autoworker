/**
 * Document parser for CSV and SOP ingestion.
 * 
 * CSV: Simple flat file parsing (header row + data rows).
 * SOP: Text-based extraction of rules, steps, and constraints.
 */

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export interface ParsedSOP {
  summary: string;
  steps: string[];
  rules: string[];
  constraints: string[];
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  // Detect delimiter: comma, tab, semicolon, pipe
  const firstLine = lines[0]!;
  const delimiters = [',', '\t', ';', '|'] as const;
  let bestDelimiter: string = ',';
  let bestCount = 0;
  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = d;
    }
  }

  // Simple CSV parsing — handles quoted fields
  function splitCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitCSVLine(firstLine, bestDelimiter);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]!, bestDelimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows, rowCount: rows.length };
}

export function parseSOPText(text: string): ParsedSOP {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  const steps: string[] = [];
  const rules: string[] = [];
  const constraints: string[] = [];
  let summary = '';

  // Heuristic patterns for step detection
  const stepPattern = /^(?:\d+[\.\)]\s*|step\s+\d+[\.:]\s*|-\s+)/i;
  // Action patterns that signify interactive browser instructions
  const actionPattern = /\b(open|navigate|go to|enter|type|fill|input|click|press|select|check|verify|assert|extract|checkout|continue|add|login|log in|logout|log out|stop)\b/i;
  // Rule patterns: "must", "always", "never", "only if", "required"
  const rulePattern = /\b(must|always|never|only\s+if|required|ensure|make\s+sure)\b/i;
  // Constraint patterns: "within", "maximum", "minimum", "no more than", "at least"
  const constraintPattern = /\b(within|maximum|minimum|no\s+more\s+than|at\s+least|deadline|by\s+\d|before\s+\d|limit|cap\s+at)\b/i;

  let inStepsSection = false;
  let summaryCollected = false;

  for (const line of lines) {
    // Detect section headers
    if (/^#+\s/.test(line) || /^(steps|procedure|instructions|process|workflow)[\s:]*$/i.test(line)) {
      inStepsSection = /step|procedure|instruction|process|workflow/i.test(line);
      continue;
    }

    // If it starts with a step prefix (1., Step 1:, -)
    if (stepPattern.test(line)) {
      const stepText = line.replace(stepPattern, '').trim();
      if (stepText.length > 3) steps.push(stepText);
      inStepsSection = true;
      continue;
    }

    // If it matches an action pattern (even without bullet numbering)
    if (actionPattern.test(line)) {
      steps.push(line);
      continue;
    }

    // Try to extract summary from first non-heading paragraph that is NOT an action
    if (!summaryCollected && !line.startsWith('#') && line.length > 20) {
      summary = line;
      summaryCollected = true;
      continue;
    }

    if (rulePattern.test(line)) {
      rules.push(line);
    } else if (constraintPattern.test(line)) {
      constraints.push(line);
    } else if (inStepsSection && line.length > 10) {
      steps.push(line);
    }
  }

  if (!summary && steps.length > 0) {
    summary = `SOP with ${steps.length} steps and ${rules.length} business rules.`;
  }

  return { summary, steps, rules, constraints };
}
