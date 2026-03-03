import { Plan } from '../enums';

export interface PlanLimit {
  scansPerMonth: number;
  sitesLimit: number;
  contentsPerMonth: number;
  monitorsLimit: number;
  platformsLimit: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimit> = {
  [Plan.FREE]: {
    scansPerMonth: 3,
    sitesLimit: 1,
    contentsPerMonth: 2,
    monitorsLimit: 3,
    platformsLimit: 0,
  },
  [Plan.STARTER]: {
    scansPerMonth: 30,
    sitesLimit: 5,
    contentsPerMonth: 20,
    monitorsLimit: 10,
    platformsLimit: 1,
  },
  [Plan.PRO]: {
    scansPerMonth: 100,
    sitesLimit: 20,
    contentsPerMonth: 100,
    monitorsLimit: 50,
    platformsLimit: 5,
  },
  [Plan.ENTERPRISE]: {
    scansPerMonth: -1,
    sitesLimit: -1,
    contentsPerMonth: -1,
    monitorsLimit: -1,
    platformsLimit: -1,
  },
};
