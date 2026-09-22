# Backend Authentication Flow — Tenant + Mobile Number + Password

## Description

This document explains how the current Identity Provider POC uses Node.js/Express, Twilio Verify and Google Cloud Identity Platform to provide a **mobile-number + password** authentication experience inside an Identity Platform tenant.

The current POC uses one configured tenant, `India-p9rv0`. Dynamic customer-to-tenant resolution is a future enhancement and is intentionally **not implemented yet**.

---

## 1. Overall flow

### New user registration

~~~text
Mobile Number
      ↓
POST /auth/send-otp
      ↓
Node.js Backend
      ↓
Twilio Verify
      ↓
SMS OTP
      ↓
User enters OTP
      ↓
POST /auth/verify-otp
      ↓
Twilio Verification Check
      ↓
OTP approved
      ↓
Signed temporary OTP session
      ↓
POST /auth/register
      ↓
Tenant-aware Identity Platform Auth
      ↓
Create tenant user
      ↓
Identity Platform password authentication
      ↓
ID Token + Refresh Token
~~~

### Existing user login

~~~text
Mobile Number + Password
          ↓
POST /auth/login
          ↓
Normalize mobile number
          ↓
Select Identity Platform tenant
          ↓
Find tenant user by phoneNumber
          ↓
Get internal email
          ↓
Identity Platform signInWithPassword
          ↓
ID Token + Refresh Token
~~~

---

# 2. How the tenant is achieved

Identity Platform multi-tenancy creates separate user/authentication silos inside the same Google Cloud project. Each tenant has its own users and authentication configuration. citeturn0search2turn0search0

Current POC:

~~~text
Google Cloud Project
        |
        +-------------------------+
        |                         |
    India Tenant             Future Tenant B
    India-p9rv0                <tenant-id>
        |
        +---- Users
~~~

The current backend receives:

~~~text
IDENTITY_PLATFORM_TENANT_ID=India-p9rv0
~~~

The backend reads the tenant ID:

~~~javascript
const tenantId = process.env.IDENTITY_PLATFORM_TENANT_ID || "";
~~~

Then creates a tenant-aware Auth client:

~~~javascript
const tenantAuth =
  getAuth().tenantManager().authForTenant(tenantId);
~~~

This is the key part that makes user management tenant-specific. Google documents `authForTenant(tenantId)` for tenant-specific user operations. citeturn0search0

---

# 3. How mobile number + password is achieved

The user sees:

~~~text
Mobile Number + Password
~~~

But the current Identity Platform tenant password flow uses Email/Password.

Therefore the POC uses:

~~~text
             USER EXPERIENCE

        Mobile Number + Password
                    |
                    v
             Node.js Backend
                    |
       +------------+-------------+
       |                          |
       v                          v
  Phone lookup              Internal email
       |                          |
       +------------+-------------+
                    |
                    v
          Identity Platform
           Email/Password
                    |
                    v
              Authentication
~~~

The internal email is derived deterministically from the phone number.

Example:

~~~text
Phone:
+919344160867

Internal email:
9344160867@identity-provider.invalid
~~~

The user never needs to know this internal email.

The actual phone number is also stored on the Identity Platform user as the phone number.

---

# 4. Why Twilio is used

Twilio and Identity Platform have different responsibilities.

### Twilio

Twilio is responsible for proving that the user controls the mobile number:

~~~text
Mobile number
      ↓
Twilio Verify
      ↓
SMS OTP
      ↓
OTP verification
~~~

### Identity Platform

Identity Platform is responsible for:

~~~text
Tenant
  ↓
User
  ↓
Password authentication
  ↓
ID token
  ↓
Refresh token
~~~

So the simple explanation is:

~~~text
Twilio =
Mobile ownership verification

Identity Platform =
Tenant + password authentication
~~~

---

# 5. Registration flow in detail

## Step 1 — Send OTP

Frontend calls:

~~~http
POST /auth/send-otp
~~~

Backend:

1. Normalizes the phone number.
2. Reads Twilio credentials from Secret Manager.
3. Calls Twilio Verify.
4. Twilio sends the SMS.

Example:

~~~text
9344160867
      ↓
+919344160867
      ↓
Twilio Verify
      ↓
SMS
~~~

The backend does not generate or store the OTP.

---

## Step 2 — Verify OTP

Frontend calls:

~~~http
POST /auth/verify-otp
~~~

Backend sends the OTP to Twilio Verification Check.

~~~text
User OTP
   ↓
Backend
   ↓
Twilio Verify Check
   ↓
approved
~~~

After approval, the backend creates a signed temporary OTP session.

The session contains:

~~~text
normalized phone
expiry timestamp
~~~

It is signed using:

~~~text
OTP_SESSION_SECRET
~~~

Current expiry:

~~~text
10 minutes
~~~

---

## Step 3 — Register user

Frontend calls:

~~~http
POST /auth/register
~~~

with:

~~~text
phone
password
otpToken
~~~

Backend validates:

- Tenant is configured.
- OTP session is valid.
- OTP belongs to the same phone.
- OTP has not expired.
- Password has at least 8 characters.
- Phone number is not already registered in the tenant.

---

# 6. Creating the tenant user

Backend creates:

~~~javascript
const tenantAuth =
  getAuth().tenantManager().authForTenant(tenantId);
~~~

Then checks:

~~~javascript
tenantAuth.getUserByPhoneNumber(phone);
~~~

If no user exists, it creates:

~~~javascript
tenantAuth.createUser({
  email,
  password,
  phoneNumber: phone,
  disabled: false
});
~~~

Example Identity Platform record:

~~~text
Tenant:
India-p9rv0

UID:
generated by Identity Platform

Phone:
+919344160867

Internal email:
9344160867@identity-provider.invalid

Password:
managed by Identity Platform
~~~

Identity Platform generates the UID when the backend does not provide one. Tenant-specific user creation is supported by the Admin SDK. citeturn0search0

The user then appears under:

~~~text
Identity Platform
      ↓
Users
      ↓
Scope to tenant
      ↓
India
~~~

---

# 7. Login flow in detail

The returning user only provides:

~~~text
Mobile Number
Password
~~~

No OTP is required.

Frontend calls:

~~~http
POST /auth/login
~~~

### Step 1 — Normalize phone

~~~text
9344160867
91 9344160867
+91 9344160867
        ↓
+919344160867
~~~

### Step 2 — Select tenant

Backend creates the tenant-aware Auth client:

~~~javascript
const tenantAuth =
  getAuth().tenantManager().authForTenant(tenantId);
~~~

Current tenant:

~~~text
India-p9rv0
~~~

### Step 3 — Find user by phone

Backend:

~~~javascript
tenantAuth.getUserByPhoneNumber(phone);
~~~

Result:

~~~text
UserRecord
   ↓
user.email
   ↓
9344160867@identity-provider.invalid
~~~

### Step 4 — Verify password

Backend sends the internal email, password and tenant ID to:

~~~text
Identity Platform
accounts:signInWithPassword
~~~

Conceptually:

~~~json
{
  "email": "9344160867@identity-provider.invalid",
  "password": "<user-password>",
  "returnSecureToken": true,
  "tenantId": "India-p9rv0"
}
~~~

If the password is correct:

~~~text
ID Token
Refresh Token
Expiry
User ID
Tenant ID
~~~

are returned.

Google documents tenant-specific password sign-in and tenant context for authentication. citeturn0search1

---

# 8. Why the tenant matters during login

The tenant is part of the authentication context.

Example:

~~~text
Tenant A
   |
   +-- +919344160867
       |
       +-- User A


Tenant B
   |
   +-- +919344160867
       |
       +-- User B
~~~

The backend must use the correct tenant before calling:

~~~text
getUserByPhoneNumber()
~~~

and before performing password authentication.

Therefore the logical identity is:

~~~text
Tenant + User
~~~

not only:

~~~text
Phone number
~~~

---

# 9. Credentials and secrets

The backend uses separate credentials for each system.

### Identity Platform Admin SDK

Cloud Run uses:

~~~text
identity-provider-runtime@project-c98d2dac-2409-44bd-aba.iam.gserviceaccount.com
~~~

IAM:

~~~text
roles/identitytoolkit.admin
roles/secretmanager.secretAccessor
~~~

The Firebase Admin SDK uses Cloud Run Application Default Credentials.

### Identity Platform REST API

The backend uses:

~~~text
IDENTITY_PLATFORM_API_KEY
~~~

Secret Manager secret:

~~~text
identity-platform-api-key
~~~

### Twilio

The backend uses:

~~~text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
~~~

Secret Manager secrets:

~~~text
twilio-account-sid
twilio-auth-token
twilio-verify-service-sid
~~~

### OTP session signing

~~~text
OTP_SESSION_SECRET
~~~

Secret Manager secret:

~~~text
otp-session-secret
~~~

No secret values are stored in GitHub source code.

---

# 10. Why there is no password database

The application does not store passwords in:

~~~text
Firestore
Cloud SQL
PostgreSQL
MongoDB
~~~

Instead:

~~~text
User password
      ↓
Identity Platform
      ↓
Identity Platform manages authentication
~~~

The backend is responsible for the authentication flow but Identity Platform is responsible for password authentication.

---

# 11. Complete backend flow

~~~text
                        USER
                         |
                 Mobile Number
                         |
                         v
                 +---------------+
                 |   Frontend    |
                 +-------+-------+
                         |
                         | HTTPS
                         v
                 +---------------+
                 | Node / Express|
                 |   Cloud Run   |
                 +-------+-------+
                         |
              +----------+----------+
              |                     |
              v                     v
       +-------------+       +--------------------+
       | Twilio      |       | Identity Platform  |
       | Verify      |       |                    |
       | SMS OTP     |       | Tenant: India      |
       +-------------+       |                    |
                             | User               |
                             | - UID              |
                             | - Phone            |
                             | - Internal email   |
                             | - Password         |
                             +---------+----------+
                                       |
                                       v
                                ID Token / Refresh
                                       |
                                       v
                                  Frontend
~~~

---

# 12. Current POC vs future dynamic tenants

## Current POC

~~~text
Cloud Run
   ↓
IDENTITY_PLATFORM_TENANT_ID
   ↓
India-p9rv0
   ↓
authForTenant()
   ↓
Tenant user
~~~

This is intentionally hardcoded/configured for the POC.

## Future customer architecture

When the customer creates more tenants:

~~~text
Mobile/Web App
      ↓
Customer identifier
      ↓
Backend
      ↓
Tenant Resolver
      ↓
Customer → tenantId
      ↓
Validate tenant
      ↓
authForTenant(tenantId)
      ↓
Identity Platform
~~~

Possible customer identification:

- Customer ID
- Tenant slug
- Subdomain
- Domain
- Invitation
- Deep link
- Mobile application configuration

The frontend should not be allowed to select an arbitrary tenant ID without backend validation.

Identity Platform supports tenant lifecycle management through the Admin SDK. citeturn0search0

---

# 13. Future mobile application flow

The same backend architecture can be used by an Android or iOS application.

### Registration

~~~text
Mobile App
    ↓
Customer/Tenant identification
    ↓
Mobile number
    ↓
Send OTP
    ↓
Twilio SMS
    ↓
Verify OTP
    ↓
Create password
    ↓
Backend creates tenant user
    ↓
Identity Platform authentication
    ↓
ID Token
    ↓
Authenticated
~~~

### Login

~~~text
Mobile App
    ↓
Customer/Tenant identification
    ↓
Mobile number + password
    ↓
Backend
    ↓
Find user inside tenant
    ↓
Identity Platform password verification
    ↓
ID Token
    ↓
Authenticated
~~~

---

# 14. Token flow

After successful authentication:

~~~text
Identity Platform
       ↓
ID Token + Refresh Token
       ↓
Frontend / Mobile App
~~~

For protected APIs, the backend should verify the ID token and verify that its tenant context is appropriate for the requested resource. Google documents tenant-aware ID-token verification with the Admin SDK. citeturn0search0

---

# 15. Important security rules

1. Never trust an arbitrary tenant ID from an untrusted client.
2. Resolve and validate the tenant on the backend.
3. Use a tenant-aware Admin SDK client for tenant user operations.
4. Never store passwords in the application's database.
5. Never put Twilio credentials in frontend code.
6. Never expose Secret Manager values in source code or logs.
7. Use Secret Manager for backend secrets.
8. Use WIF for GitHub Actions instead of a long-lived Google service-account JSON key.
9. Add rate limiting before production OTP traffic.
10. Protect OTP endpoints against SMS abuse and SMS pumping.

---

# 16. Interview explanation

> We use Identity Platform multi-tenancy to isolate users by customer. In our current POC, the backend receives the India tenant ID and creates a tenant-aware Auth client. During registration, Twilio verifies ownership of the mobile number through OTP. After verification, the backend creates the user inside that tenant with the mobile number and a deterministic internal email, while Identity Platform manages the password. During login, the backend finds the user inside the same tenant using the mobile number, gets the internal email, and authenticates the password through Identity Platform with the tenant ID. So the customer sees a simple mobile-number-and-password experience while the actual authentication is tenant-scoped.

---

# 17. Final flow

~~~text
Mobile Number
     ↓
Twilio OTP
     ↓
Phone ownership verified
     ↓
Selected Tenant
     ↓
Tenant-aware Identity Platform Auth
     ↓
User created inside tenant
     ↓
Internal email + password
     ↓
Identity Platform password authentication
     ↓
Tenant-scoped authentication
     ↓
ID Token + Refresh Token
~~~

**Current POC:** one configured tenant, India-p9rv0.

**Future production:** dynamically resolve customer → tenant ID on the backend, then create/use the tenant-aware Auth client.
