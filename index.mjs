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
import createError from "http-errors";
import {installRtdbRedirect} from './rtdb.mjs';

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
import {checkRate, OBSERVABLE_RATE_LIMIT, requestLimiter} from './limits.mjs';


// Periodic tasks
browsercache.scheduleCleanup();

// Cross cache tasks
configcache.setInvalidationCallback((namespace, endpointURL) => {
    browsercache.invalidate(namespace, endpointURL);
});

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

// Adapter to make Realtime Database requests get handled
installRtdbRedirect(app);

// Handler for observablehq.com notebooks
const responses = [];
app.all(observable.pattern, [
    async (req, res, next) => {  
        req.id = Math.random().toString(36).substr(2, 9);  
        req.requestConfig = observable.decode(req);
        req.cachedConfig = await configcache.get(req.requestConfig.endpointURL);
        next()
    },
    loopbreak,
    requestLimiter,
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

        const notebookURL = observable.notebookURL(req, req.cachedConfig);
        const shard = req.cachedConfig?.namespace || req.requestConfig.namespace || notebookURL;
        const closePage = async () => {
            if (page && !localmode && !page.isClosed()) {
                if (!req?.cachedConfig?.reusable) await page.close();
                page = undefined;

                if (shard === notebookURL) {
                    // can't close might be used by a parrallel request
                    // console.log(`Closing browser on shard ${shard}`);
                    // We used a notebookURL shard so kill the browser too as we know the true namespace now
                    // await (await browsers[shard]).close();
                }
            }
        }

        try {
            responses[req.id] = res;
            let pageReused = false;

            if (!req.cachedConfig || !req.cachedConfig.reusable) {
                page = await browsercache.newPage(shard, ['--proxy-server=127.0.0.1:8888']);
                // Tidy page on cancelled request
                req.on('close', closePage);
            } else {
                page = await browsercache.newPage(shard, ['--proxy-server=127.0.0.1:8888'], notebookURL);
                pageReused = page.setup !== undefined;
                if (!page.setup) page.setup = true;
            }

            if (req.cachedConfig) {
                await page.setUserAgent(useragent.encode({
                    terminal: req.cachedConfig.modifiers.includes("terminal"),
                    orchestrator: req.cachedConfig.modifiers.includes("orchestrator")
                }));
            }
            
            if (!pageReused) {
                try {
                    await checkRate(shard, OBSERVABLE_RATE_LIMIT);
                } catch (err) {
                    throw createError(429, "Shared OBSERVABLE_RATE_LIMIT exceeded, try the resuable flag");
                }

                await page.evaluateOnNewDocument((notebook) => {
                    window["@endpointservices.context"] = {
                        serverless: true,
                        notebook: notebook,
                        secrets: {}
                    };
                }, req.requestConfig.notebook);
                // Wire up logging
                page.on('console', message => logger.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
                    .on('pageerror', ({ message }) => logger.log(message))
                    .on('requestfailed', request => logger.log(`${request.failure().errorText} ${request.url()}`));
                
                // Wire up response channel
                await page.exposeFunction(
                    '@endpointservices.callback',
                    (reqId, operation, args) => {
                        if (!responses[reqId]) {
                            console.error("No response found for reqId: " + reqId);
                            return new Error("No response found");
                        } else if (operation === 'header') {
                            responses[reqId].header(args[0], args[1]);
                        } else if (operation === 'status') {
                            responses[reqId].status(args[0]);
                        } else if (operation === 'write') {
                            return new Promise((resolve, reject) => {
                                let chunk = args[0];
                                if (chunk.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                                    chunk = Buffer.from(chunk.value, 'base64')
                                } 
                                responses[reqId].write(chunk, (err) => err ? reject(err): resolve())
                            })
                        };
                    }
                );

                console.log(`Fetching: ${notebookURL}`);
                const pageResult = await page.goto(notebookURL, { waitUntil: 'domcontentloaded' });
                if (!pageResult.ok()) {
                    res.status(pageResult.status()).send(pageResult.statusText());
                    return;
                }

                if (pageResult.headers()['login']) {
                    page.namespace = pageResult.headers()['login'];
                };
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
            let namespace; 
            let executionContext;
            if (page.namespace) {
                namespace = page.namespace;
                executionContext = page;
            } else {
                executionContext = await waitForFrame();
                // iframe.url()
                // e.g. https://tomlarkworthy.static.observableusercontent.com/worker/embedworker.7fea46af439a70e4d3d6c96e0dfa09953c430187dd07bc9aa6b9050a6691721a.html?cell=buggy_rem
                namespace = executionContext.url().match(/^https:\/\/([^.]*)/)[1];
            }

            if (!pageReused) {
                logger.initialize({
                    project_id: process.env.GOOGLE_CLOUD_PROJECT,
                    location: undefined,
                    namespace,
                    notebook: req.requestConfig.notebook,
                    job: req.requestConfig.endpointURL,
                    task_id: req.id
                });
            }
            

            const deploymentHandle = await executionContext.waitForFunction(
                (name) => window["deployments"] && window["deployments"][name],
                {
                    timeout: 20000
                }, req.requestConfig.name);

            const deploymentConfig = await executionContext.evaluate(x => {
                return x.config;
              }, deploymentHandle
            );   
            

            // Update cache so we always have latest
            await configcache.setNotebook(req.requestConfig.endpointURL, {
                modifiers: deploymentConfig.modifiers || [],
                secrets: deploymentConfig.secrets || [],
                reusable: deploymentConfig.reusable || false,
                namespace
            });

            // This will be cached, and drive restart so be very carful as if it is not stable
            // we will have loops
            req.config = await configcache.get(req.requestConfig.endpointURL);

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
            }), modifiers: undefined, namespace: undefined, reusable: undefined};
            const remainingConfig = {...req.config,
                modifiers: undefined, namespace: undefined, reusable: undefined};
            
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

            const result = await executionContext.evaluate(
                (req, name, context) => window["deployments"][name](req, context),
                cellReq, req.requestConfig.name, context
            );    
            
            closePage();

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
            if (err.message.startsWith("waiting for function failed")) {
                err.message = `Deployment '${req.requestConfig.name}' not found, did you remember to publish your notebook, or is your deploy function slow?`
                err.status = 404;
            } else if (!err.status) {
                err.status = err.status || 500; // Default to 500 error code
            }
            console.error(err);

            closePage()
            const millis = Date.now() - t_start;

            logger.log({
                url: req.url,
                method: req.method,
                status: err.status,
                duration: millis
            });
            res.status(err.status).send(err.message);
        } finally {
            delete responses[req.id];
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


app.use('(/regions/:region)?/.stats', browsercache.statsHandler);


app.use((req, res) => {
    res.redirect(302, "https://observablehq.com/@endpointservices/webcode");
});

app.server = app.listen(process.env.PORT || 8080);
    
export const shutdown = async () => {
    console.log("Shutting down...")
    app.server.close();
    await browsercache.shutdown();
}

