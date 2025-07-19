# Custom Domain Setup - quikpik.app

## Step 1: Domain Configuration in Replit Deployment

1. **Deploy your application** in Replit Deployments
2. **Add custom domain** in Replit deployment settings:
   - Go to your deployment dashboard
   - Navigate to "Custom Domains" section
   - Add domain: `quikpik.app`
   - Add subdomain: `www.quikpik.app` (optional)

## Step 2: DNS Configuration

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

Set these environment variables in your Replit deployment:

```
CUSTOM_DOMAIN=quikpik.app
GOOGLE_OAUTH_REDIRECT_URI=https://quikpik.app/api/auth/google/callback
```

## Step 4: Google Cloud Console OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add these Authorized redirect URIs:
   ```
   https://quikpik.app/api/auth/google/callback
   https://www.quikpik.app/api/auth/google/callback
   ```

## Step 5: Update Customer Portal Links

With your custom domain, customer portal links will be:
```
https://quikpik.app/customer/{wholesaler-id}
https://quikpik.app/customer/{wholesaler-id}?featured={product-id}
```

## Step 6: SSL Certificate

Replit Deployments automatically provides SSL certificates for custom domains. No additional configuration needed.

## Verification Steps

1. **Test OAuth**: Visit `https://quikpik.app/login` and verify Google sign-in works
2. **Test Customer Portal**: Visit a customer portal link and verify authentication flow
3. **Check SSL**: Ensure `https://quikpik.app` shows secure connection

## Troubleshooting

- **OAuth Error**: Ensure redirect URI is added to Google Cloud Console
- **Domain not working**: Check DNS propagation (can take up to 48 hours)
- **SSL Issues**: Contact Replit support if SSL certificate doesn't auto-provision

Your Quikpik platform will be accessible at: **https://quikpik.app**