import { EventEmitter } from 'events';

// This is a simple event emitter that will be used to globally handle
// specific types of errors, like Firestore permission errors.
// Using a singleton pattern to ensure the same instance is used across the app.
export const errorEmitter = new EventEmitter();
