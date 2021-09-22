import {default as puppeteer} from 'puppeteer';
import * as useragent from './useragent.mjs';
import * as os from 'os';
import {promiseRecursive} from './utils.mjs';
const localmode = process.env.LOCAL || false;

const browsers = {}; // Cache of promises

export async function newPage(shard, args = []) {
    if (browsers[shard] === undefined) {
        console.log(`Launching new browser on shard ${shard}`);
        browsers[shard] = puppeteer.launch({ 
            ...(process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD && {executablePath: 'google-chrome-stable'}),
            devtools: localmode,
            args: [
                ...args,
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

export async function shutdown () {
    Object.keys(browsers).forEach(async shard => {
        await (await browsers[shard]).close()
    });
}

export const stats = async (req, res) => {
    res.json({
        // cpus: os.cpus(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        browsers: {
            ...Object.fromEntries(await promiseRecursive(Object.keys(browsers).map(async (namespace) => 
                [namespace, {
                    pages: await promiseRecursive((await (await browsers[namespace]).pages()).map(async (page) => ({
                        title: await page.title(),
                        url: page.url(),
                        metrics: await page.metrics(),
                    })))
                }]
            )))
        }
    });
}
    
