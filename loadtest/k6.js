// k6 version of the load test, to run from a cloud load generator against STAGING (never production).
//
//   k6 run -e API=https://api-staging.example.in -e WEB=https://staging.example.in loadtest/k6.js
//
// Staging must run with DISABLE_IP_LIMITS=true (all virtual users share a few addresses). To test only
// the public pages, set -e SAVE_RATE=0.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://localhost:4000';
const WEB = __ENV.WEB || '';
const SAVE_RATE = Number(__ENV.SAVE_RATE || 0.15);

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10000 },
        { duration: '2m', target: 10000 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:api}': ['p(95)<500'],
  },
};

const json = { headers: { 'content-type': 'application/json' } };

export default function () {
  if (WEB) http.get(`${WEB}/`);
  const file = http.get(`${API}/public/schemes/delhi`, { tags: { kind: 'api' } });
  check(file, { 'scheme file ok': (r) => r.status === 200 });
  const session = `k6-${__VU}-${Math.random().toString(16).slice(2, 12)}`;
  for (let i = 0; i < 3; i++) {
    http.post(`${API}/events`, JSON.stringify({ consent: true, sessionId: session, device: 'mobile', events: [{ type: 'page_view' }, { type: 'state_selected', state: 'Delhi' }] }), {
      headers: { 'content-type': 'text/plain' },
      tags: { kind: 'api' },
    });
    sleep(0.3 + Math.random() * 0.5);
  }
  if (Math.random() < SAVE_RATE) {
    const mobile = `9${String(100000000 + __VU * 1000 + __ITER).slice(-9)}`;
    const body = {
      mode: 'personal', state: 'Delhi', district: 'West Delhi', address: { house: '65', locality: 'Shakti Colony', pincode: '110059' }, family: null,
      people: [{ name: 'Asha Devi', relation: 'Self', mobile, gender: 'Female', age: 34, education: 'Secondary', occupation: 'Daily Wages', income: 100000, category: 'OBC', minority: false, special: [] }],
      consent: { details: true, tracking: true }, sessionId: session,
    };
    const res = http.post(`${API}/registrations`, JSON.stringify(body), { ...json, tags: { kind: 'api' } });
    check(res, { 'form saved': (r) => r.status === 201 });
  }
  sleep(1 + Math.random() * 2);
}
