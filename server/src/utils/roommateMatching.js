const RULES = ['allowed_has', 'allowed_none', 'not_allowed'];
const GENDERS = ['male', 'female', 'other'];
const clamp = value => Math.max(0, Math.min(1, value));
const timeMinutes = value => {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
};
const dateNumber = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : NaN;
};
const finiteRange = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
function validateProfile(profile) {
    const v = profile?.lifestyle_vector;
    if (!v || v.schema_version !== 2) return 'Vui lòng hoàn thiện hồ sơ tìm bạn theo mẫu mới.';
    if (!GENDERS.includes(v.gender)) return 'Vui lòng chọn giới tính.';
    if (!RULES.includes(v.smoking) || !RULES.includes(v.pets)) return 'Vui lòng chọn điều kiện hút thuốc và thú cưng.';
    if (!Number.isInteger(v.cleanliness) || !finiteRange(v.cleanliness, 1, 4) || !Number.isInteger(v.shared_meals) || !finiteRange(v.shared_meals, 1, 3)) return 'Lựa chọn thói quen không hợp lệ.';
    if (!finiteRange(profile.budget_min, 1, 9999999999) || !finiteRange(profile.budget_max, 1, 9999999999) || profile.budget_max <= profile.budget_min) return 'Ngân sách tối đa phải lớn hơn ngân sách tối thiểu.';
    if (profile.budget_min % 1000 !== 0 || profile.budget_max % 1000 !== 0) return 'Ngân sách phải là bội số của 1.000 đồng.';
    for (const prefix of ['sleep', 'wake']) {
        const start = timeMinutes(v[`${prefix}_start`]);
        const end = timeMinutes(v[`${prefix}_end`]);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return 'Khoảng giờ ngủ hoặc giờ dậy không hợp lệ.';
    }
    if (!v.area || !finiteRange(v.area.lat, -90, 90) || !finiteRange(v.area.lng, -180, 180) || !finiteRange(v.radius_meters, 500, 10000)) return 'Vui lòng chọn vị trí và bán kính từ 0,5 đến 10 km.';
    if (typeof v.area.label !== 'string' || v.area.label.length > 1000) return 'Tên địa điểm không hợp lệ.';
    if (!Number.isFinite(dateNumber(v.move_in)) || !Number.isInteger(v.lease_months) || !finiteRange(v.lease_months, 1, 120)) return 'Thời gian thuê không hợp lệ.';
    return null;
}
function compatible(a, b) {
    return RULES.includes(a) && RULES.includes(b) && !((a === 'allowed_has' && b === 'not_allowed') || (b === 'allowed_has' && a === 'not_allowed'));
}
function intervalScore(a, b) {
    const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
    const union = a[1] - a[0] + b[1] - b[0] - overlap;
    return union > 0 ? 100 * clamp(overlap / union) : 0;
}
function clockScore(startA, endA, startB, endB) {
    const segments = (start, end) => start < end ? [[start, end]] : [[start, 1440], [0, end]];
    const a = segments(timeMinutes(startA), timeMinutes(endA));
    const b = segments(timeMinutes(startB), timeMinutes(endB));
    let intersection = 0;
    for (const x of a) for (const y of b) intersection += Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0]));
    const duration = parts => parts.reduce((sum, [start, end]) => sum + end - start, 0);
    const union = duration(a) + duration(b) - intersection;
    return union > 0 ? 100 * clamp(intersection / union) : 0;
}
function distanceMeters(a, b) {
    const rad = n => n * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(clamp(h)));
}
function circleScore(a, b) {
    const r = a.radius_meters, s = b.radius_meters;
    const d = distanceMeters(a.area, b.area);
    if (d >= r + s) return 0;
    let intersection;
    if (d <= Math.abs(r - s)) intersection = Math.PI * Math.min(r, s) ** 2;
    else {
        const safeAcos = n => Math.acos(Math.max(-1, Math.min(1, n)));
        intersection = r * r * safeAcos((d * d + r * r - s * s) / (2 * d * r))
            + s * s * safeAcos((d * d + s * s - r * r) / (2 * d * s))
            - 0.5 * Math.sqrt(Math.max(0, (-d + r + s) * (d + r - s) * (d - r + s) * (d + r + s)));
    }
    return 100 * clamp(intersection / (Math.PI * r * r + Math.PI * s * s - intersection));
}
function scoreProfiles(a, b) {
    if (validateProfile(a) || validateProfile(b)) return null;
    const x = a.lifestyle_vector, y = b.lifestyle_vector;
    if (x.gender !== y.gender || !compatible(x.smoking, y.smoking) || !compatible(x.pets, y.pets)) return null;
    // A shared budget endpoint is sufficient; IoU scoring stays unchanged.
    if (Math.max(a.budget_min, b.budget_min) > Math.min(a.budget_max, b.budget_max)) return null;
    const budget = intervalScore([a.budget_min, a.budget_max], [b.budget_min, b.budget_max]);
    const location = circleScore(x, y);
    if (location <= 0) return null;
    const details = {
        location,
        budget,
        schedule: (clockScore(x.sleep_start, x.sleep_end, y.sleep_start, y.sleep_end) + clockScore(x.wake_start, x.wake_end, y.wake_start, y.wake_end)) / 2,
        habits: (100 * (1 - Math.abs(x.cleanliness - y.cleanliness) / 3) + 100 * (1 - Math.abs(x.shared_meals - y.shared_meals) / 2)) / 2,
        duration: (100 * Math.max(0, 1 - Math.abs(dateNumber(x.move_in) - dateNumber(y.move_in)) / 30) + 100 * Math.min(x.lease_months, y.lease_months) / Math.max(x.lease_months, y.lease_months)) / 2,
    };
    const weights = { location: 0.30, budget: 0.25, schedule: 0.20, habits: 0.15, duration: 0.10 };
    const total = Object.entries(weights).reduce((sum, [key, weight]) => sum + details[key] * weight, 0);
    const round = n => Math.round(n * 100) / 100;
    return { score: round(total), details: Object.fromEntries(Object.entries(details).map(([k, n]) => [k, round(n)])) };
}
module.exports = { compatible, intervalScore, clockScore, circleScore, scoreProfiles, validateProfile };
