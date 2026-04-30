# Deployment Environment

Server actions that create invites, write protected admin records, fund deals, or send notifications use the Firebase Admin SDK. These actions need Admin SDK credentials in the deployed server runtime.

## Required Production Variables

Set either this single JSON variable:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

or set all three individual variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

`FIREBASE_PRIVATE_KEY` must include the full private key, including the `BEGIN PRIVATE KEY` and `END PRIVATE KEY` lines. It may use escaped newlines (`\n`) or real newlines.

## Firebase App Hosting

Firebase App Hosting supports runtime variables and Cloud Secret Manager references through `apphosting.yaml`. Keep private keys in Secret Manager, not in git.

Example:

```yaml
env:
  - variable: FIREBASE_PROJECT_ID
    value: studio-1298078893-e7941
    availability:
      - RUNTIME
  - variable: FIREBASE_CLIENT_EMAIL
    secret: firebaseClientEmail
    availability:
      - RUNTIME
  - variable: FIREBASE_PRIVATE_KEY
    secret: firebasePrivateKey
    availability:
      - RUNTIME
```

Create the secrets with:

```bash
firebase apphosting:secrets:set firebaseClientEmail
firebase apphosting:secrets:set firebasePrivateKey
```

Then redeploy the backend so the live site receives the runtime variables.
