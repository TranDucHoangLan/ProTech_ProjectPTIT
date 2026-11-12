const db = require('../config/database');

// Read the current database role so an old token cannot retain roommate access.
module.exports = async function roommateTenantOnly(req, res, next) {
    if (!req.user?.user_id) return res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    try {
        const [users] = await db.execute('SELECT role FROM users WHERE user_id = ?', [req.user.user_id]);
        if (!users.length || users[0].role !== 'tenant') {
            return res.status(403).json({ message: 'Chức năng tìm bạn cùng phòng chỉ dành cho người thuê (tenant).' });
        }
        return next();
    } catch (error) {
        console.error('Roommate role check failed:', error.message);
        return res.status(500).json({ message: 'Không kiểm tra được quyền tìm bạn. Vui lòng thử lại.' });
    }
};
