import * as observable from './observable.mjs';
import {default as pathToRegexp} from 'path-to-regexp'
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
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "notebook":"echo-server",
        "path": "/",
        "name": "default",
        "namespace": "tomlarkworthy"
    })
});


test('Observable decode, default name, with path', () => {
    const url = "/observablehq.com/@tomlarkworthy/echo-server/mypath"
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "path": "/mypath",
        "notebook":"echo-server",
        "name": "default",
        "namespace": "tomlarkworthy"
    })
});


test('Observable decode, named cell, no path', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server;ping")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server;ping",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "path": "/",
        "notebook":"echo-server",
        "name": "ping",
        "namespace": "tomlarkworthy"
    })
});



test('Observable decode, named cell, with path', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server;ping/mypath")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server;ping",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "path": "/mypath",
        "notebook":"echo-server",
        "name": "ping",
        "namespace": "tomlarkworthy"
    })
});


test('Observable decode, link shared, named cell, with path', () => {
    const url = ("/observablehq.com/d/a1df3130b62f47ef;ping/mypath")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/d/a1df3130b62f47ef;ping",
        "notebookURL": "https://observablehq.com/embed/a1df3130b62f47ef",
        "path": "/mypath",
        "notebook":"d/a1df3130b62f47ef",
        "name": "ping"
    })
});


test('Observable decode, region match', () => {
    const url = ("/regions/us-east1/observablehq.com/@tomlarkworthy/echo-server")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "namespace": "tomlarkworthy"
    })
});


test('Observable decode, versioning', () => {
    const url = ("/observablehq.com/@tomlarkworthy/echo-server@31")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/@tomlarkworthy/echo-server@31",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server@31",
        "path": "/",
        "notebook":"echo-server",
        "name": "default",
        "version": "31",
        "namespace": "tomlarkworthy"
    })
});


test('Observable decode, versioning, link-shared', () => {
    const url = ("/observablehq.com/d/a1df3130b62f47ef@31")
    expect(observable.decode({
        url,
        params: params(url)
    })).toEqual({
        "baseURL": "/observablehq.com/d/a1df3130b62f47ef@31",
        "notebookURL": "https://observablehq.com/embed/a1df3130b62f47ef@31",
        "path": "/",
        "notebook":"d/a1df3130b62f47ef",
        "name": "default",
        "version": "31"
    })
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
