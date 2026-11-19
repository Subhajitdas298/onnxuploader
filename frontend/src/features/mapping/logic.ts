import type { AnalysisInput, Feature } from '../../types';

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** First guess for each model input: a feature of the same type whose name matches (case, "_", "-" ignored). */
export function autoMatch(inputs: AnalysisInput[], features: Feature[]): (string | null)[] {
  const used = new Set<string>();
  return inputs.map((input) => {
    if (!input.kind) return null;
    const match = features.find((f) => f.kind === input.kind && normalize(f.name) === normalize(input.name) && !used.has(f.name));
    if (!match) return null;
    used.add(match.name);
    return match.name;
  });
}

/** "an integer", "a string", "a boolean" */
export const withArticle = (word: string) => `${word.toLowerCase() === 'integer' ? 'an' : 'a'} ${word.toLowerCase()}`;

export function incompatibility(input: AnalysisInput, feature: Feature): string | null {
  if (input.kind === feature.kind) return null;
  const need = input.kind ? withArticle(input.kind) : 'a supported';
  return `“${feature.name}” is ${withArticle(feature.kind)} feature. Input “${input.name}” needs ${need} one.`;
}
