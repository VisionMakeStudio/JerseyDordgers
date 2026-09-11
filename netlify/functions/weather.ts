const conditions=(code:number)=>{
 if(code===0)return {label:'Clear',icon:'sun'};
 if(code<=2)return {label:'Partly cloudy',icon:'partly-cloudy'};
 if(code===3)return {label:'Cloudy',icon:'cloud'};
 if(code===45||code===48)return {label:'Foggy',icon:'fog'};
 if(code>=51&&code<=67)return {label:'Rain',icon:'rain'};
 if(code>=71&&code<=77)return {label:'Snow',icon:'snow'};
 if(code>=80&&code<=82)return {label:'Showers',icon:'rain'};
 if(code>=85&&code<=86)return {label:'Snow showers',icon:'snow'};
 if(code>=95)return {label:'Thunderstorms',icon:'storm'};
 return {label:'Forecast',icon:'cloud'};
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=900, s-maxage=1800, stale-while-revalidate=3600'}});
export default async(req:Request)=>{
 try{
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const q=new URL(req.url).searchParams,name=(q.get('name')||'').trim(),address=(q.get('address')||'').trim(),date=q.get('date')||'',time=q.get('time')||'';
  if(!name||!address||name.length>200||address.length>300||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return json({error:'Invalid forecast request'},400);
  const today=new Date();today.setHours(0,0,0,0);const gameDay=new Date(date+'T00:00:00');const days=Math.round((gameDay.getTime()-today.getTime())/86400000);
  if(days<0||days>16)return json({available:false,message:'Forecast available within 16 days of game day.'});
  const parts=address.split(',').map(v=>v.trim()).filter(Boolean),cityState=parts.slice(-2).join(', ');
  let place:any;
  for(const term of [`${name}, ${cityState}`,cityState,name]){
   if(!term)continue;
   const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=en&format=json`,{headers:{'User-Agent':'JerseyDodgers.com weather/1.0'}});
   if(!geo.ok)continue;
   const body:any=await geo.json();place=body.results?.[0];if(place)break;
  }
  if(!place)return json({available:false,message:'Forecast location unavailable.'});
  const params=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),hourly:'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timezone:'America/New_York',start_date:date,end_date:date});
  const forecast=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);if(!forecast.ok)throw Error('Forecast unavailable');
  const body:any=await forecast.json(),hour=time.slice(0,2),index=body.hourly?.time?.findIndex((v:string)=>v.startsWith(`${date}T${hour}:`));
  if(index<0)return json({available:false,message:'Forecast available closer to game day.'});
  const code=Number(body.hourly.weather_code[index]),condition=conditions(code);
  return json({available:true,...condition,temperature:Math.round(Number(body.hourly.temperature_2m[index])),precipitation:Math.round(Number(body.hourly.precipitation_probability[index]||0)),wind:Math.round(Number(body.hourly.wind_speed_10m[index]||0)),location:place.name,updatedAt:new Date().toISOString()});
 }catch{return json({available:false,message:'Forecast temporarily unavailable.'},502)}
};
export const config={path:'/api/weather'};
