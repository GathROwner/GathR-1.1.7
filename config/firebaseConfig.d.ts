// Type declarations for firebaseConfig.js
// This file tells TypeScript what types are exported from the JavaScript config file

import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';
import { FirebaseStorage } from 'firebase/storage';
import { Analytics } from 'firebase/analytics';
import { FirebaseApp } from 'firebase/app';
import { Functions } from 'firebase/functions';

// Declare the types of the exported variables
declare const auth: Auth;
declare const firestore: Firestore;
declare const storage: FirebaseStorage;
declare const analytics: Analytics | null;
declare const app: FirebaseApp;
declare const functions: Functions;
declare const useFirebaseEmulators: boolean;
declare const firebaseTarget: 'local-emulator' | 'staging' | 'production';

// Export the declarations to match the JavaScript exports
export { app, auth, firestore, functions, storage, analytics, useFirebaseEmulators, firebaseTarget };
