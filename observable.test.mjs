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


test('Observbale patterns default', () => {
    const p = params("observablehq.com/@tomlarkworthy/echo-server")
    expect(observable.decode({
        params: p
    })).toEqual({
        "notebookURL": "https://observablehq.com/embed/@tomlarkworthy/echo-server",
        "path": "/",
        "name": "default"
    })
});
