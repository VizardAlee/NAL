# Deployment Environment

Server actions that create invites, write protected admin records, fund deals, or send notifications use the Firebase Admin SDK. In Firebase App Hosting, the app should use the backend's managed service account through Application Default Credentials.

## Firebase App Hosting

The web client forces Firestore long-polling by default because it is more
reliable behind buffering proxies, VPNs, antivirus products, and restrictive
mobile networks. On a deployment where normal Firestore streaming has been
verified as reliable, set:

```text
NEXT_PUBLIC_FIRESTORE_FORCE_LONG_POLLING=false
```

This setting is public client configuration and is not a secret.

The deployed App Hosting runtime only needs the project ID in `apphosting.yaml`:

```yaml
env:
  - variable: FIREBASE_PROJECT_ID
    value: studio-1298078893-e7941
    availability:
      - RUNTIME
```

The App Hosting backend service account must have access to the Firebase services used by server actions. The backend currently runs as:

```text
firebase-app-hosting-compute@studio-1298078893-e7941.iam.gserviceaccount.com
```

## Local Development

For local development outside Firebase App Hosting, set either this single JSON variable:

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
