# GCP setup for WIF deployment

Project: project-c98d2dac-2409-44bd-aba

Deployment flow:

GitHub Actions
  -> Workload Identity Federation
  -> deployment service account
  -> Artifact Registry
  -> Cloud Run

The WIF provider should be restricted to the repository:
assertion.repository == "kirthi0071/identity-provider"

Prefer an additional branch condition for main.

The deployment service account needs, at minimum:
- Cloud Run Admin
- Artifact Registry Writer
- Service Account User on the runtime service account when Cloud Run uses a separate runtime service account.

Do not store a JSON key in GitHub.
