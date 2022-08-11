import * as observable from './observable.mjs';
import {default as pathToRegexp} from 'path-to-regexp';
const keys = [];
const regexp = pathToRegexp(observable.pattern, keys)
console.log(regexp);

function params(url) {
    const ret = {};
    const values = [...regexp.exec(url)].slice(1);
    for (let i = 0; i < keys.length; i++) {
        if (values[i]) ret[keys[i].name] = values[i];
    }
    return ret;
}


test('Observable decode, default name, no path', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "notebook":"echo-server",
        "path": "/",
        "name": "default",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server');
});


test('Observable decode, default name, with path', () => {
    const url = "/observablehq.com/@tomlarkworthy/echo-server/mypath"
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "path": "/mypath",
        "notebook":"echo-server",
        "name": "default",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server');
});


test('Observable decode, named cell, no path', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server;ping")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server;ping",
        "path": "/",
        "notebook":"echo-server",
        "name": "ping",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server');
});


test('Observable decode, named cell, with path', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server;ping/mypath")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server;ping",
        "path": "/mypath",
        "notebook":"echo-server",
        "name": "ping",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server');
});


test('Observable decode, link shared, named cell, with path', () => {
    const url = ("/observablehq.com/d/a1df3130b62f47ef;ping/mypath");
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/d/a1df3130b62f47ef;ping",
        "path": "/mypath",
        "notebook":"d/a1df3130b62f47ef",
        "name": "ping"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/a1df3130b62f47ef')
});


test('Observable decode, region match', () => {
    const url = ("/regions/us-east1/observablehq.com/@tomlarkworthy/echo-server")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server');
});


test('Observable decode, versioning', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server@31")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server@31",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "version": "31",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server@31');
});


test('Observable decode version, correlation', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server@31;default;4dcE")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@tomlarkworthy/echo-server@31;default",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "version": "31",
        "correlation": "4dcE",
        "namespace": "tomlarkworthy"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@tomlarkworthy/echo-server@31');
});


test('Observable decode, versioning, link-shared', () => {
    const url = ("/observablehq.com/d/a1df3130b62f47ef@31")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/d/a1df3130b62f47ef@31",
        "path": "/",
        "notebook":"d/a1df3130b62f47ef",
        "name": "default",
        "version": "31"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/a1df3130b62f47ef@31');
});

test('Observable decode, versioning, suffix', () => {
    const url = ("/observablehq.com/@n/name/10@31")
    const req = {
        url,
        params: params(url)
    }
    expect(observable.decode(req)).toEqual({
        "endpointURL": "/observablehq.com/@n/name/10@31",
        "path": "/",
        "notebook":"name/10",
        "name": "default",
        "version": "31",
        "namespace": "n"
    });
    expect(observable.notebookURL(req)).toEqual('https://observablehq.com/embed/@n/name/10@31');
});


test('Observable notebookURL, versioning, link-shared, api-key', () => {
    const url = ("/observablehq.com/d/a1df3130b62f47ef@31")
    const req = {
        hostname: "https://webcode.run",
        url,
        params: params(url)
    }
    expect(observable.notebookURL(req, {api_key: "key"}))
        .toEqual('https://webcode.run/observablehq.com/@endpointservices/embed/d/a1df3130b62f47ef@31?api_key=key');
});

test('canHost', () => {
    expect(observable.canHost(
        "https://observablehq.com/embed/a1df3130b62f47ef@31", 
        "/observablehq.com/d/a1df3130b62f47ef@31"
    )).toBe(true);
});



test('parseEndpointURL codehost, id, version, name', () => {
    expect(observable.parseEndpointURL(
        "/observablehq.com/d/defr4eds@244;ping"
    )).toEqual({
        codehost: 'observablehq.com',
        id: 'defr4eds',
        version: 244,
        name: 'ping'
    });
});

test('parseEndpointURL codehost, namespace, notebook', () => {
    expect(observable.parseEndpointURL(
        "/observablehq.com/@tomlarkworthy/foo"
    )).toEqual({
        codehost: 'observablehq.com',
        namespace: 'tomlarkworthy',
        notebook: 'foo',
        name: 'default'
    });
});

test('parseEndpointURL correlation', () => {
    expect(observable.parseEndpointURL(
        "/observablehq.com/@tomlarkworthy/foo;default;abcd"
    )).toEqual({
        codehost: 'observablehq.com',
        namespace: 'tomlarkworthy',
        notebook: 'foo',
        name: 'default',
        correlation: 'abcd'
    });
});



/*
test('Observable decode, with param', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server?foo")
    expect(observable.decode({
        url: url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server?foo",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "namespace": "tomlarkworthy"
    })
});*/
