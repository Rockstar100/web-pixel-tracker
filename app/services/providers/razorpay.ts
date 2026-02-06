import type { PaymentProvider } from './base';
import type { NormalizedEvent } from '../types';
import crypto from 'crypto';

/**
 * Razorpay payment provider connector
 * Handles Razorpay Magic Checkout and standard checkout webhooks
 */
export class RazorpayProvider implements PaymentProvider {
  name = 'razorpay';

  /**
   * Verify Razorpay webhook signature
   * https://razorpay.com/docs/webhooks/validate-test/
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return expectedSignature === signature;
    } catch {
      return false;
    }
  }

  /**
   * Normalize Razorpay webhook to NormalizedEvent
   */
  normalizeWebhook(
    payload: any,
    shop: string,
    brandId: string
  ): NormalizedEvent | null {
    const event = payload.event;
    const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity;

    if (!entity) {
      return null;
    }

    // Map Razorpay events to normalized events
    let eventName: string;
    let eventType: string;

    switch (event) {
      case 'payment.authorized':
        eventName = 'payment_authorized';
        eventType = 'checkout';
        break;
      case 'payment.captured':
        eventName = 'payment_captured';
        eventType = 'conversion';
        break;
      case 'payment.failed':
        eventName = 'payment_failed';
        eventType = 'checkout';
        break;
      case 'order.paid':
        eventName = 'razorpay_order_paid';
        eventType = 'conversion';
        break;
      default:
        // Ignore other events
        return null;
    }

    // Extract order data
    const value = entity.amount ? entity.amount / 100 : undefined; // Razorpay amounts are in paise
    const currency = entity.currency?.toUpperCase();
    const orderId = entity.order_id || entity.id;

    // Extract customer data
    const email = entity.email || entity.customer_details?.email;
    const customerHash = email ? this.hashEmail(email) : undefined;

    return {
      type: eventType,
      name: eventName,
      shop,
      brandId,
      orderId,
      value,
      currency,
      customerHash,
      timestamp: entity.created_at 
        ? new Date(entity.created_at * 1000) // Razorpay uses Unix timestamp
        : new Date(),
      source: 'provider',
      data: {
        provider: 'razorpay',
        paymentId: entity.id,
        method: entity.method,
        status: entity.status,
        notes: entity.notes,
      },
    };
  }

  /**
   * Get configuration schema
   */
  getConfigSchema(): Record<string, any> {
    return {
      enabled: {
        type: 'boolean',
        label: 'Enable Razorpay Tracking',
        default: false,
      },
      webhookSecret: {
        type: 'string',
        label: 'Webhook Secret',
        description: 'Your Razorpay webhook secret key',
        required: true,
      },
      apiKey: {
        type: 'string',
        label: 'API Key',
        description: 'Razorpay API Key (optional, for future features)',
        required: false,
      },
      trackMagicCheckout: {
        type: 'boolean',
        label: 'Track Magic Checkout',
        description: 'Enable tracking for Razorpay Magic Checkout flows',
        default: true,
      },
    };
  }

  /**
   * Hash email for privacy
   */
  private hashEmail(email: string): string {
    return crypto
      .createHash('sha256')
      .update(email.toLowerCase().trim())
      .digest('hex');
  }
}
