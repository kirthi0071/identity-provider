Vodafone/Vi + Identity Platform Sample

Target flow:
Farmer App -> Mobile Number -> Auth API (Cloud Run) -> Vodafone/Vi SMS/OTP -> OTP Verification -> Identity Platform tenant -> Custom Token -> Farmer App -> Identity Platform ID Token/Refresh Token.

This folder is a sample implementation blueprint. The Vodafone API contract is intentionally not invented. Until the customer provides the actual Vodafone/Vi API details, the sample uses a mock OTP provider.

## Folder
vodafone/
  README.md
  FLOW.md
  backend/
    package.json
    .env.example
    Dockerfile
    server.js
    public/index.html

## What the sample proves
1. Farmer enters mobile number.
2. Auth API sends an OTP through a provider abstraction.
3. OTP is verified.
4. A farmer is found or created in the Identity Platform tenant.
5. Tenant-aware custom token is created.
6. Client sets the same tenant ID and calls signInWithCustomToken().
7. Identity Platform returns the authenticated session.
8. PIN and device binding remain application-managed features.

Google documents this custom authentication pattern and the tenant-aware custom token pattern. See: https://docs.cloud.google.com/identity-platform/docs/web/custom and https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication

## GCP requirements
APIs:
- Identity Platform / Identity Toolkit API
- Cloud Run API
- Secret Manager API
- Artifact Registry API
- IAM API
- Service Usage API
- Cloud SQL Admin API only if Cloud SQL is used

Current project:
- Project ID: project-c98d2dac-2409-44bd-aba
- Project number: 785312592182
- Region: asia-south1
- Tenant: India
- Tenant ID: India-p9rv0

## Identity Platform setup
Identity Platform -> enable multi-tenancy -> create/select India tenant -> confirm tenant ID India-p9rv0.

The backend uses a tenant-aware Admin SDK instance:

const tenantAuth = admin.auth().tenantManager().authForTenant(tenantId);
const customToken = await tenantAuth.createCustomToken(uid);

The mobile/web client must use the same tenant ID before signInWithCustomToken(). If the tenant IDs do not match, sign-in fails. See the Google documentation above.

After successful authentication, the farmer should appear under Identity Platform -> Users -> India tenant.

## Runtime service account
Create a dedicated service account:
identity-provider-runtime@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com

Cloud Run uses this as its service identity. Do not put a Google service-account JSON private key in the repository. Cloud Run can use its attached service identity through Application Default Credentials.

For custom-token creation, Google documents the Service Account Token Creator role (roles/iam.serviceAccountTokenCreator) where applicable because the signing service account needs signBlob permission. Validate the exact IAM binding during deployment.

The runtime service account also needs Secret Manager Secret Accessor (roles/secretmanager.secretAccessor) for secrets used by the service.

## Deployment service account
Keep CI/CD separate from runtime. Example:
github-cloud-run-deployer@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com

The deployer needs only the permissions required to push the image, deploy Cloud Run, consume APIs, and attach the runtime service account. Cloud Run deployment requires roles/iam.serviceAccountUser on the runtime service account.

## Secret Manager
Create production secrets such as:
- vodafone-api-key
- vodafone-client-id
- vodafone-client-secret
- otp-signing-secret
- database-password, if required

Never put Vodafone credentials, OTP values, PINs, database passwords, or Google private keys in source code.

## Vodafone/Vi requirements before real integration
Obtain from the customer:
- API documentation and base URL
- authentication method
- API key/client ID/client secret
- sender ID/header
- DLT Entity ID
- DLT Template ID
- approved OTP template
- OTP send request/response schema
- OTP verification API, if Vodafone provides it
- delivery status webhook/API
- error codes and rate limits
- sandbox and production credentials
- confirmation whether Vodafone owns OTP generation/verification or only SMS delivery

Do not invent a Vodafone endpoint or request schema.

## Two provider models
Model A: Vodafone only sends SMS. Our backend generates and verifies OTP.
Model B: Vodafone provides an OTP lifecycle. Our backend calls Vodafone to send and verify OTP.

The sample has a provider abstraction so either model can be implemented later.

## Local run
Requirements: Node.js 20+, npm, Google Cloud ADC, Identity Platform tenant.

cd vodafone/backend
npm install
copy .env.example to .env
Set OTP_PROVIDER=mock
Run: npm start
Open http://localhost:8080

The mock provider prints the OTP in the backend console. This is for development only.

## Cloud Run architecture
GitHub -> WIF -> deployment service account -> Artifact Registry -> Cloud Run -> runtime service account -> Identity Platform / Secret Manager / optional database.

## Authentication flows
Signup/new device:
Mobile -> Auth API -> Vodafone OTP -> OTP verified -> Identity Platform tenant -> UID -> custom token -> client signInWithCustomToken() -> ID/refresh token -> device binding/PIN.

Normal access:
Bound device -> PIN -> application PIN verification -> normal business access.

Forgot PIN/new device:
Mobile -> Vodafone OTP -> identity re-verification -> Identity Platform authentication -> reset/rebind PIN.

## PIN responsibility
PIN is application/backend managed. Infrastructure only provides the secure runtime and storage environment. Store a PIN verifier, not plaintext PIN. Implement attempt limits, lockout and reset flow in the application.

## Production checklist
- HTTPS only
- Secret Manager
- Dedicated runtime service account
- Least privilege IAM
- Custom-token signing permission
- OTP expiry and single use
- OTP rate limits and resend cooldown
- PIN rate limits
- Device revocation
- No OTP/PIN/token logging
- Audit logging and monitoring
- SMS abuse/pumping protection
- Tenant validation
- ID-token verification on protected APIs
- Real Vodafone/DLT integration testing

## Definition of done
The POC is complete when mobile -> OTP -> tenant user -> custom token -> client sign-in -> Identity Platform ID token works. Production is complete only after the real Vodafone/Vi API and DLT configuration are validated.
