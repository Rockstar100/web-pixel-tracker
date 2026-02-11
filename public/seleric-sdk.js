;(function (window) {
  /**
   * Lightweight Seleric tracking SDK for non-Shopify sites.
   * Mirrors the Shopify Web Pixel payload shape and sends events
   * to /api/ingest.pixel using the same NormalizedEvent pipeline.
   */

  var endpoint = null
  var shopDomain = null
  var sessionIdKey = '_seleric_sid'

  function generateSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  }

  function getSessionId() {
    try {
      var existing = window.localStorage.getItem(sessionIdKey)
      if (existing && existing.trim().length > 0) return existing
      var sid = generateSessionId()
      window.localStorage.setItem(sessionIdKey, sid)
      return sid
    } catch (e) {
      return generateSessionId()
    }
  }

  function resolveEndpoint() {
    if (!endpoint) return null
    if (endpoint.indexOf('http://') === 0 || endpoint.indexOf('https://') === 0) {
      return endpoint
    }
    if (endpoint.charAt(0) === '/') {
      return window.location.origin + endpoint
    }
    return 'https://' + endpoint
  }

  function buildPixelPayload(eventName, data) {
    var doc = window.document
    var loc = window.location

    return {
      id: generateSessionId(),
      name: eventName,
      timestamp: new Date().toISOString(),
      clientId: getSessionId(),
      shopDomain: shopDomain || loc.hostname,
      context: {
        document: {
          location: {
            href: loc.href,
            hostname: loc.hostname,
            pathname: loc.pathname,
            search: loc.search
          },
          referrer: doc.referrer || '',
          title: doc.title || ''
        },
        window: {
          location: {
            href: loc.href
          }
        }
      },
      data: data || {}
    }
  }

  async function send(eventName, data) {
    var url = resolveEndpoint()
    if (!url) {
      if (window.console && console.error) {
        console.error('[Seleric SDK] Missing endpoint; call seleric.init({ endpoint }) first.')
      }
      return
    }

    var payload = buildPixelPayload(eventName, data)
    var fullUrl = url + '?data=' + encodeURIComponent(JSON.stringify(payload))

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        navigator.sendBeacon(url, blob)
      } else {
        await fetch(fullUrl, {
          method: 'GET',
          mode: 'no-cors',
          keepalive: true
        })
      }
    } catch (e) {
      if (window.console && console.error) {
        console.error('[Seleric SDK] Failed to send event', e)
      }
    }
  }

  var api = {
    init: function (options) {
      options = options || {}
      endpoint = options.endpoint || '/api/ingest.pixel'
      shopDomain = options.shopDomain || window.location.hostname
    },
    track: function (eventName, data) {
      return send(eventName, data || {})
    },
    pageView: function () {
      return send('page_viewed', {})
    },
    purchase: function (order) {
      order = order || {}
      return send('checkout_completed', {
        checkout: {
          order: { id: order.id },
          totalPrice: { amount: order.value, currencyCode: order.currency },
          lineItems: order.items || []
        }
      })
    }
  }

  window.seleric = api
})(window);


