"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mixController_1 = __importDefault(require("../controllers/mixController"));
const validation_1 = require("../middleware/validation");
const rateLimiting_1 = require("../middleware/rateLimiting");
const router = express_1.default.Router();
// Apply global security middleware to all routes
router.use(rateLimiting_1.securityHeaders);
router.use(rateLimiting_1.botDetection);
router.use(rateLimiting_1.requestSizeLimit);
router.use(rateLimiting_1.generalRateLimit);
router.use(validation_1.sanitizeInput);
// POST /api/v1/mix/create - Create new mix request
router.post('/create', rateLimiting_1.mixingRateLimit, validation_1.validateCreateMixRequest, mixController_1.default.createMixRequest);
// GET /api/v1/mix/status/:sessionId - Get mix request status  
router.get('/status/:sessionId', validation_1.validateSessionId, mixController_1.default.getStatus);
// POST /api/v1/mix/deposit-address - Generate deposit address
router.post('/deposit-address', rateLimiting_1.addressRateLimit, validation_1.validateDepositAddress, mixController_1.default.generateDepositAddress);
// GET /api/v1/mix/fees - Get fee structure
router.get('/fees', mixController_1.default.getFees);
exports.default = router;
//# sourceMappingURL=mixRoutes.js.map