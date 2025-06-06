import { Router } from 'express';
import { MixerController } from '../controllers/mixer.controller';

export class MixerRouter {
  public router: Router;
  private mixerController: MixerController;

  constructor() {
    this.router = Router();
    this.mixerController = new MixerController();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Mix request endpoints
    this.router.post('/create', this.mixerController.createMixRequest);
    this.router.get('/status/:sessionId', this.mixerController.getStatus);
    this.router.get('/fees', this.mixerController.getFees);
  }
}