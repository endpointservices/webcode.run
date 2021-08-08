process.env.mode = 'test';
import {app, shutdown} from './index.mjs';
import * as supertest from 'supertest';

test('Serverside unexpected route', async () => {
    await supertest.default(app)
        .get('/random')
        .expect(404);
});

test('Serverside notebook smoke LEGACY route', async () => {
    await supertest.default(app)
        .put('/notebooks/@tomlarkworthy/echo-server/deployments/echo')
        .send('cool')
        .expect(200);
}, 30000);

test('/observablehq.com/@tomlarkworthy/echo-server;echo responds to PUT', async () => {
    await supertest.default(app)
        .put('/observablehq.com/@tomlarkworthy/echo-server;echo')
        .send('cool')
        .expect(200, "cool");
}, 30000);


test('/observablehq.com/@endpointservices/d/72412b3f07ab976f@34 responds to GET', async () => {
    await supertest.default(app)
        .get('/observablehq.com/d/72412b3f07ab976f')
        .expect(200, "secretadmin@endpointservice.iam.gserviceaccount.com");
}, 30000);

test('/observablehq.com/@endpointservices/serverless-cell-tests;example_getContext responds to GET', async () => {
    await supertest.default(app)
        .get('/observablehq.com/@endpointservices/serverless-cell-tests;example_getContext')
        .expect(200, {
            "serverless":true,
            "namespace":"endpointservices",
            "notebook":"serverless-cell-tests",
            "secrets":{}
        });
}, 30000);

test('/observablehq.com/@endpointservices/serverless-cell-tests;contextFields responds to GET', async () => {
    await supertest.default(app)
        .get('/observablehq.com/@endpointservices/serverless-cell-tests;contextFields')
        .expect(function(res) {
            res.body.headers.host = 'something';
        })
        .expect(200, {
            baseUrl: '/observablehq.com/@endpointservices/serverless-cell-tests;contextFields',
            url: '/',
            method: 'GET',
            query: {},
            headers: {
                host: 'something',
                'accept-encoding': 'gzip, deflate',
                connection: 'close'
            },
            ip: '::ffff:127.0.0.1'
        });
}, 30000);



afterAll(async () => {
    await shutdown();
});
