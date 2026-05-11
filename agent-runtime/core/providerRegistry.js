export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(definition) {
    if (!definition?.id) {
      throw new Error('Provider registration requires an id');
    }
    if (typeof definition.create !== 'function') {
      throw new Error(`Provider "${definition.id}" must define a create factory`);
    }

    this.providers.set(definition.id, {
      id: definition.id,
      name: definition.name || definition.id,
      description: definition.description || '',
      defaultModel: definition.defaultModel || null,
      capabilities: definition.capabilities || {},
      create: definition.create,
    });
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  list() {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      defaultModel: provider.defaultModel,
      capabilities: provider.capabilities,
    }));
  }

  async create(id, options = {}) {
    const entry = this.get(id);
    if (!entry) {
      throw new Error(`Unknown provider: ${id}`);
    }

    const client = await entry.create(options);
    if (!client || typeof client.generate !== 'function') {
      throw new Error(`Provider ${id} did not return a valid client`);
    }

    return {
      id: entry.id,
      name: entry.name,
      model: options.model || entry.defaultModel || null,
      capabilities: entry.capabilities,
      client,
    };
  }
}
