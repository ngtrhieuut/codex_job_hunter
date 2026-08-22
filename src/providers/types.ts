import type { RawOpportunityRecord } from '@/src/domain/types';

export interface ProviderContext {
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface OpportunityProvider {
  readonly name: string;
  discover(context?: ProviderContext): Promise<RawOpportunityRecord[]>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, OpportunityProvider>();

  register(provider: OpportunityProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): OpportunityProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider is not registered: ${name}`);
    return provider;
  }
}
