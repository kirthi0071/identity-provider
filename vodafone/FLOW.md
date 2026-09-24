Vodafone + Identity Platform Application Flow

1. Signup / first authentication

Farmer App
  -> mobile number
  -> Auth API on Cloud Run
  -> Vodafone/Vi SMS or OTP provider
  -> SMS reaches farmer
  -> farmer enters OTP
  -> Auth API verifies OTP
  -> tenant-aware Identity Platform Auth
  -> find or create farmer UID
  -> createCustomToken(uid)
  -> return custom token
  -> Farmer App sets tenantId = India-p9rv0
  -> signInWithCustomToken()
  -> Identity Platform
  -> ID Token + Refresh Token
  -> authenticated app
  -> device binding
  -> set PIN

2. Normal day-to-day access

Bound device
  -> PIN
  -> application PIN verification
  -> normal business access

No SMS is required for normal access on the trusted/bound device.

3. New device / reinstall

New device
  -> mobile number
  -> Auth API
  -> Vodafone/Vi OTP
  -> verify OTP
  -> resolve Identity Platform UID
  -> create tenant-aware custom token
  -> client sign-in
  -> bind new device
  -> set PIN

4. Forgot PIN

Forgot PIN
  -> mobile number
  -> Vodafone/Vi OTP
  -> verify identity
  -> Identity Platform authentication
  -> reset PIN

5. GCP infrastructure

GitHub
  -> GitHub Actions / WIF
  -> deployment service account
  -> Artifact Registry
  -> Cloud Run
  -> runtime service account
  -> Identity Platform
  -> Secret Manager
  -> optional Cloud SQL / application database

6. Identity Platform token flow

Auth API
  -> tenantManager()
  -> authForTenant(India-p9rv0)
  -> getUserByPhoneNumber() or createUser()
  -> createCustomToken(uid)
  -> Farmer App
  -> auth.tenantId = India-p9rv0
  -> signInWithCustomToken()
  -> Identity Platform
  -> ID Token + Refresh Token

Google documents that the custom token gets tenant context from the tenant-aware Auth instance and that the client tenant ID must match the token tenant ID.

7. Provider abstraction

SmsProvider
  |-- MockSmsProvider: local POC
  |-- VodafoneSmsProvider: production implementation after API contract is received

8. Responsibility split

Farmer App: mobile UI, OTP UI, PIN UI, client Identity Platform session.
Auth API: OTP orchestration, Vodafone integration, farmer lookup, custom token creation.
Vodafone/Vi: SMS/OTP provider and DLT configuration according to customer setup.
Identity Platform: tenant identity, UID, custom token exchange, ID/refresh tokens.
Application database: farmer business data, PIN verifier, device binding, optional OTP challenge state.
Secret Manager: provider credentials and application secrets.
Cloud Run: secure runtime.
