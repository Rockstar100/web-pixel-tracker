# Pixel Activation Guide: webPixelCreate Mutation

This document explains how the web pixel activation works and troubleshooting steps.

## Overview

The Shopify Web Pixel Extension must be **activated** (created) on each store for event tracking to work. This is done via the `webPixelCreate` GraphQL mutation, which registers your pixel extension with Shopify's pixel system.

### What Happens During Activation

1. Your app calls `webPixelCreate` mutation with Admin API access token
2. Shopify registers the pixel extension on the store
3. The pixel appears in **Settings → Customer events → App pixels**
4. Status changes from "Disconnected" to "Connected"
5. Shopify injects your pixel's JavaScript on the storefront
6. Events start flowing to your ingestion endpoint

## Automatic Activation (Recommended)

The Seleric Tracker automatically activates the pixel when:

1. User completes OAuth and authenticates your app
2. The `auth.$.tsx` loader runs on first visit after authentication
3. It checks if a pixel already exists using `webPixels` query
4. If not, it creates one via `webPixelCreate` mutation
5. If one exists, it updates the settings via `webPixelUpdate` mutation

### How to Trigger Automatic Activation

1. **Install the app on a development store:**
   ```bash
   npm run dev --tunnel-url https://your-tunnel.ngrok-free.dev
   ```

2. **Complete OAuth:**
   - You'll be redirected to Shopify login
   - Select a development store
   - Click "Install app"
   - The activation happens automatically

3. **Verify success:**
   - You're redirected to the app
   - Check server logs for "Web pixel creation returned errors" (if any)
   - Go to Shopify Admin → Settings → Customer events → App pixels
   - "Seleric-Tracker" should show as **Connected**

## Pixel Settings

When the pixel is created, it receives these settings from your app:

```json
{
  "serverEndpoint": "https://your-tunnel.ngrok-free.dev/api/ingest/pixel",
  "enableDebug": false
}
```

These settings are:
- Set in `auth.$.tsx` when creating/updating the pixel
- Passed to the pixel extension at runtime
- Accessible via `settings` object in the pixel code
- Updated automatically when you deploy new versions

### Updating Pixel Settings

If you need to change settings (e.g., disable debug logging):

#### Option 1: Update Automatically (Recommended)

1. Modify the settings in `auth.$.tsx`:
   ```typescript
   const settings = {
     serverEndpoint: `${appUrl}/api/ingest/pixel`,
     enableDebug: false,  // Change this
   };
   ```

2. Deploy the app:
   ```bash
   shopify app deploy
   ```

3. The pixel will be updated on next store load

#### Option 2: Manual Update via GraphQL

1. In Shopify Admin → **Apps and integrations** → **Develop apps** → Your app
2. Click **GraphiQL app**
3. Run this mutation:

```graphql
mutation UpdateWebPixel($id: ID!, $settings: JSON!) {
  webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
    webPixel {
      id
      settings
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "id": "gid://shopify/WebPixel/12345",
  "settings": {
    "serverEndpoint": "https://your-app.com/api/ingest/pixel",
    "enableDebug": false
  }
}
```

## Manual Activation

If automatic activation doesn't work, you can manually create the pixel:

### Find Your Pixel ID (if needed)

1. In GraphQL app, query existing pixels:

```graphql
query ListWebPixels {
  webPixels(first: 10) {
    nodes {
      id
      settings
      createdAt
    }
  }
}
```

### Create a New Pixel

```graphql
mutation CreateWebPixel($settings: JSON!) {
  webPixelCreate(webPixel: { settings: $settings }) {
    webPixel {
      id
      settings
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "settings": {
    "serverEndpoint": "https://your-tunnel.ngrok-free.dev/api/ingest/pixel",
    "enableDebug": false
  }
}
```

**Response (success):**
```json
{
  "data": {
    "webPixelCreate": {
      "webPixel": {
        "id": "gid://shopify/WebPixel/123456789",
        "settings": {
          "serverEndpoint": "https://your-tunnel.ngrok-free.dev/api/ingest/pixel",
          "enableDebug": false
        }
      },
      "userErrors": []
    }
  }
}
```

## Troubleshooting Pixel Activation

### Issue: Pixel Shows "Disconnected" After Installation

#### Cause 1: Activation Didn't Run

**Symptoms:**
- Pixel exists in list but shows "Disconnected"
- No logs in `auth.$.tsx` about pixel creation

**Solution:**

1. Clear browser cookies
2. Log out of Shopify Admin
3. Log in again
4. The auth.$.tsx loader should run again
5. Check server logs for pixel creation attempt

#### Cause 2: Wrong Endpoint URL

**Symptoms:**
- Pixel shows "Connected" but no events received
- Pixel Helper shows red error: "Network error"

**Solution:**

1. Verify `SHOPIFY_APP_URL` is set correctly:
   ```bash
   echo $SHOPIFY_APP_URL
   # Should output: https://your-tunnel.ngrok-free.dev
   ```

2. Check pixel settings in Shopify:
   - Admin → Customer events → App pixels
   - Click pixel name
   - Verify `serverEndpoint` shows correct URL

3. Test endpoint manually:
   ```bash
   curl -X POST https://your-tunnel.ngrok-free.dev/api/ingest/pixel \
     -H "Content-Type: application/json" \
     -H "X-Shopify-Shop-Domain: yourstore.myshopify.com" \
     -d '{"name":"page_viewed","timestamp":"2024-01-01T00:00:00Z"}'
   ```

4. If curl fails, the issue is with tunnel/endpoint
5. If curl succeeds, the issue is with pixel configuration

#### Cause 3: Missing write_pixels Scope

**Symptoms:**
- webPixelCreate mutation fails with "Insufficient permissions"
- Server logs show scope error

**Solution:**

1. Verify scopes in `shopify.app.toml`:
   ```toml
   [access_scopes]
   scopes = "read_products,read_orders,read_customers,read_customer_events,write_pixels"
   ```

2. Must include `write_pixels`

3. If you added the scope after installation:
   - Uninstall app from dev store
   - Clear browser cache
   - Reinstall app
   - Scope request will appear

#### Cause 4: Extension Not Found

**Symptoms:**
- webPixelCreate fails with "No extension found for the given app"

**Solution:**

1. Verify extension exists:
   ```bash
   ls -la extensions/seleric-pixel/
   # Should contain src/ and shopify.extension.toml
   ```

2. Verify extension built:
   ```bash
   shopify app build --extension-flavor=development
   ```

3. Check extension configuration in `shopify.extension.toml`:
   ```toml
   type = "web_pixel_extension"
   name = "Seleric-pixel"
   ```

4. Verify extension is included in app deployment

### Issue: webPixelCreate Returns UserErrors

#### Error: "Field 'settings' is required"

**Cause:** Settings object is null or undefined

**Solution:**
```typescript
// Ensure settings is a valid JSON object
const settings = {
  serverEndpoint: config.serverEndpoint,
  enableDebug: false
};

// Pass as variable, not inline
await admin.graphql(query, { variables: { settings } });
```

#### Error: "Invalid value for setting"

**Cause:** Setting value type doesn't match schema

**Solution:**

1. Check extension settings schema in `shopify.extension.toml`
2. Verify setting values match defined types:
   ```toml
   [settings.fields.serverEndpoint]
   type = "single_line_text_field"  # String only
   
   [settings.fields.enableDebug]
   type = "single_line_text_field"  # Should be "true" or "false" string
   ```

3. Ensure values are correct type:
   ```typescript
   const settings = {
     serverEndpoint: "https://example.com/api/ingest/pixel",  // String ✓
     enableDebug: "false"  // String "false", not boolean false ✓
   };
   ```

#### Error: "This app is not associated with an extension"

**Cause:** Extension not properly registered with app

**Solution:**

1. Regenerate extension:
   ```bash
   shopify extension create --name seleric-pixel --type web_pixel_extension
   ```

2. Or ensure extension UID exists and is unique:
   ```toml
   uid = "ce7f9021-9dff-1e3e-ee0d-0e249d4b3a03972b8d7f"
   ```

### Issue: Pixel Shows Connected but Events Not Tracked

#### Check 1: Pixel is Active

1. In Shopify Admin → Customer events → App pixels
2. Click pixel name
3. Click **Test** button
4. Pixel Helper overlay should appear
5. Navigate store - events should show in Pixel Helper

#### Check 2: serverEndpoint is Correct

1. Open browser DevTools → Network tab
2. Look for POST requests to your endpoint
3. Should see requests like:
   ```
   POST https://your-tunnel/api/ingest/pixel
   Status: 200
   ```

4. If requests don't appear:
   - serverEndpoint might be wrong
   - CORS might be blocking
   - JavaScript error in pixel code

#### Check 3: Events are Being Captured

1. Check database:
   ```sql
   SELECT COUNT(*) FROM "EventReceived";
   ```

2. If count is 0:
   - Pixel events aren't firing
   - Refresh page with Pixel Helper open
   - Verify green checkmark appears

3. If count > 0:
   - Events are being received
   - Check Umami forwarding logs

## API Reference

### webPixelCreate Mutation

```graphql
mutation CreateWebPixel($input: WebPixelInput!) {
  webPixelCreate(webPixel: $input) {
    webPixel {
      id
      settings
      createdAt
      updatedAt
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input:**
```graphql
input WebPixelInput {
  settings: JSON!
  # settings is a JSON object with your pixel's configuration
}
```

**Response:**
```graphql
type WebPixel {
  id: ID!
  settings: JSON!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type UserError {
  field: [String!]
  message: String!
}
```

### webPixelUpdate Mutation

```graphql
mutation UpdateWebPixel($id: ID!, $input: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $input) {
    webPixel {
      id
      settings
      updatedAt
    }
    userErrors {
      field
      message
    }
  }
}
```

### webPixels Query

```graphql
query ListWebPixels($first: Int!) {
  webPixels(first: $first) {
    nodes {
      id
      settings
      createdAt
      updatedAt
    }
  }
}
```

## Testing Pixel Activation

### Test 1: Automatic Activation

1. **Start dev server:**
   ```bash
   npm run dev --tunnel-url https://your-tunnel.ngrok-free.dev
   ```

2. **Complete OAuth:**
   - Browser opens Shopify login
   - Select development store
   - Click "Install app"

3. **Verify:**
   - Check server logs for "Web pixel" messages
   - Go to Shopify Admin → Settings → Customer events → App pixels
   - "Seleric-Tracker" should show **Connected**

### Test 2: Manual Activation

1. **Get pixel ID:**
   ```graphql
   query {
     webPixels(first: 1) {
       nodes {
         id
       }
     }
   }
   ```

2. **Update pixel settings:**
   ```graphql
   mutation {
     webPixelUpdate(
       id: "gid://shopify/WebPixel/YOUR_ID"
       webPixel: {
         settings: {
           serverEndpoint: "https://new-endpoint/api/ingest/pixel"
           enableDebug: true
         }
       }
     ) {
       webPixel {
         id
         settings
       }
       userErrors {
         field
         message
       }
     }
   }
   ```

3. **Verify update:**
   - Refresh page
   - Check Pixel Helper sees updated settings
   - New requests should go to updated endpoint

## Code Reference

The automatic activation code is in `app/routes/auth.$.tsx`:

```typescript
// Runs on first load after authentication
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // Build endpoint URL
  const serverEndpoint = `${appUrl}/api/ingest/pixel`;
  
  // Ensure pixel is created/updated
  await ensureWebPixel(admin, serverEndpoint);
  
  return null;
};

async function ensureWebPixel(admin, serverEndpoint) {
  // Check if pixel already exists
  const existingPixelId = await getExistingWebPixelId(admin);
  
  if (existingPixelId) {
    // Update existing pixel
    await updateWebPixel(admin, existingPixelId, {
      serverEndpoint,
      enableDebug: false
    });
  } else {
    // Create new pixel
    await createWebPixel(admin, {
      serverEndpoint,
      enableDebug: false
    });
  }
}
```

To customize activation behavior:

1. **Change default settings:** Modify settings object in `ensureWebPixel()`
2. **Disable auto-activation:** Comment out `ensureWebPixel()` call
3. **Add logging:** Insert `console.log()` calls in mutation handlers
4. **Add error handling:** Wrap in try/catch and handle errors

## Next Steps

Once pixel is successfully activated:

1. **Test event flow** - Follow [TESTING_GUIDE.md](TESTING_GUIDE.md)
2. **Monitor events** - Check `EventReceived` table
3. **Verify Umami** - Check events appear in Umami dashboard
4. **Deploy to production** - Use `shopify app deploy`

---

Last updated: 2026-02-09
