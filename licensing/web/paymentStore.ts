import fs from 'fs';
import path from 'path';
import type { SubscriptionPlan } from '../core/types';
export interface PaymentOrder { orderId:string; customerId:string; plan:SubscriptionPlan; grossAmount:number; status:'pending'|'paid'|'failed'; createdAt:string; paidAt?:string; }
function dir(){ return process.env.LEXICORE_WEB_DATA_DIR || path.join(process.cwd(),'data'); }
function file(){ return path.join(dir(),'payment-orders.json'); }
function load(): PaymentOrder[]{ try{ if(!fs.existsSync(file()))return []; const v=JSON.parse(fs.readFileSync(file(),'utf8')); return Array.isArray(v)?v:[];}catch{return [];} }
function save(v:PaymentOrder[]){ fs.mkdirSync(dir(),{recursive:true}); const t=`${file()}.${process.pid}.tmp`; fs.writeFileSync(t,JSON.stringify(v,null,2),'utf8'); fs.renameSync(t,file()); }
export function createPaymentOrder(order:PaymentOrder){ const all=load(); all.push(order); save(all); }
export function getPaymentOrder(orderId:string){ return load().find(x=>x.orderId===orderId)||null; }
export function markPayment(orderId:string,status:'paid'|'failed'){ const all=load(); const i=all.findIndex(x=>x.orderId===orderId); if(i<0)return null; all[i].status=status; if(status==='paid')all[i].paidAt=new Date().toISOString(); save(all); return all[i]; }
