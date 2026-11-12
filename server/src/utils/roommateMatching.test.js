const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compatible, intervalScore, clockScore, circleScore, scoreProfiles, validateProfile } = require('./roommateMatching');
const profile = () => ({ budget_min: 2000000, budget_max: 3000000, lifestyle_vector: { schema_version: 2, gender: 'male', smoking: 'allowed_none', pets: 'allowed_none', cleanliness: 2, shared_meals: 2, sleep_start: '23:00', sleep_end: '01:00', wake_start: '06:00', wake_end: '08:00', area: { lat: 21, lng: 105.8, label: 'Hà Nội' }, radius_meters: 3000, move_in: '2026-12-01', lease_months: 6 } });
test('all nine smoking/pet combinations are symmetric and only has/forbidden fails', () => {
    const values = ['allowed_has', 'allowed_none', 'not_allowed'];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        assert.equal(compatible(values[a], values[b]), !((a === 0 && b === 2) || (a === 2 && b === 0)));
        assert.equal(compatible(values[a], values[b]), compatible(values[b], values[a]));
    }
});
test('identical profiles score exactly 100', () => assert.equal(scoreProfiles(profile(), profile()).score, 100));
test('each mandatory rule independently excludes otherwise identical profiles', () => {
    for (const field of ['smoking', 'pets']) {
        const a = profile(), b = profile(); a.lifestyle_vector[field] = 'allowed_has'; b.lifestyle_vector[field] = 'not_allowed';
        assert.equal(scoreProfiles(a, b), null);
    }
    const b = profile(); b.lifestyle_vector.gender = 'female'; assert.equal(scoreProfiles(profile(), b), null);
});
test('clock IoU handles midnight and partial intersection', () => {
    assert.ok(Math.abs(clockScore('23:00', '01:00', '00:00', '02:00') - 100 / 3) < 1e-8);
    assert.equal(clockScore('23:00', '01:00', '23:00', '01:00'), 100);
    assert.equal(clockScore('23:00', '01:00', '02:00', '04:00'), 0);
    assert.ok(Math.abs(clockScore('23:00', '02:00', '22:00', '01:00') - 50) < 1e-8);
});
test('budget uses interval IoU', () => {
    assert.ok(Math.abs(intervalScore([2, 3], [2.5, 3.5]) - 100 / 3) < 1e-8);
    assert.equal(intervalScore([2, 3], [3, 4]), 0);
    assert.equal(intervalScore([2, 3], [2, 4]), 50);
});
test('circle IoU handles nested, disjoint and partial circles', () => {
    const a = profile().lifestyle_vector;
    assert.equal(circleScore(a, a), 100);
    assert.ok(Math.abs(circleScore(a, { ...a, radius_meters: 2000 }) - 100 * 4 / 9) < 1e-8);
    assert.equal(circleScore(a, { ...a, area: { ...a.area, lat: 22 } }), 0);
    const b = { ...a, area: { ...a.area, lat: 21.02 } };
    assert.ok(circleScore(a, b) > 0 && circleScore(a, b) < 100);
    assert.equal(circleScore(a, b), circleScore(b, a));
});
test('invalid and old profiles cannot be silently matched', () => {
    const p = profile(); p.lifestyle_vector.schema_version = 1; assert.ok(validateProfile(p));
    assert.equal(scoreProfiles(profile(), p), null);
    const q = profile(); q.lifestyle_vector.move_in = '2026-02-30'; assert.ok(validateProfile(q));
    const r = profile(); r.lifestyle_vector.sleep_end = r.lifestyle_vector.sleep_start; assert.ok(validateProfile(r));
});
test('weighted total remains symmetric and in range', () => {
    const a = profile(), b = profile(); b.budget_max = 4000000; b.lifestyle_vector.cleanliness = 4; b.lifestyle_vector.lease_months = 12;
    const result = scoreProfiles(a, b);
    assert.equal(result.score, scoreProfiles(b, a).score);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.equal(result.score, 80);
});

test('budgets must be positive multiples of 1000 VND', () => {
    assert.equal(validateProfile(profile()), null);
    for (const field of ['budget_min', 'budget_max']) {
        for (const invalid of [25000001, 2500000.5, 1, 0]) {
            const p = profile();
            p.budget_min = 1000; p.budget_max = 30000000; p[field] = invalid;
            assert.ok(validateProfile(p), `${field}=${invalid} must fail`);
        }
    }
    const p = profile(); p.budget_min = 1000; p.budget_max = 25000000;
    assert.equal(validateProfile(p), null);
});

test('disjoint location excludes otherwise identical profiles in both directions', () => {
    const a = profile(), b = profile(); b.lifestyle_vector.area.lat = 22;
    assert.equal(scoreProfiles(a, b), null); assert.equal(scoreProfiles(b, a), null);
});
test('strictly disjoint budgets exclude otherwise identical profiles', () => {
    for (const min of [3001000, 4000000]) {
        const a = profile(), b = profile(); b.budget_min = min; b.budget_max = 5000000;
        assert.equal(scoreProfiles(a, b), null); assert.equal(scoreProfiles(b, a), null);
    }
});
test('positive overlap remains eligible and retains existing weights', () => {
    const a = profile(), b = profile(); b.budget_min = 2500000; b.budget_max = 3500000;
    b.lifestyle_vector.area.lat = 21.02;
    const result = scoreProfiles(a, b);
    assert.ok(result && result.details.location > 0 && result.details.budget > 0);
    assert.equal(result.score, scoreProfiles(b, a).score);
});
test('a narrow positive overlap is not excluded by score rounding', () => {
    const a = profile(), b = profile(); a.budget_min = 1000; a.budget_max = 5000000000;
    b.budget_min = 4999999000; b.budget_max = 9999999000;
    const result = scoreProfiles(a, b);
    assert.ok(result); assert.equal(result.details.budget, 0);
});
test('non-overlapping sleep or wake times are still scored rather than excluded', () => {
    const a = profile(), b = profile();
    b.lifestyle_vector.sleep_start = '03:00'; b.lifestyle_vector.sleep_end = '05:00';
    b.lifestyle_vector.wake_start = '09:00'; b.lifestyle_vector.wake_end = '11:00';
    const result = scoreProfiles(a, b);
    assert.ok(result); assert.equal(result.details.schedule, 0); assert.equal(result.score, 80);
});

test('budgets sharing a single endpoint remain eligible in both directions', () => {
    const a = profile(), b = profile(); b.budget_min = 3000000; b.budget_max = 4000000;
    const result = scoreProfiles(a, b);
    assert.ok(result);
    assert.equal(result.details.budget, 0);
    assert.equal(result.score, 75);
    assert.deepEqual(result, scoreProfiles(b, a));
});
test('shared budget endpoint does not bypass the mandatory location condition', () => {
    const a = profile(), b = profile(); b.budget_min = 3000000; b.budget_max = 4000000;
    b.lifestyle_vector.area.lat = 22;
    assert.equal(scoreProfiles(a, b), null);
});
