/** Taxonomy API: the Type → Sub-type tree (HubSpot-aligned) that drives pickers + filters. */
import { Router } from 'express';
import { getTaxonomy } from '../../engine/taxonomy.js';
import { asyncHandler } from '../middleware.js';

export const taxonomyRouter = Router();

/** Full taxonomy: [{ value, label, count, subTypes:[{value,count}] }]. */
taxonomyRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({ types: await getTaxonomy() });
}));
