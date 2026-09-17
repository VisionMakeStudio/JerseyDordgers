import type {Config,Context} from '@netlify/edge-functions';
import {injectSeo,pageInfo} from '../../src/seo.mjs';

export default async function seo(request:Request,context:Context){
 if(request.method!=='GET')return;
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/')||path.startsWith('/admin')||path.startsWith('/.netlify/')||path==='/sitemap.xml'||path==='/robots.txt'||/\.[a-z0-9]{1,8}$/i.test(path))return;
 const response=await context.next();
 if(!response.headers.get('content-type')?.includes('text/html'))return response;
 let source='';
 try{
  const contentResponse=await fetch(new URL('/api/content',request.url),{headers:{accept:'application/json'}});
  if(!contentResponse.ok)return response;
  const data=await contentResponse.json();
  const page=pageInfo(request.url,data);
  source=await response.text();
  const html=injectSeo(source,page,data);
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');
  return new Response(html,{status:page.found?response.status:404,headers});
 }catch{
  if(!source)return response;
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');
  return new Response(source,{status:response.status,headers});
 }
}

export const config:Config={path:'/*',method:['GET'],onError:'bypass'};
