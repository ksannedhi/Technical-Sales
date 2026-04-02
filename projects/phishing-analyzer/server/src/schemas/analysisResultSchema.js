import { z } from 'zod';

const findingSchema = z.object({
  id: z.string(),
  category: z.enum([
    'sender',
    'headers',
    'links',
    'urgency',
    'impersonation',
    'payload',
    'content',
    'financial_fraud',
    'credential_harvesting'
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  displayCategory: z.string(),
  title: z.string(),
  detail: z.string(),
  excerpt: z.string(),
  deterministic: z.boolean(),
  eccControls: z.array(z.string()),
  eccExplanation: z.string()
});

const tacticSchema = z.object({
  tactic: z.string(),
  techniqueId: z.string(),
  techniqueName: z.string(),
  relevance: z.string()
});

const gapSchema = z.object({
  controlId: z.string(),
  controlName: z.string(),
  gap: z.string(),
  whyItMatters: z.string(),
  priority: z.enum(['immediate', 'short-term', 'planned'])
});

const recommendationSchema = z.object({
  action: z.string(),
  owner: z.enum(['SOC', 'IT', 'HR', 'Management']),
  timeframe: z.enum(['immediate', '24h', '1-week']),
  rationale: z.string()
});

export const analysisResultSchema = z.object({
  riskScore: z.number().min(0).max(100),
  verdict: z.enum(['clean', 'suspicious', 'likely_phishing', 'phishing']),
  confidence: z.number().min(0).max(100),
  executiveSummary: z.string(),
  analystSummary: z.string(),
  findings: z.array(findingSchema),
  attackTactics: z.array(tacticSchema),
  eccComplianceGaps: z.array(gapSchema),
  recommendations: z.array(recommendationSchema),
  metadata: z.object({
    analyzedAt: z.string(),
    emailFrom: z.string(),
    replyTo: z.string(),
    emailSubject: z.string(),
    linkCount: z.number(),
    attachmentDetected: z.boolean(),
    inputType: z.enum(['raw_text', 'eml_upload', 'headers_body', 'forwarded_email']),
    analysisSource: z.enum(['openai_structured', 'deterministic_fallback', 'deterministic_override']).optional()
  })
});

export const analysisJsonSchema = {
  name: 'phishing_analysis',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'riskScore',
      'verdict',
      'confidence',
      'executiveSummary',
      'analystSummary',
      'findings',
      'attackTactics',
      'eccComplianceGaps',
      'recommendations',
      'metadata'
    ],
    properties: {
      riskScore: { type: 'number', minimum: 0, maximum: 100 },
      verdict: { type: 'string', enum: ['clean', 'suspicious', 'likely_phishing', 'phishing'] },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      executiveSummary: { type: 'string' },
      analystSummary: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'category', 'severity', 'displayCategory', 'title', 'detail', 'excerpt', 'deterministic', 'eccControls', 'eccExplanation'],
          properties: {
            id: { type: 'string' },
            category: {
              type: 'string',
              enum: ['sender', 'headers', 'links', 'urgency', 'impersonation', 'payload', 'content', 'financial_fraud', 'credential_harvesting']
            },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            displayCategory: { type: 'string' },
            title: { type: 'string' },
            detail: { type: 'string' },
            excerpt: { type: 'string' },
            deterministic: { type: 'boolean' },
            eccControls: { type: 'array', items: { type: 'string' } },
            eccExplanation: { type: 'string' }
          }
        }
      },
      attackTactics: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tactic', 'techniqueId', 'techniqueName', 'relevance'],
          properties: {
            tactic: { type: 'string' },
            techniqueId: { type: 'string' },
            techniqueName: { type: 'string' },
            relevance: { type: 'string' }
          }
        }
      },
      eccComplianceGaps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['controlId', 'controlName', 'gap', 'whyItMatters', 'priority'],
          properties: {
            controlId: { type: 'string' },
            controlName: { type: 'string' },
            gap: { type: 'string' },
            whyItMatters: { type: 'string' },
            priority: { type: 'string', enum: ['immediate', 'short-term', 'planned'] }
          }
        }
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'owner', 'timeframe', 'rationale'],
          properties: {
            action: { type: 'string' },
            owner: { type: 'string', enum: ['SOC', 'IT', 'HR', 'Management'] },
            timeframe: { type: 'string', enum: ['immediate', '24h', '1-week'] },
            rationale: { type: 'string' }
          }
        }
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['analyzedAt', 'emailFrom', 'replyTo', 'emailSubject', 'linkCount', 'attachmentDetected', 'inputType'],
        properties: {
          analyzedAt: { type: 'string' },
          emailFrom: { type: 'string' },
          replyTo: { type: 'string' },
          emailSubject: { type: 'string' },
          linkCount: { type: 'number' },
          attachmentDetected: { type: 'boolean' },
          inputType: { type: 'string', enum: ['raw_text', 'eml_upload', 'headers_body', 'forwarded_email'] }
        }
      }
    }
  },
  strict: true
};
