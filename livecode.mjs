let debugFirebase = undefined;
import * as observable from './observable.mjs';

export const setLivecodeFirebase = (firebase) => debugFirebase = firebase;

export async function livecodeMiddleware(req, res, next) {
    try {
        // Priority given to anonymous paths
        const tunnelPath = req.requestConfig.correlation 
            ? `/services/http/debug/${req.requestConfig.correlation}`
            : req.cachedConfig?.debugger?.path
        if (tunnelPath) {
            // TODO, this watcher is introducing 70ms of latency, we should really just track the status with the dynamic config
            const status = await debugFirebase.database().ref(tunnelPath + "/status").once('value');
            if (/* old way */ status.val() === 'online' || /* new way */ status.val()?.state === 'online') {
                // todo unsubscribe when status leaves offline
                
                console.log("Tunneling request over", tunnelPath)
                const cellReq = observable.createCellRequest(req);
                const id = req.id;
    
                // SECURITY: Now we ensure all the secrets resolve and they are keyed by the domain being executed
                const namespace = req.cachedConfig.namespace;
                Object.keys(req.pendingSecrets || {}).map(key => {
                    if (!key.startsWith(namespace)) {
                        const err = new Error(`Notebooks by ${namespace} cannot access ${key}`);
                        err.status = 403;
                        throw err;
                    }
                });
                
                // Resolve all outstanding secret fetches
                const secrets = await resolveObject(req.pendingSecrets || {});
                // ergonomics improvement, strip namespace_ prefix of all secrets
                Object.keys(secrets).forEach(
                    secretName => secrets[secretName.replace(`${namespace}_`, '')] = secrets[secretName]);

                // mixin api_key
                if (req.cachedConfig.api_key) secrets.api_key = req.cachedConfig.api_key;
                
                debugFirebase.database().ref(tunnelPath + "/requests/" + id).set({
                    request: cellReq,
                    context: {
                        serverless: false,
                        namespace,
                        secrets
                    }
                });
    
                debugFirebase.database().ref(tunnelPath + "/requests/" + id + "/headers").on('child_added', snap => {
                    res.header(snap.key, snap.val())
                });
    
                debugFirebase.database().ref(tunnelPath + "/requests/" + id + "/status").on('value', snap => {
                    if (snap.val() === null) return; // ignore first null result
                    res.status(snap.val())
                });
    
                debugFirebase.database().ref(tunnelPath + "/requests/" + id + "/writes").on('child_added', snap => {
                    const chunk = snap.val();
                    if (chunk.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                        chunk = Buffer.from(chunk.value, 'base64')
                    } 
                    res.write(chunk);
                });
    
                debugFirebase.database().ref(tunnelPath + "/requests/" + id + "/response").on('value', snap => {
                    if (snap.val() === null) return; // ignore first null result
                    const result = JSON.parse(snap.val());
    
                    result.json ? res.json(result.json) : null;
    
                    if (result.send) {
                        if (result.send.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                            res.send(Buffer.from(result.send.value, 'base64'))
                        } else {
                            res.send(result.send)
                        }
                    }
    
                    result.end ? res.end() : null;
                });
    
            } else {
                console.log("Debugging receiver is not online");
                next();
            }
        } else {
            next();
        }
    } catch (err) {
        console.error(err);
        next();
    }
    
}

function resolveObject(obj) {
    return Promise.all(
      Object.entries(obj).map(async ([k, v]) => [k, await v])
    ).then(Object.fromEntries);
}
