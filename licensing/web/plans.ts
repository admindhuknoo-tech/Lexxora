import type { SubscriptionPricingIDR } from '../core/types';
function price(name:string, fallback:number):number { const n=Number(process.env[name] || fallback); return Number.isFinite(n)&&n>=0?Math.round(n):fallback; }
export const PLANS: Record<'DAY'|'WEEK'|'MONTH', SubscriptionPricingIDR> = {
  DAY:{plan:'DAY',label:'Harian',durationMs:24*60*60*1000,priceIDR:price('WEB_LICENSE_DAY_PRICE_RP',15000)},
  WEEK:{plan:'WEEK',label:'Mingguan',durationMs:7*24*60*60*1000,priceIDR:price('WEB_LICENSE_WEEK_PRICE_RP',75000)},
  MONTH:{plan:'MONTH',label:'Bulanan',durationMs:30*24*60*60*1000,priceIDR:price('WEB_LICENSE_MONTH_PRICE_RP',250000)},
};
export const DEMO_DURATION_MS = Math.max(1,Number(process.env.WEB_DEMO_DAYS||3))*24*60*60*1000;
export function formatIDR(amount:number):string{return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(amount);}
