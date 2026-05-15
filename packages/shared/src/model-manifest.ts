export type ApprovedModelTier = 'default' | 'stronger' | 'large' | 'experimental';
export type CandidateModelTier = 'laptop' | 'desktop' | 'high_end';

export type ApprovedModel = {
  id: string;
  provider: 'ollama';
  tier: ApprovedModelTier;
  label: string;
  recommended: boolean;
  publicDefault: boolean;
  estimatedDownload: string;
  memoryGuidance: string;
  notes: string;
};

export type CandidateLocalModel = {
  id: string;
  provider: 'ollama';
  tier: CandidateModelTier;
  label: string;
  role: 'extractor' | 'adjudicator' | 'fallback' | 'benchmark';
  verificationStatus: 'verify_locally' | 'tag_uncertain';
  pullCommand?: string;
  memoryGuidance: string;
  notes: string;
};

export const APPROVED_LOCAL_MODELS: ApprovedModel[] = [
  {
    id: 'qwen3:14b',
    provider: 'ollama',
    tier: 'default',
    label: 'Qwen3 14B',
    recommended: true,
    publicDefault: true,
    estimatedDownload: 'large',
    memoryGuidance: 'Recommended quality/default extractor for newer laptops and desktops. Best precision/recall balance in local bakeoffs so far.',
    notes: 'Use as the anchor model for normal processing and consensus. Lower-end machines can use Gemma 4 E4B.'
  }
];

export const CANDIDATE_LOCAL_MODELS: CandidateLocalModel[] = [
  {
    id: 'gemma4:e4b',
    provider: 'ollama',
    tier: 'laptop',
    label: 'Gemma 4 E4B',
    role: 'fallback',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull gemma4:e4b',
    memoryGuidance: 'Lower-tier/laptop fallback for machines that cannot comfortably run Qwen3 14B. Fast but lower consensus weight.',
    notes: 'Useful consensus contributor and lower-end option; should not override Qwen3 14B when they disagree.'
  },
  {
    id: 'gemma3:12b',
    provider: 'ollama',
    tier: 'desktop',
    label: 'Gemma 3 12B',
    role: 'benchmark',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull gemma3:12b',
    memoryGuidance: 'Desktop-class benchmark and optional consensus contributor.',
    notes: 'Secondary comparator behind Qwen3 14B and Gemma 4 E4B.'
  },
  {
    id: 'gemma4:26b',
    provider: 'ollama',
    tier: 'high_end',
    label: 'Gemma 4 26B',
    role: 'adjudicator',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull gemma4:26b',
    memoryGuidance: 'Advanced/high-end model for capable PCs. Prior laptop run was slow and had exact-span issues; retest on stronger hardware before using broadly.',
    notes: 'Advanced consensus candidate, not a default until it beats Qwen3 14B cleanly.'
  },
  {
    id: 'qwen3.6:27b',
    provider: 'ollama',
    tier: 'high_end',
    label: 'Qwen3.6 27B',
    role: 'adjudicator',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull qwen3.6:27b',
    memoryGuidance: 'Advanced/high-end Qwen candidate. Promising because Qwen3 14B is the current quality leader; verify runtime, schema behavior, latency, and exact-span fidelity.',
    notes: 'Ollama library tag found as qwen3.6:27b. Treat as experimental until bakeoff proves it.'
  },
  {
    id: 'medgemma:27b',
    provider: 'ollama',
    tier: 'high_end',
    label: 'MedGemma 27B',
    role: 'adjudicator',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull medgemma:27b',
    memoryGuidance: 'High-end medical-domain Gemma candidate. Best new model to test for biomedical/oncology evidence extraction on strong PCs.',
    notes: 'Medical-text trained Gemma variant; compare recall, exact-span fidelity, and false positives against Gemma 3 12B, Gemma 4 26B, and Qwen models.'
  },
  {
    id: 'qwen3.6:35b',
    provider: 'ollama',
    tier: 'high_end',
    label: 'Qwen3.6 35B',
    role: 'adjudicator',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull qwen3.6:35b',
    memoryGuidance: 'Very high-end Qwen candidate for strong PCs. Test whether larger Qwen improves recall while preserving Qwen3 14B precision.',
    notes: 'Experimental high-end comparator; expect slower runtime and larger memory footprint than Qwen3.6 27B.'
  },
  {
    id: 'llama3.3:70b',
    provider: 'ollama',
    tier: 'high_end',
    label: 'Llama 3.3 70B',
    role: 'benchmark',
    verificationStatus: 'verify_locally',
    pullCommand: 'ollama pull llama3.3:70b',
    memoryGuidance: 'Workstation-class baseline for friends with very high-end PCs. Useful general 70B comparator, not medical-specialized.',
    notes: 'Only test on hardware with enough RAM/VRAM. Use as a quality baseline against medical/domain and Qwen/Gemma candidates.'
  },
];

export const DEFAULT_LOCAL_MODEL = 'qwen3:14b';

export function approvedModel(model: string): ApprovedModel | undefined {
  return APPROVED_LOCAL_MODELS.find((candidate) => candidate.id === model);
}

export function candidateModel(model: string): CandidateLocalModel | undefined {
  return CANDIDATE_LOCAL_MODELS.find((candidate) => candidate.id === model);
}

export function locallyTestableModel(model: string): ApprovedModel | CandidateLocalModel | undefined {
  return approvedModel(model) ?? candidateModel(model);
}

export function assertApprovedModel(model: string, options: { allowExperimental?: boolean; allowLarge?: boolean; allowCandidate?: boolean } = {}): ApprovedModel | CandidateLocalModel {
  const candidate = candidateModel(model);
  const found = approvedModel(model);
  if (!found) {
    if (options.allowCandidate && candidate) return candidate;
    throw new Error(`model_not_approved:${model}`);
  }
  if (found.tier === 'large' && !options.allowLarge) throw new Error(`large_model_requires_opt_in:${model}`);
  if (found.tier === 'experimental' && !options.allowExperimental) throw new Error(`experimental_model_requires_opt_in:${model}`);
  return found;
}
