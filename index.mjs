process.env.GOOGLE_CLOUD_PROJECT = "endpointservice";
import {default as express} from 'express';
import {default as admin} from 'firebase-admin';
import {default as bodyParser} from 'body-parser';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import cors from 'cors';
import * as routes from './routes.mjs';
import * as observable from './observable.mjs';
import * as useragent from './useragent.mjs';
import * as configcache from './configcache.mjs';
import * as browsercache from './browsercache.mjs';
import {promiseRecursive} from './utils.mjs';
import {loopbreak} from './loopbreak.mjs';
import {debuggerMiddleware, setDebugFirebase} from './debugger.mjs';
import {Logger} from './logging.mjs';
import {default as compression} from 'compression';
import {puppeteerProxy} from './puppeteer.mjs';
import * as _ from 'lodash-es';

const firebase = admin.initializeApp({
    apiKey: "AIzaSyD882c8YEgeYpNkX01fhpUDfioWl_ETQyQ",
    authDomain: "endpointservice.firebaseapp.com",
    projectId: "endpointservice",
    databaseURL: "https://endpointservice-eu.europe-west1.firebasedatabase.app/"
});

const users = admin.initializeApp({
    apiKey: "AIzaSyBquSsEgQnG_rHyasUA95xHN5INnvnh3gc",
    authDomain: "endpointserviceusers.firebaseapp.com",
    projectId: "endpointserviceusers",
    appId: "1:283622646315:web:baa488124636283783006e",
}, 'users');

configcache.setCacheFirebase(firebase);
setDebugFirebase(firebase)

const secretsClient = new SecretManagerServiceClient({
    projectId: "endpointservice"
});

export const app = express();

app.use(cors({
    origin: true // Use origin.header
}));
app.use(bodyParser.raw({type: '*/*', limit: '50mb'})); // This means we buffer the body, really we should move towards streaming
app.use(compression());

// RATE LIMITERS
import {checkRate, BURSTABLE_RATE_LIMIT, limiter} from './limits.mjs';


const localmode = process.env.LOCAL || false;

// Start loading secrets ASAP in the background
async function lookupSecret(key) {
    // Access the secret.
    const [accessResponse] = await secretsClient.accessSecretVersion({
        name: `projects/1986724398/secrets/${key}/versions/latest`,
    });
    const responsePayload = accessResponse.payload.data.toString('utf8');
    return responsePayload;
}

// Legacy route, forward to other handler
app.all(routes.pattern, async (req, res) => {
    const {
        shard,
        userURL,
        deploy,
    } = routes.decode(req);
    req.url = `/observablehq.com/${shard};${deploy}${userURL}`;
    app.handle(req, res);
});

// Handler for observablehq.com notebooks
app.all(observable.pattern, [
    async (req, res, next) => {    
        req.requestConfig = observable.decode(req);
        req.cachedConfig = await configcache.get(req.requestConfig.baseURL);
        next()
    },
    loopbreak,
    limiter,
    async (req, res, next) => { 
        if (req.cachedConfig) {
            req.pendingSecrets = (req.cachedConfig.secrets || []).reduce(
                (acc, key) => {
                    acc[key] = lookupSecret(key);
                    return acc;
                },
                {}
            );
        }
        next()
    },
    debuggerMiddleware,
    async (req, res, next) => { 
        let page = null;
        const throwError = (status, message) => {
            const err = new Error(message);
            err.status = status;
            throw err;
        }
        // Default no cache in CDN
        res.header('Cache-Control', 'no-store');

        const logger = new Logger();

        const t_start = Date.now();

        const notebookURL = req.requestConfig.notebookURL;
        const shard = req.cachedConfig?.namespace || req.requestConfig.namespace || notebookURL;
        const closePage = async () => {
            if (page && !localmode && !page.isClosed()) {
                await page.close(); page = undefined;

                if (shard === notebookURL) {
                    // can't close might be used by a parrallel request
                    // console.log(`Closing browser on shard ${shard}`);
                    // We used a notebookURL shard so kill the browser too as we know the true namespace now
                    // await (await browsers[shard]).close();
                }
            }
        }

        try {
            page = await browsercache.newPage(shard, ['--proxy-server=127.0.0.1:8888']);

            // Tidy page on cancelled request
            req.on('close', closePage);

            await page.evaluateOnNewDocument((notebook) => {
                window["@endpointservices.context"] = {
                    serverless: true,
                    notebook: notebook,
                    secrets: {}
                };
            }, req.requestConfig.notebook);

            if (req.cachedConfig) {
                await page.setUserAgent(useragent.encode({
                    terminal: req.cachedConfig.modifiers.includes("terminal"),
                    orchestrator: req.cachedConfig.modifiers.includes("orchestrator")
                }));
            }
            

            // Wire up logging
            page.on('console', message => logger.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
                .on('pageerror', ({ message }) => logger.log(message))
                .on('requestfailed', request => logger.log(`${request.failure().errorText} ${request.url()}`))

            console.log(`Fetching: ${notebookURL}`);
            const pageResult = await page.goto(notebookURL, { waitUntil: 'domcontentloaded' })
            if (!pageResult.ok()) {
                res.status(pageResult.status()).send(pageResult.statusText());
                return;
            }

            function waitForFrame() {
                let fulfill;
                const promise = new Promise(x => fulfill = x);
                checkFrame();
                return promise;
                
                function checkFrame() {
                    const frame = page.frames().find(iframe => {
                        // console.log("iframe.url()" + iframe.url())
                        return iframe.url().includes('observableusercontent')
                    });
                    if (frame)
                        fulfill(frame);
                    else
                        setTimeout(checkFrame, 25)
                }
            }
            const iframe = await waitForFrame();
            // iframe.url()
            // e.g. https://tomlarkworthy.static.observableusercontent.com/worker/embedworker.7fea46af439a70e4d3d6c96e0dfa09953c430187dd07bc9aa6b9050a6691721a.html?cell=buggy_rem
            const namespace = iframe.url().match(/^https:\/\/([^.]*)/)[1];

            logger.initialize({
                project_id: process.env.GOOGLE_CLOUD_PROJECT,
                location: undefined,
                namespace,
                notebook: req.requestConfig.notebook,
                job: req.requestConfig.baseURL,
                task_id: Math.random().toString(36).substr(2, 9)
            });

            const deploymentHandle = await iframe.waitForFunction(
                (name) => window["deployments"] && window["deployments"][name],
                {
                    timeout: 20000
                }, req.requestConfig.name);

            const deploymentConfig = await iframe.evaluate(x => {
                return x.config;
              }, deploymentHandle
            );   
            

            // Update cache so we always have latest
            await configcache.setNotebook(req.requestConfig.baseURL, {
                modifiers: deploymentConfig.modifiers || [],
                secrets: deploymentConfig.secrets || [],
                namespace
            });

            // This will be cached, and drive restart so be very carful as if it is not stable
            // we will have loops
            req.config = await configcache.get(req.requestConfig.baseURL);

            // Now we decide to restart or not
            // If the modifiers change we just need to rerun the loopbreaking logic
            if (req.cachedConfig === undefined || 
                !_.isEqual(req.cachedConfig.modifiers, req.config.modifiers)) {
                let nextCalled = false;
                loopbreak(req, res, () => nextCalled = true)
                if (!nextCalled) {
                    return;
                }
            }

            // The namespace can change (we just ran the code in the wrong browser shard but functionally 
            // for the user it should not matter)
            // Anything else though (only SECRETs at present) should restart.
            const remainingCachedConfig = {...(req.cachedConfig || {
                secrets: []
            }), modifiers: undefined, namespace: undefined};
            const remainingConfig = {...req.config,
                modifiers: undefined, namespace: undefined};
            
            if (!_.isEqual(remainingConfig, remainingCachedConfig)) {
                console.log("Config change, rerequesting");
                return app.handle(req, res); // Do the whole thing again
            };

            // SECURITY: Now we ensure all the secrets resolve and they are keyed by the domain being executed
            Object.keys(req.pendingSecrets || {}).map(key => {
                if (!key.startsWith(namespace)) {
                    throwError(403, `Notebooks by ${namespace} cannot access ${key}`)
                }
            });
            
            // Resolve all outstanding secret fetches
            const secrets = await promiseRecursive(req.pendingSecrets || {});
            // ergonomics improvement, strip namespace_ prefix of all secrets
            Object.keys(secrets).forEach(
                secretName => secrets[secretName.replace(`${namespace}_`, '')] = secrets[secretName]);

            // Resolve all the promises
            const context = {
                serverless: true,
                namespace,
                notebook: req.requestConfig.notebook,
                secrets: secrets
            };

            const cellReq = observable.createCellRequest(req);

            const pHeader = page.exposeFunction(
                '@endpointservices.header',
                (header, value) => {
                    res.header(header, value)
                }
            );

            const pStatus = page.exposeFunction(
                '@endpointservices.status',
                (status) => {
                    res.status(status)
                }
            );

            const pWrite = page.exposeFunction(
                '@endpointservices.write',
                (chunk) => new Promise((resolve, reject) => {
                    if (chunk.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                        chunk = Buffer.from(chunk.value, 'base64')
                    } 
                    res.write(chunk, (err) => err ? reject(err): resolve())
                })  
            );
            await Promise.all([pHeader, pStatus, pWrite]);
            const result = await iframe.evaluate(
                (req, name, context) => window["deployments"][name](req, context),
                cellReq, req.requestConfig.name, context
            );    
            
            if (!localmode) {
                await page.close();
                page = undefined;
            }

            const millis = Date.now() - t_start;
            
            result.json ? res.json(result.json) : null;

            if (result.send) {
                if (result.send.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                    res.send(Buffer.from(result.send.value, 'base64'))
                } else {
                    res.send(result.send)
                }
            }

            result.end ? res.end() : null;

            logger.log({
                url: req.url,
                method: req.method,
                status: 200 || result.status,
                duration: millis
            });

        } catch (err) {
            let status;
            if (err.message.startsWith("waiting for function failed")) {
                err.message = `Deployment '${req.requestConfig.name}' not found, did you remember to publish your notebook, or is your deploy function slow?`
                status = 404;
            } else {
                console.error(err);
                status = err.status || 500;
            }

            closePage()
            const millis = Date.now() - t_start;

            logger.log({
                url: req.url,
                method: req.method,
                status,
                duration: millis
            });
            res.status(status).send(err.message);
        }
    }
]);

app.use('(/regions/:region)?/puppeteer', async (req, res, next) => {
    try {
        const decoded = await users.auth().verifyIdToken(req.query.token)
        console.log("puppeteer user", decoded.uid);
        next();
    } catch (err) {
        console.error(err);
        res.status(403).send(err.message)
    }
});
app.use('(/regions/:region)?/puppeteer', puppeteerProxy);


app.use('(/regions/:region)?/.stats', browsercache.stats);


app.use((req, res) => {
    res.redirect(302, "https://observablehq.com/@tomlarkworthy/webcode");
});

app.server = app.listen(process.env.PORT || 8080);
    
export const shutdown = async () => {
    console.log("Shutting down...")
    app.server.close();
    await browsercache.shutdown();
}

