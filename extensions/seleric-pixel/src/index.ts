import { register } from "@shopify/web-pixels-extension";

/**
 * Seleric Tracker Web Pixel Extension
 * Captures client-side events and forwards to server for Umami tracking
 */
register(({ analytics, browser, init, settings }) => {
  // Configuration from app settings
  const config = {
    serverEndpoint: settings.serverEndpoint || '/api/ingest/pixel',
    enableDebug: settings.enableDebug || false,
  };

  // Session management
  let sessionId: string | null = null;

  /**
   * Initialize session ID
   */
  function initSession() {
    try {
      sessionId = browser.cookie.get('_seleric_sid');
      if (!sessionId) {
        sessionId = generateSessionId();
        browser.cookie.set('_seleric_sid', sessionId, {
          expires: 1800 // 30 minutes
        });
      }
    } catch (error) {
      console.error('[Seleric] Failed to init session:', error);
      sessionId = generateSessionId();
    }
  }

  /**
   * Generate unique session ID
   */
  function generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send event to server
   */
  async function sendEvent(eventName: string, eventData: any, context: any) {
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: eventName,
      timestamp: new Date().toISOString(),
      clientId: sessionId,
      context: {
        document: {
          location: {
            href: context.document?.location?.href,
            hostname: context.document?.location?.hostname,
            pathname: context.document?.location?.pathname,
            search: context.document?.location?.search,
          },
          referrer: context.document?.referrer,
          title: context.document?.title,
        },
        window: {
          location: {
            href: context.window?.location?.href,
          },
        },
      },
      data: eventData,
    };

    if (config.enableDebug) {
      console.log('[Seleric] Sending event:', payload);
    }

    try {
      await fetch(config.serverEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true, // Important for events sent during page unload
      });
    } catch (error) {
      console.error('[Seleric] Failed to send event:', error);
    }
  }

  /**
   * Subscribe to all relevant Shopify events
   */
  function subscribeToEvents() {
    // Page view
    analytics.subscribe('page_viewed', async (event) => {
      await sendEvent('page_viewed', event.data, event.context);
    });

    // Product view
    analytics.subscribe('product_viewed', async (event) => {
      await sendEvent('product_viewed', {
        product: event.data?.productVariant?.product,
        variant: event.data?.productVariant,
      }, event.context);
    });

    // Collection view
    analytics.subscribe('collection_viewed', async (event) => {
      await sendEvent('collection_viewed', {
        collection: event.data?.collection,
      }, event.context);
    });

    // Search
    analytics.subscribe('search_submitted', async (event) => {
      await sendEvent('search_submitted', {
        searchQuery: event.data?.searchResult?.query,
      }, event.context);
    });

    // Add to cart
    analytics.subscribe('product_added_to_cart', async (event) => {
      await sendEvent('product_added_to_cart', {
        cartLine: event.data?.cartLine,
        cart: {
          id: event.data?.cart?.id,
          lines_count: event.data?.cart?.lines?.length,
          total: event.data?.cart?.cost?.totalAmount,
        },
      }, event.context);
    });

    // Remove from cart
    analytics.subscribe('product_removed_from_cart', async (event) => {
      await sendEvent('product_removed_from_cart', {
        cartLine: event.data?.cartLine,
        cart: {
          id: event.data?.cart?.id,
          lines_count: event.data?.cart?.lines?.length,
          total: event.data?.cart?.cost?.totalAmount,
        },
      }, event.context);
    });

    // Cart viewed
    analytics.subscribe('cart_viewed', async (event) => {
      await sendEvent('cart_viewed', {
        cart: {
          id: event.data?.cart?.id,
          lines_count: event.data?.cart?.lines?.length,
          total: event.data?.cart?.cost?.totalAmount,
        },
      }, event.context);
    });

    // Checkout started
    analytics.subscribe('checkout_started', async (event) => {
      await sendEvent('checkout_started', {
        checkout: {
          token: event.data?.checkout?.token,
          order: event.data?.checkout?.order,
          totalPrice: event.data?.checkout?.totalPrice,
          subtotalPrice: event.data?.checkout?.subtotalPrice,
          currencyCode: event.data?.checkout?.currencyCode,
          lineItems: event.data?.checkout?.lineItems?.map((item: any) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      }, event.context);
    });

    // Checkout address info submitted
    analytics.subscribe('checkout_address_info_submitted', async (event) => {
      await sendEvent('checkout_address_info_submitted', {
        checkout_id: event.data?.checkout?.token,
      }, event.context);
    });

    // Payment info submitted
    analytics.subscribe('payment_info_submitted', async (event) => {
      await sendEvent('payment_info_submitted', {
        checkout_id: event.data?.checkout?.token,
      }, event.context);
    });

    // Checkout completed (conversion)
    analytics.subscribe('checkout_completed', async (event) => {
      await sendEvent('checkout_completed', {
        checkout: {
          token: event.data?.checkout?.token,
          order: event.data?.checkout?.order,
          totalPrice: event.data?.checkout?.totalPrice,
          currencyCode: event.data?.checkout?.currencyCode,
          lineItems: event.data?.checkout?.lineItems?.map((item: any) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
        },
        order_id: event.data?.checkout?.order?.id,
        total_price: event.data?.checkout?.totalPrice?.amount,
      }, event.context);
    });
  }

  // Initialize
  init(() => {
    if (config.enableDebug) {
      console.log('[Seleric] Pixel initialized');
    }
    
    initSession();
    subscribeToEvents();
  });
});
