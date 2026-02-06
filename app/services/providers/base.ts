import type { NormalizedEvent } from '../types';

/**
 * Base interface for payment provider connectors
 */
export interface PaymentProvider {
  name: string;
  
  /**
   * Verify webhook signature/authenticity
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
  
  /**
   * Normalize provider webhook to NormalizedEvent
   */
  normalizeWebhook(payload: any, shop: string, brandId: string): NormalizedEvent | null;
  
  /**
   * Get provider-specific configuration schema
   */
  getConfigSchema(): Record<string, any>;
}

/**
 * Provider connector registry
 */
export class ProviderRegistry {
  private static providers: Map<string, PaymentProvider> = new Map();
  
  /**
   * Register a payment provider
   */
  static register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }
  
  /**
   * Get a provider by name
   */
  static get(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }
  
  /**
   * Get all registered providers
   */
  static getAll(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Check if provider is registered
   */
  static has(name: string): boolean {
    return this.providers.has(name);
  }
}
