import type { Geometry } from 'geojson';
export type Box = [number, number, number, number];
export type Cell = { key: string; layer: number; box: Box };
export function intersects(a: Box, b: Box) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
export function geometryBox(geometry: Geometry): Box {
 const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
 function visit(c: unknown) {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === 'number') { box[0]=Math.min(box[0],c[0]);box[1]=Math.min(box[1],c[1]);box[2]=Math.max(box[2],c[0]);box[3]=Math.max(box[3],c[1]); }
  else c.forEach(visit);
 }
 if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g=>{const b=geometryBox(g);visit([b[0],b[1]]);visit([b[2],b[3]]);});
 else visit(geometry.coordinates);
 return box;
}
export function detailLevel(zoom: number) { return zoom >= 12 ? 10 : zoom >= 9 ? 8 : zoom >= 5 ? 82 : zoom >= 4 ? 80 : 0; }
export function cellsFor(box: Box, layer: number): Cell[] {
 const size=layer===10 ? .125 : 1, cells:Cell[]=[];
 const [w,s,e,n]=box;
 for(let x=Math.floor((Math.max(-180,w)+180)/size);x<Math.ceil((Math.min(180,e)+180)/size);x++) {
  for(let y=Math.floor((Math.max(-85,s)+90)/size);y<Math.ceil((Math.min(85,n)+90)/size);y++) {
   cells.push({key:`${layer}-${x}-${y}`,layer,box:[x*size-180,y*size-90,(x+1)*size-180,(y+1)*size-90]});
  }
 }
 const cx=(w+e)/2,cy=(s+n)/2;
 return cells.sort((a,b)=>((a.box[0]+a.box[2])/2-cx)**2+((a.box[1]+a.box[3])/2-cy)**2-(((b.box[0]+b.box[2])/2-cx)**2+((b.box[1]+b.box[3])/2-cy)**2));
}
export function areaName(id:string, original:string, counties:Record<string,string>) {
 if(id.length<11) return counties[id] || original;
 const tract=Number(id.slice(5,11))/100;
 return `${counties[id.slice(0,5)] || `County ${id.slice(0,5)}`} · Tract ${tract.toFixed(2).replace(/\.00$/, '')}${id.length===12 ? ` · Block group ${id[11]}` : ''}`;
}
