"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileCanWriteAdmin = profileCanWriteAdmin;
exports.requireFullAdmin = requireFullAdmin;
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/v2/https");
// Profiles are authoritative, so a stale ADMIN token cannot survive demotion.
// Modern accessRole takes precedence even when legacy role is still Admin.
function profileCanWriteAdmin(profile) {
    if (!profile)
        return false;
    if ('accessRole' in profile)
        return profile.accessRole === 'ADMIN';
    return profile.role === 'Admin' || (Array.isArray(profile.roles) && profile.roles.includes('Admin'));
}
async function requireFullAdmin(uid, readProfile = async (id) => (await admin.firestore().collection('users').doc(id).get()).data()) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in to continue.');
    if (!profileCanWriteAdmin(await readProfile(uid))) {
        throw new https_1.HttpsError('permission-denied', 'Administrator write access is required.');
    }
    return uid;
}
//# sourceMappingURL=admin-access.js.map