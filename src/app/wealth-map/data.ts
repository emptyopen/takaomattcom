import type { FeatureCollection } from 'geojson';
import type { Cell } from './spatial';
const TIGER='https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Tracts_Blocks/MapServer';
export async function readJSON<T>(url:string,signal?:AbortSignal):Promise<T> {
 const r=await fetch(url,{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Request failed (${r.status})`);
 const data=await r.json(); if(data.error)throw new Error(data.error.message); return data;
}
// Browser storage is best-effort. Private mode / quota errors never block a map.
export async function loadCell(cell:Cell,staticKeys:Set<string>,signal:AbortSignal,onSource?:(source:'disk'|'static'|'census')=>void):Promise<FeatureCollection> {
 const url=`/wealth-data/tiles-v4/${cell.key}.json`;
 let disk:Cache|undefined;
 try { disk=await caches.open('wealth-boundaries-2024-v4');const hit=await disk.match(url);if(hit){onSource?.('disk');return await hit.json();} } catch { /* memory/network remain available */ }
 let data:FeatureCollection;
 if(staticKeys.has(cell.key)){onSource?.('static');data=await readJSON(url,signal);}
 else {
  const features:FeatureCollection['features']=[];
  for(let offset=0;offset<10000;offset+=2000) {
   const p=new URLSearchParams({f:'geojson',where:'1=1',geometry:cell.box.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'GEOID,NAME,STATE',returnGeometry:'true',geometryPrecision:'5',maxAllowableOffset:cell.layer===10?'0.00004':'0.0004',resultRecordCount:'2000',resultOffset:String(offset),orderByFields:'GEOID'});
   onSource?.('census');
   const page=await readJSON<FeatureCollection & {exceededTransferLimit?:boolean;properties?:{exceededTransferLimit?:boolean}}>(`${TIGER}/${cell.layer===10?6:4}/query?${p}`,signal);
   if(!Array.isArray(page.features))throw new Error('Boundaries unavailable');
   features.push(...page.features);
   if(!page.exceededTransferLimit && !page.properties?.exceededTransferLimit)break;
   if(offset===8000)throw new Error('Boundary tile is too large');
  }
  data={type:'FeatureCollection',features};
 }
 if(disk)try {
  await disk.put(url,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
  const keys=await disk.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-128)).map(k=>disk!.delete(k)));
 }catch { /* Cache eviction is safe: original public data stays available. */ }
 return data;
}
