import * as billing from './billing.mjs';
import {default as admin} from 'firebase-admin';

const testFirebase = admin.initializeApp({
    apiKey: "AIzaSyBquSsEgQnG_rHyasUA95xHN5INnvnh3gc",
    authDomain: "endpointserviceusers.firebaseapp.com",
    projectId: "endpointserviceusers",
    appId: "1:283622646315:web:baa488124636283783006e"
}, 'users');

test('Namespace `endpointservices` isPro', async () => {
    await billing.setBillingFirebase(testFirebase);
    expect(billing.isPro('endpointservices')).toEqual(true);
});

