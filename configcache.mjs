import * as _ from 'lodash-es';
const cache = {};

let cacheFirebase;

export const setCacheFirebase = (firebase) => cacheFirebase = firebase;

// To be called to indicate an endpoint has changes and any resources should be purged
let invalidationCallback = (namespace, baseURL) => {}
export const setInvalidationCallback = (callback) => invalidationCallback = callback;

// For config defined in notebooks
export const setNotebook = async (endpointURL, config) => cache[endpointURL] = config;
export const getNotebook = async (endpointURL) => cache[endpointURL];



// Todo race when two request come in for same cache
export const get = async (endpointURL) => {
    const dynamic = await getDynamic(endpointURL);
    const notebook = await getNotebook(endpointURL);

    if (dynamic === undefined && notebook === undefined) {
        return undefined;
    }

    return _.mergeWith(_.cloneDeep(dynamic), notebook, (objValue, srcValue) => {
        if (_.isArray(objValue)) {
            return objValue.concat(srcValue);
        }
    });
}

// For config defined in Firestore
const cacheFirestore = {};
export const getDynamic = async (endpointURL) => {
    endpointURL = endpointURL.substring(1);
    if (endpointURL in cacheFirestore) return cacheFirestore[endpointURL];
    else {
        console.log(`Subscribing to config for ${endpointURL}`)
        // create subscription to watch for changes
        const firestore = cacheFirebase.firestore();
        const configDoc = firestore.doc(
            `/services/http/endpoints/${encodeURIComponent(endpointURL)}`
        );
        let hasResolved = false;
        cacheFirestore[endpointURL] = new Promise(resolve => {
            // update cache on change
            configDoc.onSnapshot(snap => {
                const record = snap.data();
                cacheFirestore[endpointURL] = record && {
                    modifiers: [],
                    reusable: false,
                    ...record,
                    secrets: Object.keys(record.secrets || {})
                };
                if (record) invalidationCallback(record.namespace, endpointURL);
                if (!hasResolved) {
                    hasResolved = true;
                    resolve(cacheFirestore[endpointURL]);
                }
            })
        });
    }
    return cacheFirestore[endpointURL];
}
