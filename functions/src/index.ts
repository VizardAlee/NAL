
import * as admin from "firebase-admin";

admin.initializeApp();

// We will add our callable functions here.
export * from "./users";
export * from "./deals";
export * from "./automation";
