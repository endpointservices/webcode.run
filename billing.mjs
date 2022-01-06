// Subscribe to single doc firebase list of PRO accounts.
let pros = {};


export const setBillingFirebase = (firebase) => new Promise(resolve => {
    const firestore = firebase.firestore();
    firestore.doc(`/services/billing/config/subs`).onSnapshot(snap => {
        pros = Object.fromEntries(
            Object.keys(snap.data().pro).map(k => [k, 'pro'])
        );  
        resolve();    
    });
});

// Check will check namespace if it is PRO
export const isPro = (namespace) => !!pros[namespace]