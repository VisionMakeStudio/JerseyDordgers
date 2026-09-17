import {getStore,getDeployStore} from '@netlify/blobs';
import {publicContent} from '../../src/schema.mjs';
import {sitemapXml} from '../../src/seo.mjs';
import seed from '../../seed.json';

export default async(_request,context)=>{
 try{
  const store=context.deploy.context==='production'?getStore({name:'dodgers-content',consistency:'strong'}):getDeployStore('dodgers-content');
  const record=await store.get('published',{type:'json'});
  const xml=sitemapXml(publicContent(record?.data||seed));
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
 }catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain'}})}
};

export const config={path:'/sitemap.xml'};
