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
    type: 'contact',
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
export const formatServicePrice = (pricing: ServicePricing): string => {
    const currency = pricing.currency || 'USD';
    const symbol = currency === 'USD' ? '$' : currency;

    if (pricing.type === 'contact') {
        return 'Contact for quote';
    }

    if (pricing.type === 'custom' && pricing.customText) {
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
            return `Starting from ${price}`;
        case 'hourly':
            return `${price}/hr`;
        case 'per_session':
            return `${price} per session`;
        case 'per_project':
            return `${price} per project`;
        case 'per_day':
            return `${price} per day`;
        case 'per_week':
            return `${price} per week`;
        case 'per_month':
            return `${price} per month`;
        case 'subscription': {
            const unit = pricing.unitLabel ? pricing.unitLabel.trim() : 'month';
            return `${price} per ${unit}`;
        }
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
    if (service.pricing.type === 'contact') return true;
    if (service.pricing.type === 'custom' && service.pricing.customText) return true;
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
