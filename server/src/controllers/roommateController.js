const db = require('../config/database');
const { validateProfile, scoreProfiles } = require('../utils/roommateMatching');

function decodeProfile(row) {
    const lifestyle = typeof row.lifestyle_vector === 'string' ? JSON.parse(row.lifestyle_vector) : row.lifestyle_vector;
    return { ...row, budget_min: Number(row.budget_min), budget_max: Number(row.budget_max), lifestyle_vector: lifestyle };
}

module.exports = {
    getMyProfile: async (req, res) => {
        try {
            const [rows] = await db.execute('SELECT * FROM roommate_profiles WHERE user_id = ?', [req.user.user_id]);
            res.json({ profile: rows[0] || null });
        } catch (error) {
            console.error('Roommate profile load failed:', error.message);
            res.status(500).json({ message: 'Không tải được hồ sơ tìm bạn.' });
        }
    },
    updateStatus: async (req, res) => {
        const status = req.body?.status;
        if (!['active', 'hidden', 'matched'].includes(status)) {
            return res.status(400).json({ message: 'Trạng thái tìm bạn không hợp lệ.' });
        }
        try {
            const [rows] = await db.execute('SELECT * FROM roommate_profiles WHERE user_id = ?', [req.user.user_id]);
            if (!rows.length) return res.status(404).json({ message: 'Bạn chưa có hồ sơ tìm bạn. Vui lòng hoàn thiện thông tin trước.' });
            if (status === 'active') {
                const validation = validateProfile(decodeProfile(rows[0]));
                if (validation) return res.status(400).json({ message: validation });
            }
            await db.execute('UPDATE roommate_profiles SET status = ? WHERE user_id = ?', [status, req.user.user_id]);
            res.json({ status, message: 'Đã cập nhật trạng thái tìm bạn.' });
        } catch (error) {
            console.error('Roommate status update failed:', error.message);
            res.status(500).json({ message: 'Không cập nhật được trạng thái tìm bạn.' });
        }
    },
    updateProfile: async (req, res) => {
        const { budget_min, budget_max, lifestyle_vector } = req.body;
        const validation = validateProfile({ budget_min, budget_max, lifestyle_vector });
        if (validation) return res.status(400).json({ message: validation });
        // Whitelist persisted fields; old vector profiles must complete the new form.
        const v = lifestyle_vector;
        const cleanVector = Object.fromEntries(['schema_version', 'gender', 'smoking', 'pets', 'cleanliness', 'shared_meals', 'sleep_start', 'sleep_end', 'wake_start', 'wake_end', 'radius_meters', 'move_in', 'lease_months'].map(key => [key, v[key]]));
        cleanVector.area = { lat: v.area.lat, lng: v.area.lng, label: v.area.label };
        try {
            const [rows] = await db.execute('SELECT profile_id, status FROM roommate_profiles WHERE user_id = ?', [req.user.user_id]);
            if (rows.length) await db.execute('UPDATE roommate_profiles SET budget_min = ?, budget_max = ?, lifestyle_vector = ? WHERE user_id = ?', [budget_min, budget_max, JSON.stringify(cleanVector), req.user.user_id]);
            else await db.execute('INSERT INTO roommate_profiles (user_id, budget_min, budget_max, lifestyle_vector) VALUES (?, ?, ?, ?)', [req.user.user_id, budget_min, budget_max, JSON.stringify(cleanVector)]);
            res.json({ message: 'Đã lưu hồ sơ tìm bạn.', status: rows.length ? rows[0].status : 'active' });
        } catch (error) {
            console.error('Roommate profile save failed:', error.message);
            res.status(500).json({ message: 'Không lưu được hồ sơ tìm bạn.' });
        }
    },
    findMatches: async (req, res) => {
        try {
            const [own] = await db.execute('SELECT * FROM roommate_profiles WHERE user_id = ?', [req.user.user_id]);
            if (!own.length) return res.status(400).json({ message: 'Vui lòng tạo hồ sơ tìm bạn trước.' });
            if (own[0].status !== 'active') return res.status(409).json({ message: 'Hồ sơ đang tạm ẩn hoặc đã tìm được bạn. Vui lòng bật tìm bạn trở lại trước khi tìm kiếm.' });
            const mine = decodeProfile(own[0]);
            const validation = validateProfile(mine);
            if (validation) return res.status(400).json({ message: validation });
            const [others] = await db.execute(
                `SELECT p.user_id, p.budget_min, p.budget_max, p.lifestyle_vector, u.full_name, u.phone_number, u.email
                 FROM roommate_profiles p JOIN users u ON p.user_id = u.user_id
                 WHERE p.user_id != ? AND p.status = 'active' AND u.role = 'tenant'`,
                [req.user.user_id]
            );
            const matches = [];
            for (const row of others) {
                let candidate;
                try { candidate = decodeProfile(row); } catch { continue; }
                const result = scoreProfiles(mine, candidate);
                if (!result) continue;
                matches.push({
                    user_id: candidate.user_id, full_name: candidate.full_name,
                    phone_number: typeof candidate.phone_number === 'string' ? candidate.phone_number.trim() || null : null,
                    email: typeof candidate.email === 'string' ? candidate.email.trim() || null : null,
                    budget_min: candidate.budget_min, budget_max: candidate.budget_max,
                    match_score: result.score, match_details: result.details,
                    match_reasoning: 'Điểm tương đồng theo hồ sơ; không phải xác suất sống chung thành công.',
                });
            }
            matches.sort((a, b) => b.match_score - a.match_score || a.user_id - b.user_id);
            res.json(matches);
        } catch (error) {
            console.error('Roommate matching failed:', error.message);
            res.status(500).json({ message: 'Không thể tìm bạn lúc này. Vui lòng thử lại.' });
        }
    },
};
