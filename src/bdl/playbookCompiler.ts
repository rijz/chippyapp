import { BusinessMemorySnapshot } from './types';
import { BusinessPlaybook, KnowledgeBaseData, Service } from '../types';

type CompileOptions = {
  tenantId: string;
  version?: number;
  compiledAt?: string;
};

const simpleHash = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const cleanLines = (items: unknown[]): string[] =>
  items
    .map(item => String(item || '').trim())
    .filter(Boolean);

const formatPrice = (service: Service): string => {
  const pricing = service.pricing;
  if (!pricing || pricing.hidePrice) return pricing?.ctaText || 'Consultation required';
  if (pricing.customText) return pricing.customText;
  if (pricing.type === 'quote') return pricing.ctaText || 'Quote required';
  if (pricing.type === 'negotiable') return 'Varies by consultation';
  if (pricing.amount === undefined || pricing.amount === null) return 'Pricing not specified';
  const currency = pricing.currency || 'USD';
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(pricing.amount);
  if (pricing.maxAmount) {
    const max = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(pricing.maxAmount);
    return `${amount} - ${max}`;
  }
  if (pricing.type === 'starting_from') return `Starting at ${amount}`;
  if (pricing.unitLabel) return `${amount} ${pricing.unitLabel}`;
  return amount;
};

const section = (title: string, body: string | string[]) => {
  const content = Array.isArray(body) ? body.join('\n') : body;
  return `## ${title}\n${content || 'Not provided'}`.trim();
};

export const buildPlaybookFromKnowledge = (
  tenantId: string,
  knowledge: KnowledgeBaseData | null,
  overrides: Partial<BusinessPlaybook> = {}
): Omit<BusinessPlaybook, 'id' | 'createdAt' | 'updatedAt'> => {
  const services = overrides.servicesJson || knowledge?.services || [];
  const pricingRules = overrides.pricingRulesJson || {
    policy: knowledge?.pricingSettings?.hideAllPrices
      ? 'Do not quote exact prices unless explicitly approved. Push toward consultation.'
      : 'Only share pricing found in approved services or pricing notes.',
    notes: knowledge?.pricing || null,
    defaultCtaText: knowledge?.pricingSettings?.defaultCtaText || 'Book a consultation',
  };
  const bookingRules = overrides.bookingRulesJson || {
    mode: 'booking_link_or_calendar',
    instructions: 'Collect treatment interest, name, phone/email, and preferred time before booking.',
    businessHours: knowledge?.businessHours || null,
  };
  const followupRules = overrides.followupRulesJson || {
    defaultChannel: 'sms',
    cadence: ['same day', 'next day', '3 days later'],
    stopWhen: ['booked', 'declined', 'do_not_contact'],
  };
  const approvedClaims = overrides.approvedClaimsJson || cleanLines([
    knowledge?.summary,
    ...(knowledge?.topRules?.split('\n') || []),
  ]);
  const blockedClaims = overrides.blockedClaimsJson || [
    'Do not diagnose medical conditions.',
    'Do not promise treatment results.',
    'Do not provide personalized medical advice.',
    'Do not invent pricing, discounts, availability, or policies.',
  ];
  const escalationRules = overrides.escalationRulesJson || [
    'Escalate medical or contraindication questions.',
    'Escalate uncertain pricing or policy questions.',
    'Escalate angry customers and refund requests.',
    'Ask owner approval before sending bulk messages.',
  ];

  const playbook = {
    tenantId,
    vertical: overrides.vertical || 'med_spa',
    status: overrides.status || 'active',
    servicesJson: services,
    pricingRulesJson: pricingRules,
    bookingRulesJson: bookingRules,
    followupRulesJson: followupRules,
    approvedClaimsJson: approvedClaims,
    blockedClaimsJson: blockedClaims,
    escalationRulesJson: escalationRules,
    playbookMarkdown: '',
    sourceSetupSessionId: overrides.sourceSetupSessionId || null,
  } satisfies Omit<BusinessPlaybook, 'id' | 'createdAt' | 'updatedAt'>;

  return {
    ...playbook,
    playbookMarkdown: generatePlaybookMarkdown(playbook, knowledge),
  };
};

export const generatePlaybookMarkdown = (
  playbook: Pick<BusinessPlaybook, 'vertical' | 'servicesJson' | 'pricingRulesJson' | 'bookingRulesJson' | 'followupRulesJson' | 'approvedClaimsJson' | 'blockedClaimsJson' | 'escalationRulesJson'>,
  knowledge?: KnowledgeBaseData | null
): string => {
  const services = (playbook.servicesJson || []).map(service => {
    const details = [formatPrice(service), service.duration ? `${service.duration} min` : '', service.description || '']
      .filter(Boolean)
      .join(' | ');
    return `- ${service.name}${details ? `: ${details}` : ''}`;
  });

  return [
    '# CHIPPY.md',
    '',
    section('Business Identity', [
      `Business: ${knowledge?.companyName || 'Not provided'}`,
      `Website: ${knowledge?.website || 'Not provided'}`,
      `Phone: ${knowledge?.phoneNumber || knowledge?.contactInfo || 'Not provided'}`,
      `Vertical: ${playbook.vertical || 'med_spa'}`,
    ]),
    '',
    section('Services Chippy Can Discuss', services.length ? services : ['- Not provided']),
    '',
    section('Pricing Rules', `\`\`\`json\n${JSON.stringify(playbook.pricingRulesJson || {}, null, 2)}\n\`\`\``),
    '',
    section('Booking Rules', `\`\`\`json\n${JSON.stringify(playbook.bookingRulesJson || {}, null, 2)}\n\`\`\``),
    '',
    section('Follow-Up Playbook', `\`\`\`json\n${JSON.stringify(playbook.followupRulesJson || {}, null, 2)}\n\`\`\``),
    '',
    section('Approved Claims', (playbook.approvedClaimsJson || []).map(item => `- ${item}`)),
    '',
    section('Blocked Claims', (playbook.blockedClaimsJson || []).map(item => `- ${item}`)),
    '',
    section('Escalation Rules', (playbook.escalationRulesJson || []).map(item => `- ${item}`)),
  ].join('\n');
};

export const compilePlaybookMemory = (
  playbook: BusinessPlaybook,
  options: CompileOptions
): BusinessMemorySnapshot => {
  const compiledAt = options.compiledAt || new Date().toISOString();
  const version = options.version ?? 1;
  const bmsText = [
    'BMS',
    `Tenant: ${options.tenantId}`,
    `Vertical: ${playbook.vertical}`,
    `Playbook Updated: ${playbook.updatedAt}`,
    `Compiled At: ${compiledAt}`,
    '',
    playbook.playbookMarkdown,
  ].join('\n');

  return {
    tenantId: options.tenantId,
    version,
    compiledAt,
    bmsText,
    sourceHash: simpleHash(JSON.stringify({
      playbook,
      markdown: playbook.playbookMarkdown,
    })),
  };
};
