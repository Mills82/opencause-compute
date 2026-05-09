export type ApprovedModelTier = 'default' | 'stronger' | 'large' | 'experimental';

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

export const APPROVED_LOCAL_MODELS: ApprovedModel[] = [
  {
    id: 'llama3.2:3b',
    provider: 'ollama',
    tier: 'default',
    label: 'Llama 3.2 3B',
    recommended: true,
    publicDefault: true,
    estimatedDownload: 'small',
    memoryGuidance: 'Best first choice for typical consumer laptops and desktops.',
    notes: 'Default public volunteer model. Lower resource use and faster setup.'
  },
  {
    id: 'llama3.1:8b',
    provider: 'ollama',
    tier: 'stronger',
    label: 'Llama 3.1 8B',
    recommended: true,
    publicDefault: false,
    estimatedDownload: 'medium',
    memoryGuidance: 'Better for stronger machines; may be slower or heavier on laptops.',
    notes: 'Good optional upgrade once the default model works.'
  },
  {
    id: 'llama3.3:70b',
    provider: 'ollama',
    tier: 'large',
    label: 'Llama 3.3 70B',
    recommended: false,
    publicDefault: false,
    estimatedDownload: 'very large',
    memoryGuidance: 'Requires a high-end workstation/server-class setup. Not recommended for normal volunteers.',
    notes: 'Allow only with explicit advanced-user confirmation.'
  },
  {
    id: 'llama4:scout',
    provider: 'ollama',
    tier: 'experimental',
    label: 'Llama 4 Scout',
    recommended: false,
    publicDefault: false,
    estimatedDownload: 'large',
    memoryGuidance: 'Experimental option; requirements and extraction quality need project validation.',
    notes: 'Do not make default until extraction quality/resource profile are validated.'
  },
  {
    id: 'llama4:maverick',
    provider: 'ollama',
    tier: 'experimental',
    label: 'Llama 4 Maverick',
    recommended: false,
    publicDefault: false,
    estimatedDownload: 'very large',
    memoryGuidance: 'Experimental large model option for advanced hardware only.',
    notes: 'Do not make default; requires explicit advanced-user opt-in and validation.'
  }
];

export const DEFAULT_LOCAL_MODEL = 'llama3.2:3b';

export function approvedModel(model: string): ApprovedModel | undefined {
  return APPROVED_LOCAL_MODELS.find((candidate) => candidate.id === model);
}

export function assertApprovedModel(model: string, options: { allowExperimental?: boolean; allowLarge?: boolean } = {}): ApprovedModel {
  const found = approvedModel(model);
  if (!found) throw new Error(`model_not_approved:${model}`);
  if (found.tier === 'large' && !options.allowLarge) throw new Error(`large_model_requires_opt_in:${model}`);
  if (found.tier === 'experimental' && !options.allowExperimental) throw new Error(`experimental_model_requires_opt_in:${model}`);
  return found;
}
