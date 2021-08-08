import * as configcache from './configcache.mjs';

test('configcache read your own writes', async () => {
    await configcache.set("ryow", 'foo', {"bar": "baz"});
    expect(await configcache.get("ryow", 'foo')).toEqual({
        "bar": "baz"
    })
});
