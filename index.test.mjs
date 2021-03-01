process.env.mode = 'test';
import {app} from './index.mjs';
import * as supertest from 'supertest';

test('Serverside unexpected route', async () => {
    await supertest.default(app)
        .get('/random')
        .expect(404);
});

test('Serverside notebook smoke route', async () => {
    await supertest.default(app)
        .get('/notebooks/@tomlarkworthy/echo-server/deployments/echo')
        .expect(200);
}, 30000);

afterAll(() => {
    app.server.close();
});
