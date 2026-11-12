const express = require('express');
const router = express.Router();
const roommateController = require('../controllers/roommateController');
const { protect } = require('../middleware/authMiddleware');
const roommateTenantOnly = require('../middleware/roommateTenantOnly');

router.use(protect, roommateTenantOnly);

router.get('/profile', roommateController.getMyProfile);
router.post('/profile', roommateController.updateProfile);
router.patch('/profile/status', roommateController.updateStatus);
router.get('/matches', roommateController.findMatches);

module.exports = router;
