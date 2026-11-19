export type FeatureKind = 'BOOLEAN' | 'INTEGER' | 'STRING';

export interface Feature {
  name: string;
  kind: FeatureKind;
  category: string;
  description: string;
  baseline: boolean | number | string;
}

export interface ModelInfo {
  exists: boolean;
  sizeBytes: number | null;
  lastModified: string | null;
  version: string | null;
}

export interface UploadLink {
  url: string;
  expiresAt: string;
  blobName: string;
}

export interface AnalysisInput {
  index: number;
  name: string;
  tensorType: string;
  kind: FeatureKind | null;
  shape: number[];
  supported: boolean;
  problem: string | null;
}

export interface AnalysisOutput {
  name: string;
  tensorType: string;
  shape: number[];
  score: boolean;
}

export interface ModelHeader {
  graphName: string | null;
  producer: string | null;
  producerVersion: string | null;
  domain: string | null;
  irVersion: number | null;
  modelVersion: number | null;
  description: string | null;
  opsets: { domain: string; version: number }[];
}

export interface Analysis {
  valid: boolean;
  error: string | null;
  version: string;
  header: ModelHeader | null;
  inputs: AnalysisInput[];
  outputs: AnalysisOutput[];
  problems: string[];
  usable: boolean;
}

export type CellValue = string | boolean;

export interface TestRunRequest {
  mapping: { input: string; feature: string }[];
  rows: { values: Record<string, boolean | number | string> }[];
}

export interface Contribution {
  feature: string;
  value: boolean | number | string;
  contribution: number;
}

export interface TestCaseResult {
  score: number;
  contributions: Contribution[];
}

export interface TestRunResponse {
  output: string;
  elapsedMs: number;
  baselineScore: number;
  results: TestCaseResult[];
}
