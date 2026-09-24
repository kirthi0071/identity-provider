# Vodafone/Vi SMS OTP + Identity Platform Custom Authentication

## 1. Objective

The target Farmer App authentication flow is:

```text
Farmer App
    ↓
Mobile Number
    ↓
Auth API
    ↓
Vodafone / Vi DLT-compliant SMS
    ↓
OTP Verification
    ↓
Identity Platform
    ↓
Tenant-aware Custom Token
    ↓
Farmer App
    ↓
Logged In
```

The purpose of this design is to use the customer's existing Vodafone/Vi SMS capability for mobile ownership verification while using Google Cloud Identity Platform as the identity and token/session layer.

This is different from the current Twilio-based POC. Twilio was used to prove the initial architecture. The target Farmer App design replaces the Twilio-specific integration with the customer's Vodafone/Vi SMS provider.

---

## 2. Business authentication model

| Scenario | Recommended method | Reason |
|---|---|---|
| Farmer signup | Mobile + SMS OTP | Mobile ownership must be verified at least once |
| First sign-in / new device | Mobile + SMS OTP | Establish trust for that device |
| Normal access on bound device | PIN | No dependency on SMS for day-to-day access |
| New device / reinstall / device reset | SMS OTP | Re-verify identity before changing device binding |
| Forgot PIN | SMS OTP → reset PIN | Secure recovery |

The key design principle is:

> SMS OTP is used to establish or re-establish trust in the mobile number. PIN is used for normal day-to-day access on a trusted/bound device.

---

## 3. High-level architecture

```text
                         ┌──────────────────────┐
                         │      FARMER APP      │
                         │      Android/iOS     │
                         └──────────┬───────────┘
                                    │
                         Mobile / OTP / PIN
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │       AUTH API       │
                         │      Cloud Run       │
                         │                      │
                         │ OTP orchestration    │
                         │ Vodafone integration │
                         │ Farmer lookup        │
                         │ Device binding       │
                         │ PIN APIs             │
                         │ Custom token         │
                         └───────┬──────┬───────┘
                                 │      │
                    SMS request  │      │ Identity operations
                                 │      │
                  ┌──────────────▼┐    ┌▼──────────────────┐
                  │ Vodafone / Vi │    │ Identity Platform │
                  │ SMS / CPaaS   │    │                   │
                  │ DLT setup     │    │ Tenant: India     │
                  └──────┬────────┘    │ Farmer UID        │
                         │             │ Custom Token      │
                         │             │ ID / Refresh      │
                         ▼             │ Tokens            │
                    Farmer SMS        └────────┬───────────┘
                                                │
                                                ▼
                                      ┌──────────────────┐
                                      │ Farmer Backend   │
                                      │ Business APIs    │
                                      └──────────────────┘

Supporting GCP:
  Secret Manager
  Application Database / Cloud SQL
  IAM
  Cloud Logging / Monitoring
  VPC / networking
  Optional Load Balancer / Cloud Armor
```

---

## 4. Responsibility split

| Component | Responsibility |
|---|---|
| Farmer App | Mobile number UI, OTP UI, PIN UI, Identity Platform client authentication/session |
| Auth API | Authentication orchestration, OTP workflow, Vodafone API integration, farmer lookup, custom token creation |
| Vodafone/Vi | SMS delivery and the customer's DLT-compliant messaging configuration |
| Identity Platform | Tenant-scoped farmer identity/UID, custom authentication, ID/refresh token issuance |
| Application database | PIN verifier, device binding and farmer/application data |
| Secret Manager | Vodafone/API/DB/application secrets |
| Cloud Run | Runtime for Auth API |
| IAM | Service-to-service authorization |
| Monitoring | Logs, metrics, alerts and authentication operational visibility |

---

## 5. Important terminology: Vodafone, SMS and DLT

DLT and SMS delivery should not be treated as the same technical component.

Conceptually:

```text
DLT / regulatory configuration
    ↓
Entity / sender / template configuration
    ↓
Vodafone/Vi SMS or CPaaS API
    ↓
Mobile network
    ↓
Farmer
```

The exact customer setup must be confirmed from the Vodafone/Vi documentation and credentials provided by the existing system.

Do not implement an assumed Vodafone endpoint.

---

# 6. Authentication flows

## 6.1 Farmer signup

```text
Farmer App
    ↓
Enter mobile number
    ↓
Auth API
    ↓
Request OTP
    ↓
Vodafone / Vi SMS API
    ↓
DLT-compliant OTP SMS
    ↓
Farmer enters OTP
    ↓
Auth API verifies OTP
    ↓
OTP SUCCESS
    ↓
Find/Create farmer in Identity Platform tenant
    ↓
Generate tenant-aware custom token
    ↓
Return token to Farmer App
    ↓
Client signs in with custom token
    ↓
Identity Platform authenticated session
    ↓
Create/bind device
    ↓
Farmer sets PIN
    ↓
Logged in
```

Google Identity Platform supports custom authentication where a server validates external credentials, creates a custom token, and the client signs in with `signInWithCustomToken()`.

Official documentation:
- https://docs.cloud.google.com/identity-platform/docs/web/custom
- https://docs.cloud.google.com/identity-platform/docs/admin/create-custom-tokens

---

## 6.2 Normal access on bound device

```text
Farmer opens app
    ↓
Bound/trusted device detected
    ↓
Farmer enters PIN
    ↓
Application / Auth API verifies PIN
    ↓
Authenticated application session
    ↓
Farmer accesses normal business APIs
```

No SMS is required for ordinary day-to-day access.

### PIN ownership

PIN is an application/backend responsibility, not an infrastructure feature.

The application should:

- Set PIN
- Verify PIN
- Reset PIN
- Enforce PIN attempt limits
- Apply lockout/rate-limit policy
- Securely store a PIN verifier rather than plaintext PIN
- Decide the exact client-side/device binding behavior

Infrastructure provides the secure environment for these application components.

---

## 6.3 New device / reinstall / device reset

```text
New or reset device
    ↓
Mobile number
    ↓
Auth API
    ↓
Vodafone / Vi SMS OTP
    ↓
Farmer enters OTP
    ↓
Auth API verifies OTP
    ↓
Identity Platform identity resolved
    ↓
Custom token generated
    ↓
Farmer App signs in
    ↓
Re-verify / create device binding
    ↓
Set PIN
    ↓
Continue
```

The requirement is to re-verify identity before changing device binding.

---

## 6.4 Forgot PIN

```text
Forgot PIN
    ↓
Enter mobile number
    ↓
Auth API
    ↓
Vodafone / Vi SMS OTP
    ↓
Verify OTP
    ↓
Identity Platform authentication
    ↓
Farmer identity confirmed
    ↓
Reset PIN
    ↓
Continue
```

---

# 7. Identity Platform role

Identity Platform is not the Vodafone SMS gateway.

Identity Platform provides the identity and token layer after the external authentication step succeeds.

Conceptually:

```text
Vodafone/Vi
  "The mobile-number OTP challenge succeeded"
          ↓
Auth API
  "Authentication accepted"
          ↓
Identity Platform
  "This is farmer UID X in tenant Y"
          ↓
Custom Token
          ↓
Farmer App
          ↓
Identity Platform ID Token / Refresh Token
```

Google documents custom authentication as the integration pattern for using an external authentication system with Identity Platform.

Reference:
https://docs.cloud.google.com/identity-platform/docs/web/custom

---

# 8. Current Identity Platform tenant

The current POC uses:

```text
Google Cloud Project:
project-c98d2dac-2409-44bd-aba

Project number:
785312592182

Region:
asia-south1

Tenant display name:
India

Tenant ID:
India-p9rv0
```

The production system may eventually require dynamic tenant resolution. The current target can continue with the existing India tenant for the POC.

Identity Platform tenants provide separate users and identity-provider configuration.

Reference:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy

---

# 9. Tenant-aware Identity Platform implementation

The Auth API should use a tenant-aware Admin SDK instance.

Node.js example:

```javascript
const tenantManager = admin.auth().tenantManager();

const tenantAuth = tenantManager.authForTenant(
  process.env.IDENTITY_PLATFORM_TENANT_ID
);
```

After Vodafone OTP verification:

```text
OTP verified
    ↓
Find farmer in tenant
    ↓
If missing → create farmer
    ↓
Get UID
    ↓
tenantAuth.createCustomToken(uid)
```

Google documents that a custom token generated from a tenant-aware Auth instance contains tenant context.

Reference:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication

---

# 10. Create/find farmer user

After successful OTP verification:

```text
Normalized phone number
        ↓
tenantAuth.getUserByPhoneNumber(phone)
        │
        ├── Existing user → reuse UID
        │
        └── User not found → create user
```

Example:

```javascript
let user;

try {
  user = await tenantAuth.getUserByPhoneNumber(phone);
} catch (error) {
  if (error.code === 'auth/user-not-found') {
    user = await tenantAuth.createUser({
      phoneNumber: phone
    });
  } else {
    throw error;
  }
}
```

The exact user attributes should follow the application's farmer data model.

---

# 11. Generate custom token

After the external OTP verification succeeds:

```javascript
const customToken = await tenantAuth.createCustomToken(user.uid);
```

Return the short-lived custom token to the mobile application through the authenticated HTTPS API.

Google documents that custom tokens are generated server-side and then exchanged by the client for Identity Platform authentication.

Reference:
https://docs.cloud.google.com/identity-platform/docs/admin/create-custom-tokens

Custom tokens have a maximum lifetime of one hour. After successful sign-in, Identity Platform manages the normal user session tokens.

---

# 12. Farmer App token exchange

The client must use the same tenant ID:

```javascript
auth.tenantId = 'India-p9rv0';

await signInWithCustomToken(auth, customToken);
```

The tenant ID on the client must match the tenant in the custom token.

Reference:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication

After successful authentication:

```text
Custom Token
      ↓
Identity Platform
      ↓
ID Token + Refresh Token
      ↓
Farmer App
```

---

# 13. Protected backend API flow

Once the farmer is authenticated:

```text
Farmer App
    ↓
Authorization: Bearer <Identity Platform ID Token>
    ↓
Farmer Backend API
    ↓
Verify ID token with tenant-aware Admin SDK
    ↓
Extract UID / tenant
    ↓
Authorize operation
    ↓
Return farmer/business data
```

Google documents verifying ID tokens on a backend and using tenant-aware verification in multi-tenant setups.

Reference:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants

---

# 14. PIN data model

PIN is application-managed.

A conceptual database model is:

```text
pin_credentials
----------------
farmer_uid
pin_hash
failed_attempts
locked_until
pin_version
updated_at
```

Never store plaintext PINs.

Store an approved password/PIN verifier using the application's security standard.

The exact hashing algorithm, complexity policy and lockout values should be agreed with the application's security team.

---

# 15. Device binding data model

A conceptual model is:

```text
device_bindings
----------------
id
farmer_uid
device_id / device binding identifier
status
bound_at
last_verified_at
revoked_at
```

Example:

```text
Farmer UID: abc123

DEVICE-A → ACTIVE
DEVICE-B → REVOKED
```

New device:

```text
OTP verified
    ↓
Farmer UID resolved
    ↓
Device B checked
    ↓
Device B bound
    ↓
PIN setup
```

The exact device-binding/attestation mechanism belongs to the mobile/application security design.

---

# 16. OTP implementation

The application needs two API operations:

```http
POST /auth/otp/send
POST /auth/otp/verify
```

### Send OTP

Request:

```json
{
  "phoneNumber": "+91XXXXXXXXXX",
  "purpose": "SIGNUP"
}
```

Recommended processing:

```text
Validate phone
    ↓
Normalize to E.164
    ↓
Rate limit
    ↓
Create OTP challenge
    ↓
Call Vodafone/Vi API
    ↓
Return challenge reference
```

Do not return the OTP in the response.

A challenge ID is preferable to using only the phone number as the transaction identifier.

### Verify OTP

Request:

```json
{
  "challengeId": "...",
  "otp": "123456"
}
```

Processing:

```text
Load challenge
    ↓
Check expiry
    ↓
Check attempt count
    ↓
Verify OTP
    ↓
Mark challenge used
    ↓
Find/create Identity Platform user
    ↓
Generate custom token
```

OTP challenges should be single-use.

---

# 17. Two possible Vodafone integration models

The customer documentation must determine which model applies.

## Model A — Vodafone sends SMS only

```text
Auth API
  ↓
Generate OTP
  ↓
Persist protected OTP verifier temporarily
  ↓
Vodafone SMS API
  ↓
Farmer receives SMS
  ↓
Farmer enters OTP
  ↓
Auth API verifies OTP
```

In this model, our Auth API owns OTP generation and verification.

## Model B — Vodafone provides an OTP service

```text
Auth API
  ↓
Vodafone OTP API
  ↓
Vodafone sends OTP
  ↓
Farmer enters OTP
  ↓
Auth API → Vodafone verify API
  ↓
SUCCESS
```

In this model, Vodafone owns OTP generation/verification.

Do not assume either model until the customer's Vodafone API documentation is available.

---

# 18. Vodafone information required before implementation

Request the following from the existing implementation/team:

```text
1. Vodafone/Vi SMS or CPaaS API documentation
2. Base URL
3. Authentication method
4. API key / client ID
5. Client secret
6. Sender ID / header
7. DLT Entity ID
8. DLT Template ID
9. Approved OTP template
10. Request format
11. Response format
12. Delivery-status API / webhook
13. Error codes
14. Rate limits
15. Sandbox/test credentials
16. Production credentials
17. Current provider integration sample
18. Whether Vodafone itself verifies the OTP
```

Do not put real credentials into this documentation.

---

# 19. Secret management

Store sensitive values in Google Secret Manager.

Examples:

```text
VODAFONE_API_KEY
VODAFONE_CLIENT_ID
VODAFONE_CLIENT_SECRET
OTP_SIGNING_SECRET
DATABASE_PASSWORD
```

Runtime flow:

```text
Cloud Run
    ↓
Runtime Service Account
    ↓
Secret Manager
    ↓
Application secrets
```

Never:

- Commit Vodafone credentials to GitHub
- Put secrets into frontend JavaScript
- Put service-account private keys into the repository
- Log OTPs
- Log PINs
- Log access tokens

---

# 20. Google IAM

Cloud Run should use a dedicated runtime service account.

Current runtime identity:

```text
identity-provider-runtime@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com
```

The runtime identity should have only the permissions required for:

- Identity Platform Admin SDK operations
- Custom token signing/creation as required by the Admin SDK
- Secret Manager access
- Required application database/network access

Google's custom-token documentation says the service account used by the Admin SDK needs the required signing permission and recommends Service Account Token Creator (`roles/iam.serviceAccountTokenCreator`) where applicable.

Reference:
https://docs.cloud.google.com/identity-platform/docs/admin/create-custom-tokens

Do not download service-account JSON keys for the Cloud Run runtime if Application Default Credentials can be used.

---

# 21. Database responsibilities

Identity Platform should be the system of identity for:

```text
UID
Tenant
Authentication identity
Identity Platform tokens
Account status
```

The application database should own:

```text
Farmer business profile
PIN verifier
Device binding
Application-specific authorization/data
OTP challenge state if the selected OTP model requires server-side storage
```

Use the Identity Platform UID as the stable user identity reference.

---

# 22. Recommended Auth API structure

A clean Node.js structure:

```text
src/
├── app.js
├── config/
│   ├── env.js
│   └── identity-platform.js
│
├── routes/
│   └── auth.routes.js
│
├── controllers/
│   └── auth.controller.js
│
├── services/
│   ├── vodafone.service.js
│   ├── otp.service.js
│   ├── identity-platform.service.js
│   ├── pin.service.js
│   └── device.service.js
│
├── repositories/
│   ├── farmer.repository.js
│   ├── otp.repository.js
│   ├── pin.repository.js
│   └── device.repository.js
│
├── middleware/
│   ├── auth.js
│   └── rate-limit.js
│
└── utils/
    ├── phone.js
    └── security.js
```

Keep Vodafone-specific code inside `vodafone.service.js` so another SMS provider can be substituted later without redesigning the whole authentication flow.

---

# 23. Provider abstraction

Recommended abstraction:

```javascript
class SmsProvider {
  async sendOtp(phone, templateData) {
    throw new Error('Not implemented');
  }

  async verifyOtp(reference, otp) {
    throw new Error('Not implemented');
  }
}
```

Then:

```text
SmsProvider
    │
    └── VodafoneSmsProvider
```

Possible future providers:

```text
SmsProvider
 ├── VodafoneSmsProvider
 ├── OtherSmsProvider
 └── TestSmsProvider
```

This keeps the application provider-neutral.

---

# 24. Recommended API endpoints

```text
POST /auth/otp/send
POST /auth/otp/verify

POST /auth/pin/set
POST /auth/pin/verify
POST /auth/pin/reset

POST /auth/device/bind
POST /auth/device/reverify

POST /auth/logout
GET  /auth/me
GET  /health
```

The exact API contract should be finalized with the Farmer App team.

---

# 25. Complete implementation sequence

## Phase 1 — Requirement freeze

Document and approve:

- Signup
- New device
- Normal access
- Forgot PIN
- Device binding
- PIN ownership

The current requirement says SMS is required to establish/re-establish identity and PIN is used for normal bound-device access.

---

## Phase 2 — Vodafone dependency

Obtain the actual Vodafone/Vi API specification and confirm:

```text
SMS send API?
OTP API?
OTP verification API?
DLT template?
Delivery status?
Authentication?
```

This is the main dependency before replacing Twilio.

---

## Phase 3 — Identity Platform setup

Verify:

```text
✓ Identity Platform enabled
✓ Multi-tenancy enabled
✓ India tenant exists
✓ India-p9rv0 tenant ID confirmed
✓ Tenant user management works
✓ Tenant-aware Admin SDK works
✓ Custom-token signing permissions work
```

---

## Phase 4 — Refactor current Twilio POC

The current POC uses:

```text
Twilio Verify
+
internal phone-derived email
+
Email/Password authentication
```

The target architecture removes those customer-facing assumptions.

Target:

```text
Vodafone/Vi
+
OTP challenge/verification
+
Identity Platform custom authentication
+
tenant-aware custom token
```

The internal phone-to-email workaround should not be the target Farmer App design unless a separate requirement requires Identity Platform password authentication.

---

## Phase 5 — Implement Vodafone adapter

Build:

```text
vodafone.service.js
```

Implement:

```text
authenticate to provider
send OTP
capture provider reference
parse response
handle provider errors
handle delivery status/webhooks where supported
```

Use Secret Manager for credentials.

---

## Phase 6 — Implement OTP APIs

Build:

```text
POST /auth/otp/send
POST /auth/otp/verify
```

Add:

```text
Phone validation
E.164 normalization
Challenge ID
OTP expiry
Attempt limit
Resend cooldown
Phone/IP/device rate limits
Single-use challenge
No OTP in logs
```

---

## Phase 7 — Connect Identity Platform custom authentication

After OTP success:

```text
OTP SUCCESS
    ↓
tenantAuth
    ↓
Find/Create farmer
    ↓
UID
    ↓
createCustomToken(uid)
    ↓
Return custom token
```

---

## Phase 8 — Mobile integration

Farmer App:

```text
1. Enter mobile
2. Request OTP
3. Enter OTP
4. Verify OTP
5. Receive custom token
6. Set tenantId
7. signInWithCustomToken()
8. Receive Identity Platform session
9. Proceed to device binding/PIN
```

---

## Phase 9 — Device binding and PIN

Implement:

```text
Device binding
PIN set
PIN verify
PIN reset
PIN attempt limit
PIN lockout
```

Keep these as application-level features.

---

## Phase 10 — Protected APIs

Send the Identity Platform ID token from the Farmer App.

Backend:

```text
Verify ID token
    ↓
Validate tenant
    ↓
Read UID
    ↓
Authorize farmer operation
```

---

## Phase 11 — Production security

Verify:

```text
✓ HTTPS only
✓ Secret Manager
✓ Least-privilege IAM
✓ Token verification
✓ OTP rate limits
✓ PIN rate limits
✓ No sensitive logs
✓ Device revocation
✓ Audit logging
✓ Monitoring/alerts
✓ Abuse/SMS-pumping controls
✓ CORS restricted to required origins
✓ Secret rotation
✓ Database security
```

---

# 26. Testing plan

## Test 1 — Real Vodafone/Vi number

```text
Vodafone/Vi number
    ↓
Send OTP
    ↓
SMS received
    ↓
Enter OTP
    ↓
Verified
```

---

## Test 2 — OTP negative cases

```text
Wrong OTP       → reject
Expired OTP     → reject
Reused OTP      → reject
Too many tries  → block
Repeated resend → rate-limit
```

---

## Test 3 — Identity Platform

```text
OTP SUCCESS
    ↓
User found/created
    ↓
Tenant UID
    ↓
Custom token
    ↓
Mobile signs in
    ↓
ID token issued
```

---

## Test 4 — Tenant isolation

```text
India tenant custom token
    ↓
India client authentication → success

Wrong tenant
    ↓
Authentication → fail
```

Google notes that a mismatch between the client tenant ID and the custom token tenant ID causes custom-token sign-in to fail.

Reference:
https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication

---

## Test 5 — PIN

```text
Correct PIN       → access
Wrong PIN         → reject
Repeated failures → lock
Forgot PIN        → SMS OTP
New PIN           → success
```

---

## Test 6 — New device

```text
New device
    ↓
Mobile number
    ↓
Vodafone OTP
    ↓
Verify
    ↓
Identity Platform
    ↓
Bind device
    ↓
Set PIN
```

---

# 27. Current POC vs target architecture

## Current POC

```text
Mobile
   ↓
Twilio Verify
   ↓
OTP verification
   ↓
Internal email mapping
   ↓
Identity Platform Email/Password
   ↓
Password login
```

## Target Farmer App

```text
Mobile
   ↓
Auth API
   ↓
Vodafone / Vi DLT-compliant SMS
   ↓
OTP verification
   ↓
Identity Platform tenant
   ↓
Custom token
   ↓
Farmer App
   ↓
Identity Platform session
```

Normal access:

```text
Bound device
   ↓
PIN
   ↓
Application/Auth API
   ↓
Access
```

Recovery/new device:

```text
Mobile
   ↓
Vodafone SMS OTP
   ↓
Identity verification
   ↓
Rebind/reset
```

---

# 28. Important implementation decisions to confirm

The following items are still requirements/dependencies, not assumptions:

1. Whether Vodafone/Vi provides SMS send only or an OTP verification API.
2. Whether the existing customer service already owns OTP generation.
3. Exact DLT entity/header/template setup.
4. Exact Vodafone API authentication mechanism.
5. Application database currently used by the Farmer App.
6. Exact device-binding mechanism.
7. Whether PIN verification is fully backend-controlled or partially local.
8. How a successful PIN verification establishes/refreshes an Identity Platform session.
9. Whether one tenant is sufficient or a dynamic customer-to-tenant resolver is required.
10. Token/session logout and revocation expectations.

---

# 29. Final target flow

```text
                         FARMER APP
                              │
                  ┌───────────┴───────────┐
                  │                       │
              First/new device       Normal access
                  │                       │
              Mobile Number              PIN
                  │                       │
                  ▼                       ▼
               AUTH API           PIN SERVICE
                  │                       │
                  ▼                       │
             VODAFONE / VI               │
             SMS / CPaaS                 │
                  │                       │
                  ▼                       │
                  OTP                    │
                  │                       │
                  ▼                       │
               OTP VERIFY                │
                  │                       │
                  └───────────┬───────────┘
                              ▼
                    IDENTITY PLATFORM
                       India Tenant
                              │
                              ▼
                         Farmer UID
                              │
                              ▼
                     Custom Token
                              │
                              ▼
                         FARMER APP
                              │
                              ▼
                  ID Token / Refresh Token
                              │
                              ▼
                     FARMER BACKEND APIs
```

---

## 30. Final checklist

### Vodafone/Vi
- [ ] API documentation received
- [ ] Test credentials received
- [ ] SMS endpoint confirmed
- [ ] OTP verify endpoint confirmed, if provided
- [ ] DLT entity confirmed
- [ ] DLT template confirmed
- [ ] Sender/header confirmed
- [ ] Delivery status confirmed

### Identity Platform
- [ ] Identity Platform enabled
- [ ] Multi-tenancy enabled
- [ ] India tenant available
- [ ] Tenant ID confirmed
- [ ] Tenant-aware Admin SDK configured
- [ ] Custom token creation tested
- [ ] Client tenant configured
- [ ] ID-token verification tested

### Backend
- [ ] Vodafone service
- [ ] OTP service
- [ ] Identity Platform service
- [ ] PIN service
- [ ] Device service
- [ ] Rate limits
- [ ] Audit logs
- [ ] Error handling
- [ ] Health endpoint

### GCP
- [ ] Cloud Run
- [ ] Runtime service account
- [ ] Secret Manager
- [ ] IAM
- [ ] Database
- [ ] Network controls
- [ ] Logging
- [ ] Monitoring

### Farmer App
- [ ] Mobile screen
- [ ] OTP screen
- [ ] Custom-token sign-in
- [ ] Device binding
- [ ] PIN setup
- [ ] PIN login
- [ ] Forgot PIN
- [ ] New-device recovery

---

## 31. References

### Google Cloud Identity Platform

- Custom authentication: https://docs.cloud.google.com/identity-platform/docs/web/custom
- Creating custom tokens: https://docs.cloud.google.com/identity-platform/docs/admin/create-custom-tokens
- Multi-tenant authentication: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication
- Multi-tenancy: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy
- Managing tenants: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants
- Tenant access control: https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-access-control

### Vodafone / Vi

The public Vi Business documentation describes CPaaS capabilities including SMS and customizable APIs. The exact API, authentication scheme and DLT configuration for the customer's current service must come from the customer's existing Vodafone/Vi integration documentation.

- Vi Business CPaaS: https://www.myvi.in/business/business-communications/cpaas-solutions

---

## 32. Summary

The target Farmer App architecture is:

```text
Farmer App
   ↓
Mobile Number
   ↓
Auth API
   ↓
Vodafone / Vi SMS
   ↓
OTP Verification
   ↓
Identity Platform Tenant
   ↓
Custom Token
   ↓
Farmer App
   ↓
Authenticated Identity Platform Session
```

Then:

```text
Bound Device
   ↓
PIN
   ↓
Normal day-to-day access
```

And for recovery:

```text
New Device / Reinstall / Forgot PIN
   ↓
Vodafone SMS OTP
   ↓
Re-verify identity
   ↓
Rebind / Reset PIN
```

This design keeps the responsibilities separated:

- Vodafone/Vi = external SMS/OTP layer
- Auth API = authentication broker/orchestration
- Identity Platform = identity and token layer
- Application = PIN and device-binding logic
- GCP = secure runtime and infrastructure
