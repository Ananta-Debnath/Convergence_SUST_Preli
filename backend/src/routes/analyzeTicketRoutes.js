const express = require('express');
const { analyzeTicket } = require('../controllers/analyzeTicketController');

const router = express.Router();

router.post('/analyze-ticket', analyzeTicket);

module.exports = router;
