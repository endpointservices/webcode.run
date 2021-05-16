process.env.GOOGLE_CLOUD_PROJECT = "endpointservice";
import {default as express} from 'express';
import {default as admin} from 'firebase-admin';
admin.initializeApp();
import {default as bodyParser} from 'body-parser';
import {default as puppeteer} from 'puppeteer';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import cors from 'cors';
import * as routes from './routes.mjs';
import * as useragent from './useragent.mjs';
import {Logger} from './logging.mjs';
import {default as compression} from 'compression'

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
import {checkRate, BURSTABLE_RATE_LIMIT} from './limits.mjs';


let browsers = {}; // Cache of promises

const localmode = process.env.LOCAL || false;

async function newPage(shard) {
    if (browsers[shard] === undefined) {
        browsers[shard] = puppeteer.launch({ 
            ...(process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD && {executablePath: 'google-chrome-stable'}),
            devtools: localmode,
            args: [
                `--disk-cache-dir=/tmp/${shard}`,
                `--media-cache-dir=/tmp/${shard}`,
                `--media-cache-size=1000000`, // 1MB
                `--disk-cache-size=1000000`,
                '--no-sandbox', // Not necissary if running with --cap-add=SYS_ADMIN
                '--no-zygote',
                '--disable-gpu',
                '--mute-audio',
                '--disable-dev-shm-usage',
                '--disable-web-security', // Turn off CORS
                localmode ? '--disable-features=site-per-process': '', // Helps keep iframe detection working https://github.com/puppeteer/puppeteer/issues/5123#issuecomment-559158303 when using devtools
                `--user-agent=${useragent.base}` // We set it on a per page but incase we forget we set it here too
            ]
        })

    }
    const page = await (await browsers[shard]).newPage();
    
    await page.setRequestInterception(true)
    
    page.on('request', interceptedRequest => {
        const hostname = new URL(interceptedRequest.url()).hostname;
        if (hostname.endsWith(".internal") || // Prevent access to e.g. Metadata server
            hostname === "127.0.0.1" ||
            hostname === "0.0.0.0") {
            interceptedRequest.abort()
        } else {
            // Note we can't mutate fetch requests until https://github.com/puppeteer/puppeteer/issues/2781
            interceptedRequest.continue()
        }
    })

    return page;
}

app.all(routes.pattern, async (req, res) => {
    
    const {
        shard,
        notebookURL,
        notebook,
        baseURL,
        userURL,
        secretKeys,
        deploy,
        hasMods,
        isExternal,
        isTerminal,
        isOrchestrator,
    } = routes.decode(req);


    const {
        isExternalUA,
        isTerminalUA,
        isOrchestratorUA,
    } = useragent.decode(req.get('user-agent'));

    // Loop prevention
    if (hasMods) {
        if (isOrchestratorUA && !isOrchestrator) {
            // Orchestrator cells can call other cells
        } else if (isOrchestratorUA && isOrchestrator) {
            return res.status(403).send("Orchestrator cells cannot call other orchestrator cells");
        } else if (!isExternalUA && isExternal) {
            return res.status(403).send("External Serverless Cells cannot be called by other Serverless Cells");
        } else if (isTerminalUA) {
            return res.status(403).send("Terminal Serverless Cells cannot call other Serverless Cells");
        } else if (isTerminal) {
            // Terminal cells can be called by anyone, but then they cannot propogate
        } else if (isExternalUA && (isExternal || isOrchestrator)) {
            // External Serverless cells can be called by external UAs
        } else {
            const message = `Unexpected combination ${req.get('user-agent')} ${isTerminal} ${isOrchestrator} ${isExternal}`
            return res.status(403).send(message);
        }
    }

    try {
        checkRate(req.ip,  BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
        checkRate(req.url, BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
    } catch (err) {
        console.log("Burstable limit hit");
        res.header('Retry-After', '2')
        // res.status(503).send("Burstable rate limit of 1 request per exceeded");
        return res.status(429).send("Burstable rate limit of 1 request per second exceeded");
    }


    // Start loading secrets ASAP in the background
    async function lookup(key) {
        // Access the secret.
        const [accessResponse] = await secretsClient.accessSecretVersion({
            name: `projects/1986724398/secrets/${key}/versions/latest`,
        });
        const responsePayload = accessResponse.payload.data.toString('utf8');
        return responsePayload;
    }
    const secrets = secretKeys.reduce(
        (acc, key) => {
            acc[key] = lookup(key);
            return acc;
        },
        {}
    )

    let page = null;
    // Default no cache in CDN
    res.header('Cache-Control', 'no-store');

    const logger = new Logger();

    const t_start = Date.now();

    try {

        page = await newPage(shard);

        // Tidy page on cancelled request
        req.on('close', async function (err) {
            if (page && !localmode) await page.close(); page = undefined;
        });

        await page.evaluateOnNewDocument((notebook) => {
            window["@endpointservices.context"] = {
                serverless: true,
                notebook: notebook,
                secrets: {}
            };
        }, notebook);
        await page.setUserAgent(useragent.encode({
            terminal: isTerminal,
            orchestrator: isOrchestrator
        }));
        

        // Wire up logging
        page.on('console', message => logger.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
            .on('pageerror', ({ message }) => logger.log(message))
        //    .on('response', response => logger.log(`${response.status()} ${response.url()}`))
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
            notebook: notebook,
            job: notebookURL,
            task_id: Math.random().toString(36).substr(2, 9)
        });


        // SECURITY: Now we ensure all the secrets resolve and they are keyed by the domain being executed
        
        Object.keys(secrets).map(key => {
            if (!key.startsWith(namespace)) throw new Error(`Notebooks by ${namespace} cannot access ${key}`)
        });

        // Resolve all the promises
        const context = {
            serverless: true,
            namespace,
            notebook: notebook,
            secrets: await resolveObject(secrets) // Resolve all outstanding secret fetches
        };

        await iframe.waitForFunction(
            (deploy) => window["deployments"] && window["deployments"][deploy],
            {
                timeout: 20000
            }, deploy);

        const hasBody = Object.keys(req.body).length !== 0;
        const cellReq = {
            baseUrl: baseURL,
            url: userURL,
            method: req.method,
            ...hasBody && {body: req.body.toString()},
            cookies: req.cookies,
            query: req.query,
            headers: req.headers,
            ip: req.ip,
        }

        page.exposeFunction(
            '@endpointservices.header',
            (header, value) => res.header(header, value)
        );

        page.exposeFunction(
            '@endpointservices.status',
            (status) => res.status(status)
        );

        page.exposeFunction(
            '@endpointservices.write',
            (chunk) => new Promise((resolve, reject) => {
                if (chunk.ARuRQygChDsaTvPRztEb === "bufferBase64") {
                    chunk = Buffer.from(chunk.value, 'base64')
                } 
                res.write(chunk, (err) => err ? reject(err): resolve())
            })  
        );

        const result = await iframe.evaluate(
            (req, deploy, context) => window["deployments"][deploy](req, context),
            cellReq, deploy, context
        );    
         
        if (!localmode) await page.close(); page = undefined;

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
            err.message = `Deployment '${deploy}' not found, did you remember to publish your notebook, or is your deploy function slow?`
            status = 404;
        } else {
            console.error(err);
            status = 500;
        }

        if (page && !localmode) await page.close(); page = undefined;
        const millis = Date.now() - t_start;

        logger.log({
            url: req.url,
            method: req.method,
            status,
            duration: millis
        });
        res.status(status).send(err.message);
    }
});

app.use((req, res) => {
    res.status(404).send("Request not handled");
});

app.server = app.listen(process.env.PORT || 8080);

function resolveObject(obj) {
    return Promise.all(
      Object.entries(obj).map(async ([k, v]) => [k, await v])
    ).then(Object.fromEntries);
}
