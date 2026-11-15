import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { geometryBox, intersects, type Box } from './spatial';
import { readJSON } from './data';

export type PlaceContext = { city?:string; zip?:string };
const SOURCE='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer';
function inRing(point:Position,ring:Position[]) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const a=ring[i],b=ring[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function containsPoint(geometry:Geometry,point:Position):boolean {
 const polygon=(rings:Position[][])=>inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r));
 if(geometry.type==='Polygon')return polygon(geometry.coordinates);
 if(geometry.type==='MultiPolygon')return geometry.coordinates.some(polygon);
 return false;
}

// Lookup is independent of income/geometry loading. Cache returned place and
// ZIP polygons, so subsequent nearby hovers resolve locally, not per cursor pixel.
export function createPlaceLookup() {
 const regions:Array<{layer:number;feature:Feature;box:Box}>=[];
 const points=new Map<string,PlaceContext>();
 return async(lon:number,lat:number,signal:AbortSignal):Promise<PlaceContext>=>{
  const key=`${lon.toFixed(5)},${lat.toFixed(5)}`;
  if(points.has(key))return points.get(key)!;
  const point=[lon,lat],box:Box=[lon,lat,lon,lat];
  const found=(layer:number)=>regions.find(r=>r.layer===layer&&intersects(r.box,box)&&containsPoint(r.feature.geometry,point))?.feature;
  let zip=found(2),place=found(28)||found(30);
  const layers=[...(zip?[]:[2]),...(place?[]:[28,30])];
  const results=await Promise.all(layers.map(async layer=>{
   const params=new URLSearchParams({f:'geojson',geometry:`${lon},${lat}`,geometryType:'esriGeometryPoint',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:layer===2?'GEOID,ZCTA5,NAME':'GEOID,NAME',returnGeometry:'true',geometryPrecision:'5',maxAllowableOffset:'0.00001'});
   const data=await readJSON<FeatureCollection>(`${SOURCE}/${layer}/query?${params}`,signal);
   for(const feature of data.features||[])if(feature.geometry){regions.push({layer,feature,box:geometryBox(feature.geometry)});}
   if(regions.length>128)regions.splice(0,regions.length-128);
   return {layer,feature:data.features?.[0]};
  }));
  zip=zip||results.find(r=>r.layer===2)?.feature;
  place=place||results.find(r=>r.layer===28)?.feature||results.find(r=>r.layer===30)?.feature;
  const context={zip:zip?.properties?.ZCTA5||zip?.properties?.GEOID,city:place?.properties?.NAME?.replace(/ (city|town|village|borough|municipality|CDP)$/i,'')};
  points.set(key,context);if(points.size>256)points.delete(points.keys().next().value!);
  return context;
 };
}
