import { Router, type Request, type Response, type NextFunction } from 'express';
import { getActiveSubscription, startDemoTrial, listSubscriptions } from './subscriptionStore';
import { PLANS, formatIDR } from './plans';
import type { SessionRequest } from './session';

export function requireActiveSubscription() {
  return (req: SessionRequest, res: Response, next: NextFunction) => {
    const customerId=req.customerId;
    if(!customerId)return res.status(401).json({error:'NOT_AUTHENTICATED'});
    const sub=getActiveSubscription(customerId);
    if(!sub || sub.status!=='active')return res.status(402).json({error:'SUBSCRIPTION_REQUIRED',reason:sub?.status==='revoked'?'REVOKED':sub?.status==='expired'?'EXPIRED':'NONE',plans:Object.values(PLANS).map(p=>({...p,priceLabel:formatIDR(p.priceIDR)}))});
    res.setHeader('X-LexiCore-Subscription',sub.edition); res.setHeader('X-LexiCore-Expires-At',sub.expiresAt); next();
  };
}
export function webLicenseRoutes(){
  const router=Router();
  router.get('/plans',(_req,res)=>res.json(Object.values(PLANS).map(p=>({...p,priceLabel:formatIDR(p.priceIDR)}))));
  router.get('/status',(req:SessionRequest,res)=>{if(!req.customerId)return res.status(401).json({error:'NOT_AUTHENTICATED'});res.json({subscription:getActiveSubscription(req.customerId),history:listSubscriptions(req.customerId)});});
  router.post('/start-trial',(req:SessionRequest,res)=>{if(!req.customerId)return res.status(401).json({error:'NOT_AUTHENTICATED'});const result=startDemoTrial(req.customerId);if(result.ok===false)return res.status(400).json({error:'TRIAL_UNAVAILABLE',reason:result.reason});res.json({ok:true,subscription:result.subscription});});
  return router;
}
