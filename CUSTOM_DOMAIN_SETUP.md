# Custom Domain Setup - quikpik.app

## Current Situation: Domain Transfer from Webflow

Since `quikpik.app` is currently with Webflow, here are your options:

### Option 1: Use Subdomain (Immediate)
- Use: `app.quikpik.app` or `platform.quikpik.app`
- No transfer needed - just add DNS record
- Can switch to main domain later

### Option 2: Full Domain Transfer (Later)
- Transfer `quikpik.app` from Webflow to your registrar
- Then follow full setup below

## Step 1: Domain Configuration in Replit Deployment

**For Subdomain (Immediate):**
1. **Deploy your application** in Replit Deployments
2. **Add custom domain** in Replit deployment settings:
   - Add subdomain: `app.quikpik.app`

**For Main Domain (After Transfer):**
1. **Deploy your application** in Replit Deployments
2. **Add custom domain** in Replit deployment settings:
   - Add domain: `quikpik.app`
   - Add subdomain: `www.quikpik.app` (optional)

## Step 2: DNS Configuration

**For Subdomain (Immediate):**
Configure DNS record at quikpik.app registrar:
```
Type: CNAME
Name: app
Value: your-replit-deployment-url.replit.app
```

**For Main Domain (After Transfer):**
Configure your DNS records at your domain registrar:
```
Type: CNAME
Name: @ (or root)
Value: your-replit-deployment-url.replit.app

Type: CNAME  
Name: www
Value: your-replit-deployment-url.replit.app
```

## Step 3: Environment Variables

**For Subdomain (Immediate):**
```
CUSTOM_DOMAIN=app.quikpik.app
GOOGLE_OAUTH_REDIRECT_URI=https://app.quikpik.app/api/auth/google/callback
```

**For Main Domain (After Transfer):**
```
CUSTOM_DOMAIN=quikpik.app
GOOGLE_OAUTH_REDIRECT_URI=https://quikpik.app/api/auth/google/callback
```

## Step 4: Google Cloud Console OAuth Setup

**For Subdomain (Immediate):**
Add redirect URI: `https://app.quikpik.app/api/auth/google/callback`

**For Main Domain (After Transfer):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add these Authorized redirect URIs:
   ```
   https://quikpik.app/api/auth/google/callback
   https://www.quikpik.app/api/auth/google/callback
   ```

## Step 5: Update Customer Portal Links

**For Subdomain (Immediate):**
Customer portal links will be:
```
https://app.quikpik.app/customer/{wholesaler-id}
https://app.quikpik.app/customer/{wholesaler-id}?featured={product-id}
```

**For Main Domain (After Transfer):**
Customer portal links will be:
```
https://quikpik.app/customer/{wholesaler-id}
https://quikpik.app/customer/{wholesaler-id}?featured={product-id}
```

## Domain Transfer Process from Webflow

1. **Initiate Transfer**: Contact Webflow support to unlock domain
2. **Get Auth Code**: Request domain authorization code from Webflow
3. **Transfer Domain**: Move to your preferred registrar (Namecheap, GoDaddy, etc.)
4. **Update DNS**: Point to Replit deployment
5. **Switch Environment Variables**: Change from subdomain to main domain

## SSL Certificate

Replit Deployments automatically provides SSL certificates for custom domains.

## Verification Steps

**For Subdomain:**
1. **Test OAuth**: Visit `https://app.quikpik.app/login`
2. **Test Customer Portal**: Visit customer portal link
3. **Check SSL**: Ensure secure connection

**For Main Domain:**
1. **Test OAuth**: Visit `https://quikpik.app/login`
2. **Test Customer Portal**: Visit customer portal link
3. **Check SSL**: Ensure secure connection

## Immediate Recommendation

**Start with subdomain `app.quikpik.app`** while you transfer the main domain:

1. Deploy with subdomain configuration
2. Add DNS record for `app` subdomain
3. Launch platform at `https://app.quikpik.app`
4. Transfer main domain in parallel
5. Switch to main domain once transfer completes

This approach lets you launch immediately while handling the domain transfer.