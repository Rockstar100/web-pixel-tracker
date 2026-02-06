-- Migration: Create initial tables for Seleric Tracker

-- Create Brand table
CREATE TABLE IF NOT EXISTS Brand (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  umamiWebsiteUuid TEXT NOT NULL UNIQUE,
  domains TEXT NOT NULL,
  defaultCurrency TEXT NOT NULL DEFAULT 'USD',
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create ShopConfig table
CREATE TABLE IF NOT EXISTS ShopConfig (
  id TEXT PRIMARY KEY,
  shopifyShop TEXT NOT NULL UNIQUE,
  brandId TEXT NOT NULL,
  umamiEndpoint TEXT NOT NULL DEFAULT 'https://umami.seleric.cloud/api/send',
  dataWebsiteId TEXT,
  pixelEnabled INTEGER NOT NULL DEFAULT 1,
  webhookEnabled INTEGER NOT NULL DEFAULT 1,
  consentMode TEXT NOT NULL DEFAULT 'relaxed',
  requireConsent INTEGER NOT NULL DEFAULT 0,
  providerSettings TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brandId) REFERENCES Brand(id) ON DELETE CASCADE
);

-- Create EventReceived table
CREATE TABLE IF NOT EXISTS EventReceived (
  id TEXT PRIMARY KEY,
  shopConfigId TEXT NOT NULL,
  eventKey TEXT NOT NULL UNIQUE,
  eventType TEXT NOT NULL,
  eventSource TEXT NOT NULL,
  shopifyOrderId TEXT,
  shopifyCheckoutId TEXT,
  eventName TEXT NOT NULL,
  eventData TEXT NOT NULL,
  processedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  forwardedToUmami INTEGER NOT NULL DEFAULT 0,
  umamiResponse TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopConfigId) REFERENCES ShopConfig(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_shop_type ON EventReceived(shopConfigId, eventType);
CREATE INDEX IF NOT EXISTS idx_event_order ON EventReceived(shopifyOrderId);
CREATE INDEX IF NOT EXISTS idx_event_processed ON EventReceived(processedAt);

-- Create Attribution table
CREATE TABLE IF NOT EXISTS Attribution (
  id TEXT PRIMARY KEY,
  shopConfigId TEXT NOT NULL,
  sessionId TEXT,
  customerHash TEXT,
  orderId TEXT,
  utmSource TEXT,
  utmMedium TEXT,
  utmCampaign TEXT,
  utmTerm TEXT,
  utmContent TEXT,
  firstTouch INTEGER NOT NULL DEFAULT 0,
  landingPage TEXT,
  referrer TEXT,
  capturedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shopConfigId) REFERENCES ShopConfig(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attr_customer ON Attribution(customerHash);
CREATE INDEX IF NOT EXISTS idx_attr_order ON Attribution(orderId);
CREATE INDEX IF NOT EXISTS idx_attr_session ON Attribution(sessionId);

-- Create ProviderConnector table
CREATE TABLE IF NOT EXISTS ProviderConnector (
  id TEXT PRIMARY KEY,
  shopifyShop TEXT NOT NULL,
  providerName TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  webhookSecret TEXT,
  apiKey TEXT,
  config TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shopifyShop, providerName)
);

-- Create HealthLog table
CREATE TABLE IF NOT EXISTS HealthLog (
  id TEXT PRIMARY KEY,
  shopifyShop TEXT NOT NULL,
  component TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_shop_time ON HealthLog(shopifyShop, timestamp);
CREATE INDEX IF NOT EXISTS idx_health_component ON HealthLog(component, status);

-- Insert sample brand (for testing)
INSERT OR IGNORE INTO Brand (id, name, umamiWebsiteUuid, domains, defaultCurrency, enabled)
VALUES (
  'sample-brand-id',
  'Sample Brand',
  '7dbcf6c8-7c5f-4008-a662-9ac7c3e34cec',
  '["example.com"]',
  'USD',
  1
);
