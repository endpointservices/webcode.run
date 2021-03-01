import * as routes from './routes.mjs';
import {default as pathToRegexp} from 'path-to-regexp'
const keys = [];
const regexp = pathToRegexp(routes.pattern, keys)

function params(url) {
    const ret = {};
    const values = [...regexp.exec(url)].slice(1);
    for (let i = 0; i < keys.length; i++) {
        if (values[i]) ret[keys[i].name] = values[i];
    }
    return ret;
}


test('Route patterns default', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "secretKeys": [],
        "userURL": "/",
        "deploy": "default"
    })
});

test('Route patterns simple', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "secretKeys": [],
        "userURL": "/",
        "deploy": "echo"
    })
});

test('Route patterns simple with secrets', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/secrets/a,b")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "secretKeys": ["a","b"],
        "userURL": "/" ,
        "deploy": "echo"
    })
});

test('Route patterns simple with user URL', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/yoyoyo")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "secretKeys": [],
        "userURL": "/yoyoyo" ,
        "deploy": "echo"
    })
});

test('Route patterns simple with secrets with user URL', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/secrets/e/yoyoyo")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "secretKeys": ["e"],
        "userURL": "/yoyoyo",
        "deploy": "echo"
    })
});

test('Route patterns simple with cell', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/cells/cell")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server?cell=cell",
        "secretKeys": [],
        "userURL": "/",
        "deploy": "echo"
    })
});

test('Route patterns simple with cell and user URL', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/cells/cell/yoyoyo")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server?cell=cell",
        "secretKeys": [],
        "userURL": "/yoyoyo",
        "deploy": "echo"
    })
});


test('Route patterns simple with secrets with cell', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/secrets/a/cells/cell")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server?cell=cell",
        "secretKeys": ["a"],
        "userURL": "/",
        "deploy": "echo"
    })
});

test('Route patterns simple with secrets with cell and user URL', () => {
    const p = params("/notebooks/@tomlarkworthy/echo-server/deployments/echo/secrets/c,d/cells/cell/yoyoyo")
    expect(routes.decode({
        params: p
    })).toEqual({
        "shard": "@tomlarkworthy/echo-server",
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server?cell=cell",
        "secretKeys": ["c", "d"],
        "userURL": "/yoyoyo",
        "deploy": "echo"
    })
});
