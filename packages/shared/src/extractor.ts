import type { ResultPayloadV1 } from './types.js';

const RELATION_KEYWORDS: Array<{ pattern: RegExp; relationship: ResultPayloadV1['facts'][number]['relationshipType'] }> = [
  { pattern: /response|responded|sensitive/i, relationship: 'associated_with_response' },
  { pattern: /resistance|resistant/i, relationship: 'associated_with_resistance' },
  { pattern: /risk|risk factor/i, relationship: 'associated_with_risk' },
  { pattern: /progression|progressed|metastatic/i, relationship: 'associated_with_progression' },
  { pattern: /combination|cohort|stud(y|ied)|trial/i, relationship: 'studied_with' }
];

function pickSentence(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences[0] ?? text.slice(0, 280);
}

function detectCancerType(text: string): string | undefined {
  const map: Array<[RegExp, string]> = [
    [/breast cancer/i, 'breast cancer'],
    [/lung cancer|nsclc/i, 'lung cancer'],
    [/melanoma/i, 'melanoma'],
    [/colorectal cancer/i, 'colorectal cancer'],
    [/glioblastoma/i, 'glioblastoma']
  ];
  return map.find(([pattern]) => pattern.test(text))?.[1];
}

function detectGene(text: string): string | undefined {
  const matches = text.match(/\b(EGFR|KRAS|BRAF|HER2|PIK3CA|PD-L1|TP53)\b/i);
  return matches?.[1]?.toUpperCase();
}

function detectDrug(text: string): string | undefined {
  const matches = text.match(/\b(osimertinib|trastuzumab|pembrolizumab|nivolumab|cisplatin|erlotinib)\b/i);
  return matches?.[1]?.toLowerCase();
}

function detectRelationship(text: string): ResultPayloadV1['facts'][number]['relationshipType'] {
  const hit = RELATION_KEYWORDS.find(({ pattern }) => pattern.test(text));
  return hit?.relationship ?? 'unclear';
}

function computeConfidence(text: string): number {
  if (/randomized|phase\s+[23]|meta-analysis/i.test(text)) {
    return 0.88;
  }
  if (/retrospective|pilot|preclinical/i.test(text)) {
    return 0.62;
  }
  return 0.74;
}

export function runMockExtractorV1(sourceText: string): ResultPayloadV1 {
  const evidenceSentence = pickSentence(sourceText);
  const relationshipType = detectRelationship(sourceText);
  const fact = {
    cancerType: detectCancerType(sourceText),
    geneOrBiomarker: detectGene(sourceText),
    drugOrCompound: detectDrug(sourceText),
    relationshipType,
    evidenceSentence,
    confidence: computeConfidence(sourceText)
  };

  return {
    facts: [fact],
    summary: `Mock Extractor v1 generated 1 fact with relationship ${relationshipType}.`,
    warnings: ['Mock Extractor v1 output is deterministic demo data and not scientific validation.']
  };
}
