import { Service, ServicePricing, KnowledgeBaseData } from '../types';

/**
 * Generates a unique ID for a service
 */
export const generateServiceId = (): string => {
    return `svc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Creates a default pricing object for a service
 */
export const defaultPricing = (): ServicePricing => ({
    type: 'quote',
    currency: 'USD'
});

/**
 * Converts a legacy string array of services to structured Service objects
 */
export const migrateLegacyServices = (legacyServices: string[]): Service[] => {
    return legacyServices.map(name => ({
        id: generateServiceId(),
        name: name.trim(),
        pricing: defaultPricing()
    }));
};

/**
 * Formats a service price for display
 */
export const formatServicePrice = (pricing?: ServicePricing): string => {
    if (!pricing) {
        return 'No price set';
    }

    const currency = pricing.currency || 'USD';
    const symbol = currency === 'USD' ? '$' : currency;

    // Handle quote-based types
    if (pricing.type === 'quote') {
        return 'Request a Quote';
    }

    if (pricing.type === 'negotiable') {
        return 'Contact for pricing';
    }

    if (pricing.type === 'free') {
        return 'Free';
    }

    if (pricing.customText) {
        return pricing.customText;
    }

    if (pricing.amount === undefined || pricing.amount === null) {
        return 'No price set';
    }

    const price = `${symbol}${pricing.amount.toFixed(2)}`;

    switch (pricing.type) {
        case 'fixed':
            return price;
        case 'starting_from':
            return `From ${price}`;
        case 'range':
            if (pricing.maxAmount) {
                return `${price} - ${symbol}${pricing.maxAmount.toFixed(2)}`;
            }
            return `From ${price}`;
        case 'hourly':
            return `${price}/hr`;
        case 'daily':
            return `${price}/day`;
        case 'weekly':
            return `${price}/week`;
        case 'monthly':
            return `${price}/mo`;
        case 'per_unit': {
            const unit = pricing.unitLabel ? pricing.unitLabel.trim() : 'unit';
            return `${price} per ${unit}`;
        }
        default:
            return price;
    }
};

/**
 * Checks if a service has valid pricing
 */
export const hasValidPricing = (service: Service): boolean => {
    if (!service.pricing) return false;
    if (service.pricing.type === 'quote' || service.pricing.type === 'negotiable') return true;
    if (service.pricing.type === 'free') return true;
    if (service.pricing.customText) return true;
    return service.pricing.amount !== undefined && service.pricing.amount !== null;
};

/**
 * Normalizes KnowledgeBaseData to ensure services are in new format
 * Handles migration from legacy string[] format
 */
export const normalizeKnowledgeData = (data: KnowledgeBaseData): KnowledgeBaseData => {
    // If services is already an array of Service objects, return as-is
    if (data.services && data.services.length > 0 && typeof data.services[0] === 'object') {
        return data;
    }

    // If services is a string array (legacy), migrate it
    if (data.services && data.services.length > 0 && typeof data.services[0] === 'string') {
        const legacyServices = data.services as unknown as string[];
        return {
            ...data,
            legacyServices: legacyServices,
            services: migrateLegacyServices(legacyServices)
        };
    }

    // If no services, return with empty array
    return {
        ...data,
        services: []
    };
};

/**
 * Creates a new empty service
 */
export const createEmptyService = (): Service => ({
    id: generateServiceId(),
    name: '',
    pricing: defaultPricing()
});
