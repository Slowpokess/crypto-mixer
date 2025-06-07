import express, { Router } from 'express';
import mixController from '../controllers/mixController';
import { 
  validateCreateMixRequest, 
  validateSessionId, 
  validateDepositAddress,
  sanitizeInput 
} from '../middleware/validation';
import { 
  generalRateLimit, 
  mixingRateLimit, 
  addressRateLimit,
  botDetection,
  requestSizeLimit,
  securityHeaders
} from '../middleware/rateLimiting';

const router: Router = express.Router();

// Apply global security middleware to all routes
router.use(securityHeaders);
router.use(botDetection);
router.use(requestSizeLimit);
router.use(generalRateLimit);
router.use(sanitizeInput);

// POST /api/v1/mix/create - Create new mix request
router.post('/create', 
  mixingRateLimit,
  validateCreateMixRequest,
  mixController.createMixRequest
);

// GET /api/v1/mix/status/:sessionId - Get mix request status  
router.get('/status/:sessionId', 
  validateSessionId,
  mixController.getStatus
);

// POST /api/v1/mix/deposit-address - Generate deposit address
router.post('/deposit-address', 
  addressRateLimit,
  validateDepositAddress,
  mixController.generateDepositAddress
);

// GET /api/v1/mix/fees - Get fee structure
router.get('/fees', mixController.getFees);

export default router;