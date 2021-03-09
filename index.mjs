process.env.GOOGLE_CLOUD_PROJECT = "endpointservice";
import {default as express} from 'express';
import {default as admin} from 'firebase-admin';
admin.initializeApp();
import {default as bodyParser} from 'body-parser';
import {default as puppeteer} from 'puppeteer';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import cors from 'cors';
import * as routes from './routes.mjs';
import {Logger} from './logging.mjs';

const secretsClient = new SecretManagerServiceClient({
    projectId: "endpointservice"
});

export const app = express();
app.use(cors({
    origin: true // Use origin.header
}));
app.use(bodyParser.raw({type: '*/*'})); // This means we buffer the body, really we should move towards streaming

// RATE LIMITERS
import {checkRate, BURSTABLE_RATE_LIMIT} from './limits.mjs';


let browsers = {};

async function newPage(shard) {
    if (browsers[shard] === undefined) {
        browsers[shard] = await puppeteer.launch({ 
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
                '--user-agent=observablehq.com/@tomlarkworthy/serverside-cells'
            ]
        })

    }
    const page = await browsers[shard].newPage();
    
    await page.setRequestInterception(true)
    
    page.on('request', interceptedRequest => {
        const hostname = new URL(interceptedRequest.url()).hostname;
        if (hostname.endsWith(".internal") || // Prevent access to e.g. Metadata server
            hostname === "127.0.0.1" ||
            hostname === "0.0.0.0") {
            interceptedRequest.abort()
        } else {
            interceptedRequest.continue()
        }
    })

    return page;
}

app.all(routes.pattern, async (req, res) => {
    try {
        checkRate(req.ip,  BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
        checkRate(req.url, BURSTABLE_RATE_LIMIT, Date.now() * 0.001);
    } catch (err) {
        console.log("Burstable limit hit");
        res.header('Retry-After', '2')
        // res.status(503).send("Burstable rate limit of 1 request per exceeded");
        res.status(429).send("Burstable rate limit of 1 request per second exceeded");
        return;
    }
    
    const {
        shard,
        notebookURL,
        notebook,
        userURL,
        secretKeys,
        deploy,
    } = routes.decode(req);


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

        // Wire up logging (TODO pipe to user log files too)
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
                const frame = page.frames().find(iframe => iframe.url().includes('observableusercontent'));
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
            secrets: await resolveObject(secrets) // Resolve all outstanding secret fetches
        }

        await iframe.waitForFunction(
            (deploy) => window["deployments"] && window["deployments"][deploy],
            {
                timeout: 20000
            }, deploy);

        const hasBody = Object.keys(req.body).length !== 0;
        const cellReq = {
            url: userURL,
            method: req.method,
            ...hasBody && {body: req.body.toString()},
            cookies: req.cookies,
            query: req.query,
            headers: req.headers,
            ip: req.ip,
        }
        
        const result = await iframe.evaluate(
            (req, deploy, context) => window["deployments"][deploy](req, context),
            cellReq, deploy, context);

        await page.close();

        const millis = Date.now() - t_start;

        
        for (const [header, value] of Object.entries(result.headers || {})) {
            res.header(header, value);
        }
        result.status ? res.status(result.status) : null;
        result.json ? res.json(result.json) : null;
        result.send ? res.send(result.send) : null;
        result.end ? res.end() : null;

        logger.log({
            url: req.url,
            method: req.method,
            status: 200 || result.status,
            duration: millis
        });

    } catch (err) {
        if (page) await page.close();
        const millis = Date.now() - t_start;
        let status;
        if (err.message.startsWith("waiting for function failed")) {
            err.message = `Deployment '${deploy}' not found, did you remember to publish your notebook?`
            status = 404;
        } else {
            console.log("Error: ", err.message);
            status = 500;
        }

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