# Identity Provider — Phone + Password POC

Tenant-aware phone + password authentication POC.

## Architecture

React/Vite frontend on Cloud Run -> Node.js/Express backend on Cloud Run -> Google Cloud Identity Platform tenant.

Initial phone verification will use Twilio OTP. Passwords are managed by Identity Platform through the tenant Email/Password provider; the application UI is phone + password. No Firestore user/password store is used.

## CI/CD

GitHub Actions deploys both services to Cloud Run using Workload Identity Federation (WIF). No service-account JSON key is stored in GitHub.

Required GitHub Actions variables:
- GCP_PROJECT_ID
- GCP_REGION
- GCP_WIF_PROVIDER
- GCP_DEPLOY_SERVICE_ACCOUNT
- GCP_ARTIFACT_REPOSITORY
- BACKEND_SERVICE_NAME
- FRONTEND_SERVICE_NAME
- TENANT_ID

The workflow also verifies the active identity before deploying.
