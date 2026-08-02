import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type AdminStorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

function readEnv(name: string): string | undefined {
    return process.env[name] || process.env[name.toLowerCase()];
}

function normalizePrivateKey(raw: string | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    const unquoted =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
            ? trimmed.slice(1, -1)
            : trimmed;
    return unquoted.replace(/\\n/g, '\n');
}

function parseServiceAccountJson(raw: string | undefined): ServiceAccount | undefined {
    if (!raw) return undefined;

    try {
        const parsed = JSON.parse(raw);
        return {
            projectId: parsed.project_id || parsed.projectId,
            clientEmail: parsed.client_email || parsed.clientEmail,
            privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey),
        };
    } catch {
        return undefined;
    }
}

function getServiceAccount(): ServiceAccount | undefined {
    const jsonAccount = parseServiceAccountJson(readEnv('FIREBASE_SERVICE_ACCOUNT_JSON'));
    if (jsonAccount?.projectId && jsonAccount.clientEmail && jsonAccount.privateKey) {
        return jsonAccount;
    }

    const projectId =
        readEnv('FIREBASE_PROJECT_ID') ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT;
    const clientEmail = readEnv('FIREBASE_CLIENT_EMAIL');
    const privateKey = normalizePrivateKey(readEnv('FIREBASE_PRIVATE_KEY'));

    if (!projectId || !clientEmail || !privateKey) {
        return undefined;
    }

    return {
        projectId,
        clientEmail,
        privateKey,
    };
}

function canUseApplicationDefaultCredentials() {
    return Boolean(
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        process.env.K_SERVICE
    );
}

function isManagedRuntime() {
    return Boolean(process.env.K_SERVICE);
}

function initializeWithApplicationDefaultCredentials() {
    return admin.initializeApp({
        projectId:
            readEnv('FIREBASE_PROJECT_ID') ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCLOUD_PROJECT,
    });
}

// This function ensures the Firebase Admin app is initialized only once,
// which is crucial in a serverless environment like Next.js.
export function getAdminApp() {
    // If the app is already initialized, return the existing instance.
    if (admin.apps.length > 0) {
        return admin.apps[0]!;
    }

    if (isManagedRuntime()) {
        return initializeWithApplicationDefaultCredentials();
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return initializeWithApplicationDefaultCredentials();
    }

    const serviceAccount = getServiceAccount();
    if (serviceAccount) {
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    if (canUseApplicationDefaultCredentials()) {
        return initializeWithApplicationDefaultCredentials();
    }

    throw new Error(
        'Firebase Admin SDK credentials are not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in the server runtime, or set FIREBASE_SERVICE_ACCOUNT_JSON.'
    );
}

function getAdminDb(): Firestore {
    return getFirestore(getAdminApp());
}

function getAdminStorageBucket(): AdminStorageBucket {
    const bucketName =
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT}.firebasestorage.app`;
    return getStorage(getAdminApp()).bucket(bucketName);
}

// Keep existing imports build-safe: Firebase Admin is initialized only when a
// server action/API route actually touches Firestore, not when Next imports the module.
export const adminDb = new Proxy({} as Firestore, {
    get(_target, property, receiver) {
        const db = getAdminDb();
        const value = Reflect.get(db, property, receiver);
        return typeof value === 'function' ? value.bind(db) : value;
    },
});

// Like adminDb, defer Storage initialization until a server action actually
// needs the private bucket. Agreement archives are never exposed to clients
// through Firebase Storage rules.
export const adminStorageBucket = new Proxy({} as AdminStorageBucket, {
    get(_target, property, receiver) {
        const bucket = getAdminStorageBucket();
        const value = Reflect.get(bucket, property, receiver);
        return typeof value === 'function' ? value.bind(bucket) : value;
    },
});
