import * as browsercache from './browsercache.mjs';


test('browsercache returns stats', async () => {
    const stats = await browsercache.stats()
    expect(stats).toHaveProperty("browsers");
    expect(stats).toHaveProperty("freemem");
});

test('browsercache cleanup does not throw', async () => {
    await browsercache.cleanup()
});
