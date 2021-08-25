import * as _ from 'lodash-es';
const cache = {};

const endpointURL = (baseURL, name) => `${baseURL};${name}`

let cacheFirebase;

export const setCacheFirebase = (firebase) => cacheFirebase = firebase;


// For config defined in notebooks
export const setNotebook = async (baseURL, config) => cache[baseURL] = config;
export const getNotebook = async (baseURL) => cache[baseURL];


export const get = async (baseURL, name) => {
    const dynamic = await getDynamic(baseURL);
    const notebook = await getNotebook(baseURL, name);

    if (dynamic === undefined && notebook === undefined) {
        return undefined;
    }

    return _.mergeWith(dynamic, notebook, (objValue, srcValue) => {
        if (_.isArray(objValue)) {
            return objValue.concat(srcValue);
        }
    });
}

// For config defined in Firestore
const cacheFirestore = {};
export const getDynamic = async (endpointURL) => {
    endpointURL = endpointURL.substring(1);
    if (cacheFirestore[endpointURL] !== undefined) return cacheFirestore[endpointURL];
    else {
        // create subscription to watch for changes
        const firestore = cacheFirebase.firestore();
        const configDoc = firestore.doc(
            `/services/http/endpoints/${encodeURIComponent(endpointURL)}`
        );
        let config = undefined;
        config = await new Promise(resolve => {
            // update cache on change
            configDoc.onSnapshot(snap => {
                const record = snap.data();
                cacheFirestore[endpointURL] = record && {
                    modifiers: [],
                    ...record,
                    secrets: Object.keys(record.secrets || {})
                };
                if (!config) resolve(cacheFirestore[endpointURL]);
            })
        });
        return config;
    }
}
