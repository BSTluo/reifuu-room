import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import CharacterService from '../services/CharacterService.js';
import VehicleService from '../services/VehicleService.js';

const router = Router();
router.use(authenticate);
async function character(req: Request) {
  const userId = req.user?.userId;
  if (!userId) throw new AppError('User not authenticated', 401);
  const result = await CharacterService.getCharacterByUserId(userId);
  if (!result) throw new AppError('Character not found', 404);
  return String(result.id);
}
router.get('/templates', (_req, res) => res.json({ status: 'success', data: { templates: VehicleService.getTemplates() } }));
router.get('/', async (req, res, next) => { try { const id = await character(req); res.json({ status: 'success', data: { vehicles: await VehicleService.list(id), equipped: await VehicleService.getEquipped(id) } }); } catch (e) { next(e); } });
router.post('/craft', async (req, res, next) => { try { const vehicle = await VehicleService.craft(await character(req), String(req.body?.vehicleType ?? '')); res.status(201).json({ status: 'success', data: { vehicle } }); } catch (e) { next(e); } });
router.post('/:vehicleId/equip', async (req, res, next) => { try { const vehicleId = Number(req.params.vehicleId); if (!Number.isInteger(vehicleId)) throw new AppError('Invalid vehicle id', 400); res.json({ status: 'success', data: { vehicle: await VehicleService.equip(await character(req), vehicleId) } }); } catch (e) { next(e); } });
router.post('/unequip', async (req, res, next) => { try { const id = await character(req); await VehicleService.unequip(id); res.json({ status: 'success', data: { vehicle: null } }); } catch (e) { next(e); } });
export default router;
