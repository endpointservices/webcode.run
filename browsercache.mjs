import {default as puppeteer} from 'puppeteer';
import * as useragent from './useragent.mjs';
import * as observable from './observable.mjs';
import * as os from 'os';
import {promiseRecursive} from './utils.mjs';
const localmode = process.env.LOCAL || false;

const browsers = {}; // Cache of promises

const CLEANUP_CHECK_PERIOD_HOURS = 2;
const BROWSER_IDLE_CLEANUP_HOURS = 4;

// Closes browsers that have not been used in a while
export async function cleanup () {
    Object.keys(browsers).forEach(async shard => {
        const entry = browsers[shard];
        if (Date.now() - entry.lastUsed > 1000 * 60 * 60 * BROWSER_IDLE_CLEANUP_HOURS) {
            console.log(`Cleanup browser for ${shard}`);
            const browser = await entry.browser;
            delete browsers[shard];
            browser.close();
        }
    })
}

export function scheduleCleanup() {
    console.log("scheduled cleanup...")
    try {
        cleanup();
    } catch (err) {
        console.log(err);
    }
    setTimeout(scheduleCleanup, CLEANUP_CHECK_PERIOD_HOURS * 60 * 60 * 1000);
}

export async function newPage(shard, args = []) {
    if (browsers[shard] === undefined) {
        console.log(`Launching new browser on shard ${shard}`);
        browsers[shard] = {
            lastUsed: Date.now(),
            browser: puppeteer.launch({ 
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
                    '--allow-running-insecure-content', // Allow access to http sites too (BUG: does not work in headless mode https://github.com/puppeteer/puppeteer/issues/3741)
                    localmode ? '--disable-features=site-per-process': '', // Helps keep iframe detection working https://github.com/puppeteer/puppeteer/issues/5123#issuecomment-559158303 when using devtools
                    `--user-agent=${useragent.base}` // We set it on a per page but incase we forget we set it here too
                ]
            })
        };
    }

    const entry = browsers[shard];
    entry.lastUsed = Date.now();
    const page = await (await entry.browser).newPage();
    
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
    });

    return page;
}

export const getPage = async (shard, url) => {
    const entry = browsers[shard];
    if (!entry) return undefined;
    const pages = await (await browsers[shard].browser).pages();
    return pages.find((page => page.url() === url));
}

export async function shutdown () {
    Object.keys(browsers).forEach(async shard => {
        await (await browsers[shard]).close()
    });
}

export const invalidate = async (namespace, endpointURL) => {
    const entry = browsers[namespace];
    if (!entry) return;
    const browser = await entry.browser;
    const pages = await browser.pages();
    pages.forEach(page => {
        const embedURL = page.url()
        if (observable.canHost(embedURL, endpointURL) && !page.isClosed()) {
            page.close();
        }
    })
    
}

export const stats = async () => ({
        // cpus: os.cpus(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        browsers: {
            ...Object.fromEntries(await promiseRecursive(Object.keys(browsers).map(async (namespace) => 
                [namespace, {
                    pages: await promiseRecursive((await (await browsers[namespace].browser).pages()).map(async (page) => ({
                        title: await page.title(),
                        url: page.url(),
                        metrics: await page.metrics(),
                    })))
                }]
            )))
        }
    });

export const statsHandler = async (req, res) => {
    res.json(await stats());
}
    
