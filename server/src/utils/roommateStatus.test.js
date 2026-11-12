const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const databasePath = require.resolve('../config/database');
const originalDatabase = require.cache[databasePath];
const calls = [];
let responses = [];
const fakeDatabase = { execute: async (sql, args) => {
    calls.push({ sql, args });
    assert.ok(responses.length, 'Unexpected database query');
    return [responses.shift()];
} };
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: fakeDatabase };
const controller = require('../controllers/roommateController');
const tenantOnly = require('../middleware/roommateTenantOnly');
after(() => { if (originalDatabase) require.cache[databasePath] = originalDatabase; else delete require.cache[databasePath]; });
beforeEach(() => { calls.length = 0; responses = []; });
const vector = { schema_version: 2, gender: 'male', smoking: 'allowed_none', pets: 'allowed_none', cleanliness: 2, shared_meals: 2, sleep_start: '23:00', sleep_end: '01:00', wake_start: '06:00', wake_end: '08:00', area: { lat: 21, lng: 105.8, label: 'Hà Nội' }, radius_meters: 3000, move_in: '2026-12-01', lease_months: 6 };
const row = status => ({ user_id: 7, profile_id: 5, status, budget_min: '2000000', budget_max: '3000000', lifestyle_vector: JSON.stringify(vector) });
const req = body => ({ user: { user_id: 7 }, body });
const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('invalid status is rejected before accessing the database', async () => {
    const response = res(); await controller.updateStatus(req({ status: 'deleted' }), response);
    assert.equal(response.statusCode, 400); assert.equal(calls.length, 0);
});
test('no profile cannot be activated or implicitly created', async () => {
    responses = [[]]; const response = res(); await controller.updateStatus(req({ status: 'active' }), response);
    assert.equal(response.statusCode, 404); assert.equal(calls.length, 1);
});
test('all three states are persisted only for the authenticated user', async () => {
    for (const status of ['active', 'hidden', 'matched']) {
        calls.length = 0; responses = [[row('active')], { affectedRows: 1 }];
        const response = res(); await controller.updateStatus(req({ status, user_id: 999 }), response);
        assert.equal(response.statusCode, 200); assert.equal(response.body.status, status);
        assert.equal(calls[1].sql, 'UPDATE roommate_profiles SET status = ? WHERE user_id = ?');
        assert.deepEqual(calls[1].args, [status, 7]);
    }
});
test('incomplete legacy profiles cannot be activated', async () => {
    responses = [[{ ...row('hidden'), lifestyle_vector: '{}' }]];
    const response = res(); await controller.updateStatus(req({ status: 'active' }), response);
    assert.equal(response.statusCode, 400); assert.equal(calls.length, 1);
});
test('inactive users cannot search until they explicitly resume', async () => {
    for (const status of ['hidden', 'matched']) {
        calls.length = 0; responses = [[row(status)]];
        const response = res(); await controller.findMatches(req({}), response);
        assert.equal(response.statusCode, 409); assert.equal(calls.length, 1);
    }
});
test('saving profile data never reactivates a hidden or matched profile', async () => {
    for (const status of ['hidden', 'matched']) {
        calls.length = 0; responses = [[row(status)], { affectedRows: 1 }];
        const response = res(); await controller.updateProfile(req({ budget_min: 2000000, budget_max: 3000000, lifestyle_vector: vector, status: 'active' }), response);
        assert.equal(response.statusCode, 200); assert.equal(response.body.status, status);
        assert.ok(!/SET status/.test(calls[1].sql));
        assert.equal(calls[1].args.at(-1), 7);
    }
});
test('new valid profiles start active', async () => {
    responses = [[], { affectedRows: 1 }]; const response = res();
    await controller.updateProfile(req({ budget_min: 2000000, budget_max: 3000000, lifestyle_vector: vector }), response);
    assert.equal(response.statusCode, 200); assert.equal(response.body.status, 'active');
    assert.ok(calls[1].sql.startsWith('INSERT'));
});
test('candidate lookup excludes inactive profiles', async () => {
    responses = [[row('active')], []]; const response = res();
    await controller.findMatches(req({}), response);
    assert.equal(response.statusCode, 200); assert.deepEqual(response.body, []);
    assert.ok(calls[1].sql.includes("p.status = 'active'"));
    assert.ok(calls[1].sql.includes("u.role = 'tenant'"));
});

test('matched candidates include contact details from their account only', async () => {
    responses = [[row('active')], [{ ...row('active'), user_id: 8, full_name: 'Demo Contact', phone_number: ' 0901234567 ', email: ' demo@example.com ', password_hash: 'must-not-return' }]];
    const response = res(); await controller.findMatches(req({}), response);
    assert.equal(response.statusCode, 200); assert.equal(response.body.length, 1);
    assert.equal(response.body[0].phone_number, '0901234567');
    assert.equal(response.body[0].email, 'demo@example.com');
    assert.equal(response.body[0].match_score, 100);
    assert.ok(!Object.hasOwn(response.body[0], 'password_hash'));
    assert.ok(!Object.hasOwn(response.body[0], 'lifestyle_vector'));
    assert.ok(calls[1].sql.includes('u.phone_number, u.email'));
});
test('missing or blank contact details return null', async () => {
    responses = [[row('active')], [{ ...row('active'), user_id: 8, phone_number: '  ', email: null }]];
    const response = res(); await controller.findMatches(req({}), response);
    assert.equal(response.body[0].phone_number, null); assert.equal(response.body[0].email, null);
});
test('incompatible candidates do not expose contact details', async () => {
    responses = [[row('active')], [{ ...row('active'), user_id: 8, phone_number: '0901234567', email: 'demo@example.com', lifestyle_vector: JSON.stringify({ ...vector, gender: 'female' }) }]];
    const response = res(); await controller.findMatches(req({}), response);
    assert.deepEqual(response.body, []);
});

test('results are sorted by descending score with stable user-id tie ordering', async () => {
    const candidate = (id, overrides = {}) => ({ ...row('active'), user_id: id, ...overrides });
    responses = [[row('active')], [
        candidate(11, { budget_max: '4000000', lifestyle_vector: JSON.stringify({ ...vector, shared_meals: 3 }) }),
        candidate(9),
        candidate(10, { budget_max: '4000000' }),
        candidate(8),
    ]];
    const response = res();
    await controller.findMatches(req({}), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.map(item => item.user_id), [8, 9, 10, 11]);
    assert.deepEqual(response.body.map(item => item.match_score), [100, 100, 87.5, 83.75]);
});
test('roommate access permits only the current tenant database role', async () => {
    for (const role of ['tenant', 'guest', 'landlord', 'admin']) {
        calls.length = 0;
        responses = [[{ role }]];
        const response = res(); let passed = false;
        // The token claims tenant: the database role must still be checked.
        await tenantOnly({ user: { user_id: 7, role: 'tenant' } }, response, () => { passed = true; });
        assert.equal(passed, role === 'tenant');
        assert.equal(response.statusCode, role === 'tenant' ? 200 : 403);
        assert.deepEqual(calls[0].args, [7]);
    }
});
test('roommate access denies missing sessions and deleted accounts', async () => {
    const anonymous = res(); let passed = false;
    await tenantOnly({}, anonymous, () => { passed = true; });
    assert.equal(anonymous.statusCode, 401); assert.equal(calls.length, 0);
    responses = [[]]; const deleted = res();
    await tenantOnly(req({}), deleted, () => { passed = true; });
    assert.equal(deleted.statusCode, 403); assert.equal(passed, false);
});

test('API excludes candidates without shared location or budget and their contacts', async () => {
    responses = [[row('active')], [
        { ...row('active'), user_id: 8, email: 'location@example.com', lifestyle_vector: JSON.stringify({ ...vector, area: { lat: 22, lng: 105.8, label: 'Xa' } }) },
        { ...row('active'), user_id: 9, email: 'budget@example.com', budget_min: '4000000', budget_max: '5000000' },
        { ...row('active'), user_id: 10, budget_min: '2500000', budget_max: '3500000' },
    ]];
    const response = res(); await controller.findMatches(req({}), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.map(item => item.user_id), [10]);
});

test('API includes a candidate sharing only the budget endpoint but rejects a real gap', async () => {
    responses = [[row('active')], [
        { ...row('active'), user_id: 8, budget_min: '3000000', budget_max: '4000000' },
        { ...row('active'), user_id: 9, budget_min: '3001000', budget_max: '4000000' },
    ]];
    const response = res(); await controller.findMatches(req({}), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.map(item => item.user_id), [8]);
    assert.equal(response.body[0].match_details.budget, 0);
    assert.equal(response.body[0].match_score, 75);
});
