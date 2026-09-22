# Identity Provider — Phone + Password POC

Tenant-aware phone + password authentication POC.

## Architecture

React/Vite frontend on Cloud Run -> Node.js/Express backend on Cloud Run -> Google Cloud Identity Platform tenant.

### Registration

Phone -> Twilio Verify OTP -> backend creates a tenant-scoped Identity Platform user -> password is stored by Identity Platform.

Because tenant-level Identity Platform does not expose native phone-number sign-in as a provider, the POC uses the tenant Email/Password provider with an internal deterministic email identifier. The real user-facing identifier remains the phone number. The Identity Platform user also stores the verified phone number in `phoneNumber`.

### Login

Phone + password -> backend looks up the tenant user by phone -> resolves the internal email -> Identity Platform `signInWithPassword` with the tenant ID -> ID token returned.

No Firestore user/password store is used.

## Required backend configuration

- `IDENTITY_PLATFORM_TENANT_ID`
- `IDENTITY_PLATFORM_API_KEY` (Secret Manager)
- `OTP_SESSION_SECRET` (Secret Manager)
- `TWILIO_ACCOUNT_SID` (Secret Manager)
- `TWILIO_AUTH_TOKEN` (Secret Manager)
- `TWILIO_VERIFY_SERVICE_SID` (Secret Manager)

## CI/CD

GitHub Actions deploys both services to Cloud Run using Workload Identity Federation (WIF). No service-account JSON key is stored in GitHub.

Required GitHub Actions secrets:
- GCP_PROJECT_ID
- GCP_REGION
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- GCP_ARTIFACT_REPOSITORY
- BACKEND_SERVICE_NAME
- FRONTEND_SERVICE_NAME
- TENANT_ID

## Google Cloud setup

The India tenant must have Email / Password enabled. The current tenant ID is taken from the Identity Platform tenant configuration and passed to the backend.

Google's tenant documentation confirms that tenants have their own users and identity providers, and that Email/Password is supported at tenant scope.

## Test flow

1. Enter phone number.
2. Send OTP.
3. Enter the Twilio OTP.
4. Verify OTP.
5. Enter an 8+ character password.
6. Click Create account.
7. Sign in later with the same phone + password without OTP.


<!-- CI redeploy trigger: 2026-09-22T06:34:25.708Z -->
