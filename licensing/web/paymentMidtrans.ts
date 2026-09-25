import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PLANS } from './plans';
import { createSubscription } from './subscriptionStore';
import { createPaymentOrder, getPaymentOrder, markPayment } from './paymentStore';
import type { SubscriptionPlan } from '../core/types';
import type { SessionRequest } from './session';

function serverKey(): string { const v=String(process.env.MIDTRANS_SERVER_KEY||''); if(!v) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi.'); return v; }
function snapBase(): string { return process.env.MIDTRANS_IS_PRODUCTION === '1' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'; }
function apiBase(): string { return process.env.MIDTRANS_IS_PRODUCTION === '1' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'; }
function authHeader(): string { return `Basic ${Buffer.from(`${serverKey()}:`).toString('base64')}`; }
function expectedSignature(body:any): string { return createHash('sha512').update(`${body.order_id||''}${body.status_code||''}${body.gross_amount||''}${serverKey()}`).digest('hex'); }
function safeEqualHex(a:string,b:string):boolean { try { const x=Buffer.from(String(a),'hex'), y=Buffer.from(String(b),'hex'); return x.length===y.length && timingSafeEqual(x,y); } catch { return false; } }

async function getMidtransStatus(orderId:string): Promise<any> {
  const r=await fetch(`${apiBase()}/v2/${encodeURIComponent(orderId)}/status`,{headers:{Authorization:authHeader(),Accept:'application/json'}});
  if(!r.ok) throw new Error(`MIDTRANS_STATUS_${r.status}`); return r.json();
}

export function webPaymentRoutes(){
  const router=Router();
  router.post('/checkout', async (req:SessionRequest,res:Response)=>{
    try{
      if(!req.customerId)return res.status(401).json({error:'NOT_AUTHENTICATED'});
      const plan=String(req.body?.plan||'') as SubscriptionPlan; const pricing=PLANS[plan];
      if(!pricing)return res.status(400).json({error:'INVALID_PLAN'});
      if(process.env.NODE_ENV==='production' && process.env.LEXICORE_PRICING_CONFIRMED!=='1') return res.status(503).json({error:'PRICING_NOT_CONFIRMED'});
      const orderId=`LXC-${Date.now()}-${randomBytes(4).toString('hex')}`;
      createPaymentOrder({orderId,customerId:req.customerId,plan,grossAmount:pricing.priceIDR,status:'pending',createdAt:new Date().toISOString()});
      const payload={transaction_details:{order_id:orderId,gross_amount:pricing.priceIDR},item_details:[{id:`LEXICORE-${plan}`,price:pricing.priceIDR,quantity:1,name:`LexiCore ${pricing.label}`}],customer_details:{first_name:req.customerId}};
      const r=await fetch(`${snapBase()}/snap/v1/transactions`,{method:'POST',headers:{Authorization:authHeader(),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
      const data=await r.json().catch(()=>({})); if(!r.ok)return res.status(502).json({error:'MIDTRANS_CHECKOUT_FAILED',detail:data});
      res.json({ok:true,orderId,token:data.token,redirectUrl:data.redirect_url});
    }catch(e:any){res.status(500).json({error:'PAYMENT_CONFIGURATION_ERROR',message:String(e?.message||e)});}
  });

  router.post('/payment-webhook', async (req:Request,res:Response)=>{
    try{
      const body=req.body||{}; const expected=expectedSignature(body);
      if(!safeEqualHex(String(body.signature_key||''),expected)) return res.status(403).json({error:'INVALID_SIGNATURE'});
      const order=getPaymentOrder(String(body.order_id||'')); if(!order)return res.status(404).json({error:'UNKNOWN_ORDER'});
      if(order.status==='paid')return res.json({ok:true,idempotent:true});
      const verified=await getMidtransStatus(order.orderId);
      const tx=String(verified.transaction_status||''); const statusCode=String(verified.status_code||''); const fraud=String(verified.fraud_status||'accept').toLowerCase();
      const amount=Math.round(Number(verified.gross_amount||0));
      if(statusCode!=='200' || amount!==order.grossAmount) return res.status(400).json({error:'PAYMENT_MISMATCH'});
      const success=tx==='settlement' || (tx==='capture' && fraud==='accept');
      if(!success){ if(['deny','cancel','expire','failure'].includes(tx))markPayment(order.orderId,'failed'); return res.json({ok:true,status:tx}); }
      // Re-read after the network round-trip: duplicate webhooks may have completed meanwhile.
      const latest=getPaymentOrder(order.orderId); if(latest?.status==='paid')return res.json({ok:true,idempotent:true});
      markPayment(order.orderId,'paid'); const subscription=createSubscription(order.customerId,order.plan,'payment-webhook');
      return res.json({ok:true,subscription});
    }catch(e:any){return res.status(500).json({error:'WEBHOOK_PROCESSING_FAILED',message:String(e?.message||e)});}
  });
  return router;
}
