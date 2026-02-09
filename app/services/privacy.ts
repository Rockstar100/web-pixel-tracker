import type { NormalizedEvent, ShopConfigData } from './types';

/**
 * Privacy and consent handling service
 * Manages customer data privacy and analytics consent
 */
export class PrivacyManager {
  /**
   * Check if event should be tracked based on consent settings
   */
  static shouldTrackEvent(
    event: NormalizedEvent,
    shopConfig: ShopConfigData,
    hasConsent: boolean = true
  ): boolean {
    // If consent not required, always track
    if (!shopConfig.requireConsent) {
      return true;
    }

    // In strict mode, require explicit consent
    if (shopConfig.consentMode === 'strict' && !hasConsent) {
      return false;
    }

    // In relaxed mode, track anonymous events even without consent
    if (shopConfig.consentMode === 'relaxed') {
      // Track events without customer identifiers
      return true;
    }

    return hasConsent;
  }

  /**
   * Anonymize event data for privacy compliance
   */
  static anonymizeEvent(event: NormalizedEvent): NormalizedEvent {
    const anonymized = { ...event };

    // Remove customer identity
    delete anonymized.customerHash;
    delete anonymized.sessionId;

    // Remove sensitive data
    if (anonymized.data) {
      const data = { ...anonymized.data };
      
      // Remove PII fields
      delete data.email;
      delete data.phone;
      delete data.first_name;
      delete data.last_name;
      delete data.customer;
      delete data.billing_address;
      delete data.shipping_address;

      anonymized.data = data;
    }

    return anonymized;
  }

  /**
   * Determine if event contains PII that requires consent
   */
  static containsPII(event: NormalizedEvent): boolean {
    if (event.customerHash) return true;
    if (event.sessionId) return true;

    if (event.data) {
      const piiFields = [
        'email', 'phone', 'first_name', 'last_name',
        'customer', 'billing_address', 'shipping_address'
      ];

      return piiFields.some(field => field in event.data!);
    }

    return false;
  }

  /**
   * Apply privacy policy to event based on consent and config
   */
  static applyPrivacyPolicy(
    event: NormalizedEvent,
    shopConfig: ShopConfigData,
    hasConsent: boolean = true
  ): NormalizedEvent | null {
    // Check if we should track this event at all
    if (!this.shouldTrackEvent(event, shopConfig, hasConsent)) {
      return null;
    }

    // If no consent and event contains PII, anonymize it
    if (!hasConsent && this.containsPII(event)) {
      return this.anonymizeEvent(event);
    }

    // Track as-is with consent
    return event;
  }

  /**
   * Get consent status from Shopify's customer privacy API
   * (This would integrate with Shopify's Customer Privacy API)
   */
  static async getConsentStatus(
    _shopDomain: string,
    _sessionId?: string
  ): Promise<{
    analytics: boolean;
    marketing: boolean;
    preferences: boolean;
  }> {
    void _shopDomain;
    void _sessionId;
    // TODO: Integrate with Shopify Customer Privacy API
    // For now, return default permissive consent
    return {
      analytics: true,
      marketing: false,
      preferences: true
    };
  }

  /**
   * Create a privacy-compliant event data payload
   */
  static createPrivatePayload(
    event: NormalizedEvent,
    includeIdentity: boolean = true
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      event_type: event.type,
      timestamp: event.timestamp.toISOString(),
      source: event.source
    };

    // Add transaction data (non-PII)
    if (event.orderId) payload.order_id = event.orderId;
    if (event.value) payload.value = event.value;
    if (event.currency) payload.currency = event.currency;
    if (event.itemsCount) payload.items_count = event.itemsCount;

    // Add UTM (non-PII)
    if (event.utm) {
      Object.entries(event.utm).forEach(([key, value]) => {
        if (value) payload[`utm_${key}`] = value;
      });
    }

    // Add identity only if permitted
    if (includeIdentity) {
      if (event.customerHash) payload.customer_id = event.customerHash;
      if (event.sessionId) payload.session_id = event.sessionId;
    }

    // Add safe event data
    if (event.data) {
      const safeData = this.filterSensitiveData(event.data);
      Object.assign(payload, safeData);
    }

    return payload;
  }

  /**
   * Filter out sensitive data from event payload
   */
  private static filterSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    const sensitiveFields = [
      'email', 'phone', 'first_name', 'last_name',
      'customer', 'billing_address', 'shipping_address',
      'password', 'token', 'api_key'
    ];

    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive fields
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        continue;
      }

      // Include non-sensitive data
      filtered[key] = value;
    }

    return filtered;
  }

  /**
   * Generate privacy policy text for app listing
   */
  static getPrivacyPolicyText(): string {
    return `
Seleric Tracker Privacy Policy

Data Collection:
- We collect anonymized browsing behavior (page views, product views, cart actions)
- Purchase transactions are tracked with order IDs and values (no payment details)
- Customer identifiers are hashed (SHA256) for privacy
- UTM parameters are captured for attribution

Data Usage:
- Analytics data is sent to your Umami Analytics instance
- Data is used solely for business analytics and attribution
- No data is sold or shared with third parties

Data Storage:
- Events stored for 90 days
- Attribution data stored for 180 days
- Customer identifiers are hashed and never stored in plain text

Consent Management:
- Respects Shopify customer privacy preferences
- Supports GDPR and privacy regulations
- Opt-out available via shop settings

Data Security:
- All data transmitted over HTTPS
- SHA256 hashing for customer identifiers
- No sensitive PII stored

Your Rights:
- Access your analytics data via Umami dashboard
- Request data deletion through shop admin
- Opt-out of tracking in shop settings
    `.trim();
  }
}
