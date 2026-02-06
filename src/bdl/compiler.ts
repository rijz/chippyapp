import { KnowledgeBaseData, Service, PricingPlan } from '../types';
import { BusinessMemorySnapshot } from './types';

type CompileOptions = {
  tenantId: string;
  version?: number;
  compiledAt?: string;
};

const toLineList = (items: Array<string | undefined | null>): string[] => {
  return items
    .map(item => (item || '').trim())
    .filter(item => item.length > 0);
};

const formatPricing = (service: Service): string => {
  const pricing = service.pricing;
  if (!pricing) return 'Pricing not specified';

  switch (pricing.type) {
    case 'fixed':
      return formatAmount(pricing.amount, pricing.currency);
    case 'starting_from':
      return `Starting at ${formatAmount(pricing.amount, pricing.currency)}`;
    case 'hourly':
      return `${formatAmount(pricing.amount, pricing.currency)} per hour`;
    case 'custom':
      return pricing.customText || 'Custom pricing';
    case 'contact':
      return 'Contact for pricing';
    default:
      return 'Pricing not specified';
  }
};

const formatAmount = (amount?: number, currency?: string): string => {
  if (amount === undefined || amount === null) return 'Price on request';
  const normalizedCurrency = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency
    }).format(amount);
  } catch {
    return `${amount} ${normalizedCurrency}`;
  }
};

const formatServiceLine = (service: Service): string => {
  const parts: string[] = [service.name];

  if (service.duration) {
    parts.push(`(${service.duration} min)`);
  }

  if (service.category) {
    parts.push(`[${service.category}]`);
  }

  const description = service.description ? ` — ${service.description}` : '';
  return `${parts.join(' ')} — ${formatPricing(service)}${description}`;
};

const formatPricingPlans = (plans: PricingPlan[]): string[] => {
  if (!plans || plans.length === 0) return ['- Not provided'];
  return plans.map(plan => {
    const name = plan.name || 'Plan';
    const price = plan.price || 'Price not specified';
    const features = plan.features && plan.features.length > 0
      ? ` — ${plan.features.join(', ')}`
      : '';
    return `- ${name}: ${price}${features}`;
  });
};

const formatPricingNotes = (pricingText: string): string[] => {
  const lines = pricingText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return ['- Not provided'];
  return lines.map(line => `- ${line}`);
};

const simpleHash = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

export const compileBusinessMemory = (
  knowledge: KnowledgeBaseData,
  options: CompileOptions
): BusinessMemorySnapshot => {
  const compiledAt = options.compiledAt || new Date().toISOString();
  const version = options.version ?? 1;
  const kbLastUpdated = knowledge.lastUpdated ? new Date(knowledge.lastUpdated as any).toISOString() : 'Unknown';

  const locations = (knowledge.locations || []).map(loc => {
    const pieces = toLineList([
      loc.name,
      loc.address,
      loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || loc.state,
      loc.zip
    ]);

    return `- ${pieces.join(' — ')}`;
  });

  const services = (knowledge.services || []).map(formatServiceLine);

  const pricingPlans = Array.isArray(knowledge.pricing)
    ? formatPricingPlans(knowledge.pricing)
    : ['- Not provided'];
  const pricingNotes = typeof knowledge.pricing === 'string' && knowledge.pricing.trim()
    ? formatPricingNotes(knowledge.pricing)
    : ['- Not provided'];
  const topRules = (knowledge.topRules || '')
    .split('\n')
    .map(rule => rule.trim())
    .filter(Boolean)
    .map(rule => `- ${rule}`);

  const keywords = (knowledge.keywords || []).map(k => `- ${k}`);

  const policies = (knowledge.policies || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `- ${line}`);

  const lines = [
    'BMS',
    `Company: ${knowledge.companyName || 'Unknown'}`,
    `Category: ${knowledge.businessCategory || 'Unknown'}`,
    `Website: ${knowledge.website || 'Not provided'}`,
    `Phone: ${knowledge.phoneNumber || knowledge.contactInfo || 'Not provided'}`,
    `Hours: ${knowledge.businessHours || 'Not provided'}`,
    `Summary: ${knowledge.summary || 'Not provided'}`,
    `KB Last Updated: ${kbLastUpdated}`,
    `KB Sync: ${compiledAt}`,
    '',
    'Locations:',
    locations.length > 0 ? locations.join('\n') : '- Not provided',
    '',
    'Services:',
    services.length > 0 ? services.map(s => `- ${s}`).join('\n') : '- Not provided',
    '',
    'Pricing Plans:',
    pricingPlans.join('\n'),
    '',
    'Pricing Notes:',
    pricingNotes.join('\n'),
    '',
    'Policies:',
    policies.length > 0 ? policies.join('\n') : '- Not provided',
    '',
    'Top Rules:',
    topRules.length > 0 ? topRules.join('\n') : '- Not provided',
    '',
    'Keywords:',
    keywords.length > 0 ? keywords.join('\n') : '- Not provided'
  ];

  const bmsText = lines.join('\n');
  const sourceHash = simpleHash(JSON.stringify(knowledge));

  return {
    tenantId: options.tenantId,
    version,
    compiledAt,
    bmsText,
    sourceHash
  };
};
