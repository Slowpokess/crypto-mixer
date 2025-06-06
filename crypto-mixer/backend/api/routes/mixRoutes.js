const express = require('express');
const router = express.Router();
const mixController = require('../controllers/mixController');

router.post('/create', mixController.createMixRequest);
router.get('/status/:sessionId', mixController.getStatus);
router.post('/deposit-address', mixController.generateDepositAddress);
router.get('/fees', mixController.getFees);

module.exports = router;