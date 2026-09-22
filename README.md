# Identity Provider — Multi-Tenant Phone + Password Authentication POC

A Google Cloud POC for tenant-aware authentication using:

- React + Vite frontend
- Node.js + Express backend
- Google Cloud Run
- Google Cloud Identity Platform (multi-tenancy)
- Twilio Verify for initial SMS OTP verification
- Google Secret Manager for application secrets
- Artifact Registry for container images
- GitHub Actions + Workload Identity Federation (WIF) for CI/CD
- Firebase Admin SDK for tenant-scoped Identity Platform user management

---

## 1. POC objective

The POC implements this user experience:

### First-time registration

```text
Phone number
    ↓
Send OTP
    ↓
Twilio Verify sends SMS
    ↓
User enters OTP
    ↓
Backend verifies OTP with Twilio
    ↓
Backend creates user inside the selected Identity Platform tenant
    ↓
User creates a password
    ↓
Identity Platform stores the password
    ↓
User is signed in
```

### Returning-user login

```text
Phone number + Password
    ↓
Backend finds the user inside the tenant by phone number
    ↓
Backend resolves the user's internal email identifier
    ↓
Identity Platform REST API signInWithPassword
    ↓
Tenant-scoped ID token + refresh token
    ↓
User is logged in
```

OTP is intentionally used for initial phone ownership verification in this POC. Returning users authenticate with phone + password without another OTP.

---

## 2. Important Identity Platform design decision

Identity Platform tenants are separate authentication silos with their own users and identity-provider configuration.

This POC uses the tenant Email/Password provider for password authentication and stores the verified phone number on the Identity Platform user.

The application uses Twilio Verify for the initial phone OTP because the current tenant configuration used by this POC does not expose native tenant phone-number sign-in as the provider used by this implementation.

Therefore this is a custom application flow:

```text
User-facing identifier: phone number

Identity Platform authentication:
    phone
      ↓
tenant user lookup by phoneNumber
      ↓
internal email identifier
      ↓
Email/Password authentication
```

No Firestore database is used as an authentication or password store.

Identity Platform remains responsible for password storage and authentication.

Google documentation:
- Multi-tenancy: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy
- Multi-tenant authentication: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication
- Tenant management: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants

---

## 3. Current tenant configuration

The current POC uses one existing tenant:

```text
Tenant display name: India
Tenant ID: India-p9rv0
```

The current CI/CD workflow deploys this tenant ID to the backend.

The frontend does not currently ask the customer/user to select a tenant.

### Important future requirement: dynamic tenant architecture

The customer may create multiple tenants in the future.

For example:

```text
Customer A → Tenant A
Customer B → Tenant B
Customer C → Tenant C
Customer D → Tenant D
```

The current implementation is intentionally **not changed to dynamic tenant selection yet**.

For production/multi-customer implementation, the hardcoded tenant configuration should be replaced with a dynamic tenant-resolution design.

Recommended future flow:

```text
User/customer
     ↓
Select or identify customer
     ↓
Backend resolves customer → tenantId
     ↓
Validate tenant exists
     ↓
Create tenant-aware Auth client
     ↓
Register/login user inside that tenant
     ↓
Return tenant-scoped authentication token
```

Possible tenant-resolution inputs can include:

- Customer ID
- Tenant slug
- Subdomain
- Domain
- URL path
- Invitation/link containing tenant information

Example:

```text
acme.example.com
      ↓
customer = acme
      ↓
tenantId = <Identity Platform tenant ID>
```

The tenant ID must be resolved and validated by a trusted backend configuration/data source. Do not blindly trust a tenant ID supplied by an end user.

Identity Platform supports programmatic tenant creation, listing, retrieval, update and deletion through the Admin SDK. Each tenant has its own users and identity-provider configuration.

Google documentation:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants

---

## 4. Internal email identifier

Identity Platform Email/Password authentication requires an email/password credential.

The application therefore derives an internal email from the normalized phone number.

Example:

```text
Input phone:
+91 9344160867

Normalized:
+919344160867

Internal Identity Platform email:
9344160867@identity-provider.invalid
```

The user still interacts with the application using the phone number.

The real phone number is also stored in Identity Platform as `phoneNumber`.

This internal email is an implementation detail and should not be presented to end users.

The value is deterministic so that:

```text
same phone number
      ↓
same internal email
      ↓
same Identity Platform account
```

---

## 5. Complete system architecture

```text
                         Internet
                            |
                            v
                 +----------------------+
                 | React/Vite Frontend  |
                 | Cloud Run            |
                 +----------+-----------+
                            |
                            | HTTPS
                            v
                 +----------------------+
                 | Node.js / Express    |
                 | Backend Cloud Run    |
                 +----+-------------+---+
                      |             |
             +--------+             +------------------+
             |                           |
             v                           v
    +------------------+       +----------------------+
    | Twilio Verify    |       | Identity Platform    |
    | SMS OTP          |       | Tenant               |
    +------------------+       | Users + Password     |
                               +----------------------+
                      ^
                      |
              Google Secret Manager
                      |
             +--------+---------+
             |                  |
       Twilio secrets     Identity Platform
                          API key / OTP secret

CI/CD:
GitHub
  ↓
GitHub Actions
  ↓
Workload Identity Federation
  ↓
Deployment Service Account
  ↓
Artifact Registry
  ↓
Cloud Run
```

---

## 6. Registration flow in detail

### Step 1 — User enters phone

Frontend sends:

```http
POST /auth/send-otp
```

Backend:

1. Normalizes the phone number to E.164 format.
2. Calls Twilio Verify.
3. Twilio sends the SMS OTP.

Example normalization:

```text
9344160867
    ↓
+919344160867
```

---

### Step 2 — User enters OTP

Frontend sends:

```http
POST /auth/verify-otp
```

Backend:

1. Sends the OTP to Twilio Verify Check API.
2. Confirms the verification status is approved.
3. Creates a short-lived signed OTP session token.
4. Returns the OTP session token to the frontend.

The backend uses HMAC signing for the temporary OTP session.

The OTP session expires after 10 minutes.

The actual OTP is not stored in Firestore or in the application database.

---

### Step 3 — User creates password

Frontend sends:

```http
POST /auth/register
```

Backend:

1. Validates the tenant configuration.
2. Validates the signed OTP session.
3. Validates password length.
4. Creates a tenant-aware Firebase Admin Auth client.
5. Checks whether the phone already exists in the tenant.
6. Creates the Identity Platform user with:
   - internal email
   - password
   - verified phone number
   - enabled account
7. Signs the new user in through the Identity Platform REST API.
8. Returns the authentication tokens.

---

## 7. Login flow in detail

Frontend sends:

```http
POST /auth/login
```

with:

```text
phone
password
```

Backend:

1. Normalizes the phone.
2. Gets the tenant-aware Auth client.
3. Looks up the tenant user using `getUserByPhoneNumber()`.
4. Reads the internal email from the Identity Platform user.
5. Calls Identity Platform `accounts:signInWithPassword`.
6. Sends the tenant ID in the authentication request.
7. Returns:
   - ID token
   - refresh token
   - expiry
   - user ID
   - tenant ID

No OTP is required for normal returning-user login.

---

## 8. Identity Platform configuration

Identity Platform is enabled in the Google Cloud project.

Multi-tenancy is enabled.

Current tenant:

```text
India
India-p9rv0
```

The tenant has Email/Password authentication enabled.

Users are managed inside the tenant scope.

The backend uses the Firebase Admin SDK:

```javascript
const tenantAuth =
  getAuth().tenantManager().authForTenant(tenantId);
```

This ensures user operations are performed against the selected tenant rather than the project-level user pool.

---

## 9. Google Cloud resources

### Project

```text
Project ID:
project-c98d2dac-2409-44bd-aba

Project number:
785312592182

Region:
asia-south1
```

### Cloud Run services

Two Cloud Run services are used:

```text
identity-provider-backend
identity-provider-frontend
```

The exact service names are supplied to GitHub Actions through GitHub configuration/secrets.

### Artifact Registry

Repository:

```text
auth-poc
```

Container images:

```text
<region>-docker.pkg.dev/<project>/<repository>/backend:<commit-sha>
<region>-docker.pkg.dev/<project>/<repository>/frontend:<commit-sha>
```

Images are built by GitHub Actions and pushed to Artifact Registry.

---

## 10. Service accounts and IAM

### Runtime service account

```text
identity-provider-runtime@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com
```

Cloud Run uses this service account at runtime.

It requires:

- Identity Toolkit Admin — `roles/identitytoolkit.admin`
  - Allows the backend to perform the required Identity Platform/Identity Toolkit administrative operations.
- Secret Manager Secret Accessor — `roles/secretmanager.secretAccessor`
  - Allows Cloud Run to read the configured application secrets.

The runtime service account is intentionally separate from the GitHub deployment identity.

---

### GitHub deployment service account

```text
github-cloud-run-deployer@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com
```

Configured roles include:

- `roles/artifactregistry.writer`
- `roles/run.admin`
- `roles/run.developer`
- `roles/serviceusage.serviceUsageConsumer`

The deployment service account also has permission to act as the Cloud Run runtime service account:

```text
roles/iam.serviceAccountUser
```

This separation follows the principle that CI/CD deployment permissions and application runtime permissions should not be the same identity.

---

## 11. GitHub Actions Workload Identity Federation

No Google Cloud service-account JSON key is stored in GitHub.

GitHub Actions authenticates using Workload Identity Federation.

Current WIF configuration:

```text
Pool:
github-actions-pool

Provider:
github-provider
```

Provider resource:

```text
projects/785312592182/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

Repository restriction:

```text
attribute.repository == 'kirthi0071/identity-provider'
```

The WIF principal is allowed to impersonate the deployment service account through:

```text
roles/iam.workloadIdentityUser
```

### CI/CD flow

```text
GitHub push to main
       ↓
GitHub Actions
       ↓
WIF authentication
       ↓
Deployment Service Account
       ↓
Authenticate Docker
       ↓
Build backend
       ↓
Push backend image
       ↓
Deploy backend to Cloud Run
       ↓
Resolve backend URL
       ↓
Build frontend with backend URL
       ↓
Push frontend image
       ↓
Deploy frontend to Cloud Run
       ↓
/health smoke test
```

---

## 12. GitHub Actions configuration

Required GitHub configuration/secrets:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
GCP_ARTIFACT_REPOSITORY
BACKEND_SERVICE_NAME
FRONTEND_SERVICE_NAME
```

### Current tenant deployment configuration

The current workflow deploys:

```text
IDENTITY_PLATFORM_TENANT_ID=India-p9rv0
```

This is intentional for the current POC.

For the future multi-customer implementation, this should become a runtime tenant-resolution mechanism rather than a single deployment-wide tenant ID.

---

## 13. Secret Manager

The application secrets are stored in Google Cloud Secret Manager.

### Secrets created

```text
twilio-account-sid
twilio-auth-token
twilio-verify-service-sid
identity-platform-api-key
otp-session-secret
```

### What each secret is for

| Secret | Purpose |
|---|---|
| `twilio-account-sid` | Identifies the Twilio account |
| `twilio-auth-token` | Authenticates backend requests to Twilio |
| `twilio-verify-service-sid` | Identifies the Twilio Verify service used for OTP |
| `identity-platform-api-key` | Used by the backend for Identity Platform REST password sign-in |
| `otp-session-secret` | HMAC signing key for the temporary OTP verification session |

No secret values are committed to GitHub.

Cloud Run receives the secrets as environment variables using Secret Manager integration.

Current deployment configuration maps:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
IDENTITY_PLATFORM_API_KEY
OTP_SESSION_SECRET
```

### Secret security

Do not:

- Commit secrets to Git
- Put Twilio Auth Token in source code
- Put Identity Platform API keys directly in source code
- Store passwords in frontend code
- Store OTP values in GitHub
- Print secret values in logs

For production, pin Secret Manager versions rather than relying on `latest` where strict deployment reproducibility is required.

---

## 14. Twilio Verify configuration

A Twilio Verify Service is used for SMS OTP.

The backend uses Twilio Verify API v2:

```text
Send verification
    ↓
Twilio Verify
    ↓
SMS
    ↓
User enters code
    ↓
Verification Check
```

The application does not generate or store the OTP itself.

Twilio owns the OTP verification lifecycle.

---

## 15. Twilio trial vs production

The current POC was built using a Twilio trial account.

Trial accounts have restrictions such as:

- limited free usage
- recipient verification requirements
- trial expiration
- geographic restrictions
- trial messaging limitations

For a real customer deployment with many users, the Twilio account must be upgraded to a paid account.

### Upgrade steps

1. Open Twilio Console.
2. Select Upgrade.
3. Complete the required customer/business profile information.
4. Add billing/payment details.
5. Complete any required Primary Customer Profile/compliance process.
6. Configure production SMS/phone-number requirements.
7. Confirm the required destination countries are enabled.
8. Continue using the Verify Service from the backend.
9. Monitor Verify usage, failures and fraud/abuse controls.

After upgrading, the trial-only verified-recipient restriction is removed and the application can be used with normal production recipients, subject to Twilio's country/compliance requirements.

Twilio documentation:
- Trial account: https://www.twilio.com/docs/usage/trials
- Verify trial: https://www.twilio.com/docs/usage/trials/try-out-verify
- Verify API: https://www.twilio.com/docs/verify/api/verification
- Verify service rate limits: https://www.twilio.com/docs/verify/api/service-rate-limits

### Scaling OTP for more users

For a larger customer base, do not simply increase application instances and assume OTP capacity will scale automatically.

Production planning should include:

- Upgrade Twilio account.
- Complete required compliance/Primary Customer Profile requirements.
- Configure appropriate Twilio phone numbers/senders.
- Enable required destination countries.
- Monitor SMS delivery and Verify usage.
- Configure Verify Service rate limits.
- Add application-level rate limiting per phone/IP/device.
- Protect the OTP endpoint from abuse and SMS pumping.
- Monitor Twilio spend.
- Define retry/cooldown rules for repeated OTP requests.
- Add alerting for unusual OTP traffic.
- Review regional sender and regulatory requirements.

Twilio provides Service Rate Limits for controlling verification traffic, which should be considered before exposing the OTP endpoint to a large customer population.

---

## 16. Backend security controls implemented

### Phone normalization

Phone numbers are normalized before Twilio or Identity Platform operations.

Example:

```text
9344160867
91 9344160867
+91 9344160867
```

are normalized to:

```text
+919344160867
```

### OTP session protection

After successful Twilio verification, the backend creates a signed temporary OTP session.

The session contains:

- normalized phone
- expiry timestamp

The session is HMAC signed.

The default expiry is 10 minutes.

### Password validation

Registration requires a password of at least 8 characters.

### Tenant isolation

User lookup and user creation are performed using the tenant-aware Admin SDK.

### Password storage

The application does not store passwords in its own database.

Identity Platform manages the password authentication.

### Secret management

Sensitive backend credentials are stored in Secret Manager.

### CI/CD authentication

GitHub Actions uses WIF rather than a long-lived service-account JSON key.

---

## 17. Frontend flow

The frontend provides:

### Sign in

```text
Phone
Password
Sign in
```

### Create account

```text
Phone
Send OTP
OTP
Verify OTP
Password
Create account
```

### Dashboard

After authentication, the UI displays authentication information such as:

- authentication method
- phone number
- tenant
- user ID
- logout

---

## 18. Backend API

### Health

```http
GET /health
```

Used by deployment smoke testing.

### Send OTP

```http
POST /auth/send-otp
```

### Verify OTP

```http
POST /auth/verify-otp
```

### Register

```http
POST /auth/register
```

### Login

```http
POST /auth/login
```

---

## 19. Repository structure

```text
identity-provider/
│
├── backend/
│   ├── src/
│   │   └── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── Dockerfile
│   └── .dockerignore
│
├── docs/
│   ├── gcp-setup.md
│   └── next-step.md
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
├── .gitignore
└── README.md
```

---

## 20. Deployment prerequisites

Before deployment, verify:

### Google Cloud

- Billing is enabled.
- Identity Platform API is enabled.
- Identity Platform multi-tenancy is enabled.
- Current tenant exists.
- Email/Password is enabled for the tenant.
- Artifact Registry repository exists.
- Cloud Run API is enabled.
- Secret Manager API is enabled.
- Required service accounts exist.
- IAM permissions are configured.

### Twilio

- Twilio account exists.
- Verify Service exists.
- Account SID is available.
- Auth Token is available.
- Verify Service SID is available.
- Trial recipient is verified when using trial mode.

### GitHub

- Repository is connected.
- WIF provider exists.
- GitHub Actions permissions include OIDC token access.
- Required repository secrets/configuration exist.

---

## 21. Test checklist

### Registration

- [ ] Open frontend.
- [ ] Enter phone.
- [ ] Click Send OTP.
- [ ] Receive Twilio SMS.
- [ ] Enter OTP.
- [ ] Verify OTP.
- [ ] Enter password.
- [ ] Create account.
- [ ] Confirm Identity Platform user appears under the correct tenant.
- [ ] Confirm phone number is stored.
- [ ] Confirm internal email is generated.
- [ ] Confirm user receives a successful login response.

### Returning login

- [ ] Open sign-in.
- [ ] Enter same phone.
- [ ] Enter password.
- [ ] Sign in.
- [ ] Confirm no OTP is requested.
- [ ] Confirm tenant ID in response.
- [ ] Confirm user ID.
- [ ] Confirm ID token is returned.

### Deployment

- [ ] GitHub Actions authenticates using WIF.
- [ ] Backend image builds.
- [ ] Backend image pushes to Artifact Registry.
- [ ] Backend Cloud Run deploy succeeds.
- [ ] Frontend image builds with backend URL.
- [ ] Frontend Cloud Run deploy succeeds.
- [ ] Backend /health smoke test passes.

---

## 22. Current POC vs future production architecture

### Current POC

```text
One configured tenant
       ↓
Hardcoded deployment tenant ID
       ↓
Twilio Verify
       ↓
Tenant user lookup
       ↓
Phone + password
```

### Future multi-customer architecture

```text
Customer
   ↓
Tenant selection / customer identification
   ↓
Backend tenant resolver
   ↓
Tenant configuration
   ↓
Validate tenant
   ↓
Tenant-aware Identity Platform Auth
   ↓
User registration/login
```

The dynamic tenant architecture is intentionally documented but **not implemented in this POC yet**.

Future tenant management can be implemented using the Identity Platform Admin SDK, which supports tenant creation and management.

---

## 23. Production improvements to consider

Before production rollout, evaluate:

- Dynamic tenant resolution
- Tenant onboarding API
- Tenant metadata/configuration store
- Tenant-specific branding
- Tenant-specific authentication configuration
- Application-level authorization
- ID-token verification on protected backend APIs
- Role-based access using custom claims where appropriate
- Rate limiting
- OTP abuse prevention
- SMS pumping/fraud protection
- Audit logging
- Monitoring and alerting
- Cloud Armor / load balancer protection
- Secret version pinning
- Secret rotation
- CORS restriction to the real frontend domain
- Stronger password policy if required
- Account lockout/abuse controls
- Refresh-token/session management
- Customer-level usage and cost monitoring
- Twilio usage and delivery monitoring
- Backup/migration strategy
- Tenant lifecycle management

---

## 24. Key design principles

1. Identity Platform is the authentication system.
2. Tenant users remain isolated by tenant.
3. Twilio verifies initial phone ownership.
4. The application does not store passwords.
5. OTPs are not stored by the application.
6. Secrets are stored in Secret Manager.
7. Runtime IAM is separate from deployment IAM.
8. GitHub Actions uses WIF instead of service-account JSON keys.
9. The current tenant ID is fixed for the POC.
10. Dynamic tenant resolution is the planned next step for a multi-customer product.
11. Twilio must be upgraded and compliance requirements completed before large-scale production OTP usage.
12. Application-level rate limiting and OTP abuse protection are required before exposing the service broadly.

---

## 25. Useful official documentation

### Google Cloud Identity Platform

- Multi-tenancy:
  https://docs.cloud.google.com/identity-platform/docs/multi-tenancy
- Multi-tenant authentication:
  https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication
- Tenant management:
  https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants
- Multi-tenant UI:
  https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-ui
- Admin SDK:
  https://docs.cloud.google.com/identity-platform/docs/install-admin-sdk
- IAM access control:
  https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-access-control

### Twilio

- Trial account:
  https://www.twilio.com/docs/usage/trials
- Verify trial:
  https://www.twilio.com/docs/usage/trials/try-out-verify
- Verify API:
  https://www.twilio.com/docs/verify/api/verification
- Verify Service:
  https://www.twilio.com/docs/verify/api/service
- Verify Service Rate Limits:
  https://www.twilio.com/docs/verify/api/service-rate-limits

---

## 26. Final POC summary

This POC demonstrates:

```text
React/Vite
    ↓
Cloud Run Frontend
    ↓
Cloud Run Node.js/Express Backend
    ↓
+-----------------------------+
|                             |
v                             v
Twilio Verify          Identity Platform
SMS OTP                Tenant + Users
                             |
                             v
                     Email/Password
                     authentication
```

The current implementation proves the complete registration and login flow for the India tenant.

The next major architectural step for a customer-facing multi-tenant product is to remove the deployment-wide tenant ID and introduce a secure dynamic customer-to-tenant resolution layer.

The next major operational step for large-scale OTP usage is to upgrade Twilio from trial to a production account, complete the required compliance/profile setup, and add OTP rate limiting, abuse protection and usage monitoring.
