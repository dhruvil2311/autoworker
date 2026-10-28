export interface KnowledgeDelta {
  before: Record<string, any>;
  after: Record<string, any>;
  diff: string[]; // List of changes, new concepts learned
}

export function calculateDelta(before: Record<string, any>, after: Record<string, any>): KnowledgeDelta {
  const diff: string[] = [];
  
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff.push(`Updated knowledge on: ${key}`);
    }
  }

  return {
    before,
    after,
    diff
  };
}
