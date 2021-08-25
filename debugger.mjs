let debugFirebase = undefined;
import * as observable from './observable.mjs';

export const setDebugFirebase = (firebase) => debugFirebase = firebase;

export async function debuggerMiddleware(req, res, next) {

    if (req.cachedConfig?.debugger?.path) {
        const status = await debugFirebase.database().ref(req.cachedConfig.debugger.path + "/status").once('value');
        if (status.val() === 'online') {
            // todo unsubscribe when status leaves offline

            console.log("Tunneling request over", req.cachedConfig.debugger.path)
            const cellReq = observable.createCellRequest(req);
            const id = Math.random().toString(36).substr(2, 9);
            
            debugFirebase.database().ref(req.cachedConfig.debugger.path + "/requests/" + id).set({
                request: cellReq
            });

            debugFirebase.database().ref(req.cachedConfig.debugger.path + "/requests/" + id + "/headers").on('child_added', snap => {
                res.header(snap.key, snap.val())
            });

            debugFirebase.database().ref(req.cachedConfig.debugger.path + "/requests/" + id + "/status").on('value', snap => {
                if (snap.val() === null) return; // ignore first null result
                res.status(snap.val())
            });

            debugFirebase.database().ref(req.cachedConfig.debugger.path + "/requests/" + id + "/writes").on('child_added', snap => {
                const chunk = snap.val();
                if (chunk.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                    chunk = Buffer.from(chunk.value, 'base64')
                } 
                res.write(chunk);
            });

            debugFirebase.database().ref(req.cachedConfig.debugger.path + "/requests/" + id + "/response").on('value', snap => {
                if (snap.val() === null) return; // ignore first null result
                const result = snap.val();

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
            next();
        }
    } else {
        next();
    }
}