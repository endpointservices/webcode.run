import * as configcache from './configcache.mjs';
import {default as admin} from 'firebase-admin';

const cacheBase = admin.initializeApp({
    apiKey: "AIzaSyBquSsEgQnG_rHyasUA95xHN5INnvnh3gc",
    authDomain: "endpointserviceusers.firebaseapp.com",
    projectId: "endpointserviceusers",
    appId: "1:283622646315:web:baa488124636283783006e"
}, 'users');

configcache.setCacheFirebase(cacheBase);

test('configcache getNotebook reads from setNotebook', async () => {
    await configcache.setNotebook('ryow;foo', {"bar": "baz"});
    expect(await configcache.getNotebook('ryow;foo')).toEqual({
        "bar": "baz"
    })
});

test('configcache getDynamic for /observablehq.com/d/6eda90668ae03044;info', async () => {
    const cache = await configcache.getDynamic('/observablehq.com/d/6eda90668ae03044;info');
    expect(cache.secrets).toEqual(['tomlarkworthy_example_secret']);
});

test('configcache get for /observablehq.com/d/6eda90668ae03044;info merges secrets with setNotebook', async () => {
    await configcache.setNotebook('/observablehq.com/d/6eda90668ae03044;info', {"secrets": ['foo']});
    expect(await configcache.getNotebook('/observablehq.com/d/6eda90668ae03044;info')).toEqual(
        {"secrets": ['foo']})
    const cache = await configcache.get('/observablehq.com/d/6eda90668ae03044;info');
    expect(cache.secrets).toEqual(['tomlarkworthy_example_secret', 'foo']);
});

test('configcache get of unknown resolves to undefined', async () => {
    const cache = await configcache.get('blah', 'info');
    expect(cache).toBeUndefined();
});
