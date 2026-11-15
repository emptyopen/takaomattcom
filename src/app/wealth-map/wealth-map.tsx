'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { color, globalIndex, median, palette } from './model';
import { areaName, cellsFor, detailLevel, geometryBox, intersects, type Box, type Cell } from './spatial';
import { loadCell, readJSON } from './data';
import 'leaflet/dist/leaflet.css';
import './wealth-map.css';

type Properties = { id:string; name:string; value:number|null; moe?:number|null; kind:string; index:number|null };
type Area = Feature<Geometry,Properties> & { box:Box };
type Meta = { usIncome:number; usGDP:number; worldGDP:number };
type Entry = { area:Area; shape:Leaflet.GeoJSON; fill:string };
const kinds:Record<number,string>={0:'Country',80:'State',82:'County',8:'Census tract',10:'Block group'};
const plural:Record<number,string>={0:'Countries',80:'States',82:'Counties',8:'Census tracts',10:'Block groups'};
const places = [{name:'San Francisco',center:[37.765,-122.44],zoom:12},{name:'New York',center:[40.73,-73.98],zoom:12},{name:'United States',center:[38,-97],zoom:4},{name:'World',center:[22,8],zoom:2}];
const money=(n:number|null|undefined)=>n==null?'No estimate':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);

export default function WealthMap() {
 const host=useRef<HTMLDivElement>(null), map=useRef<Leaflet.Map|null>(null), retry=useRef(()=>{});
 const [selected,setSelected]=useState<Properties|null>(null),[anchor,setAnchor]=useState(1),[global,setGlobal]=useState(false);
 const [status,setStatus]=useState('Loading map…'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[info,setInfo]=useState(false);
 const [ready,setReady]=useState(false);
 const aboutButton=useRef<HTMLButtonElement>(null);

 useEffect(()=>{
  const abort=new AbortController();let disposed=false,timer:ReturnType<typeof setTimeout>,frame=0;
  let L:typeof Leaflet,m:Leaflet.Map,meta:Meta,names:Record<string,string>,staticKeys:Set<string>;
  let world:Area[]=[],target=10,view:Box=[-123,37,-122,38],wanted:Cell[]=[],queue:Cell[]=[],base=1;
  let fallback:number|null=null,completeLevel=0;
  const tileCache=new Map<string,Area[]>(),inflight=new Set<string>(),failed=new Set<string>();
  const incomes=new Map<string,Promise<Record<string,[number|null,number|null]>>>();
  const overview=new Map<number,Area[]>(),overviewPromises=new Map<number,Promise<void>>();
  const groups=new Map<number,Leaflet.LayerGroup>(),entries=new Map<number,Map<string,Entry>>();
  let loadingGrid:Leaflet.LayerGroup;
  const metrics={disk:0,static:0,census:0};

  function convert(data:FeatureCollection,layer:number):Area[] {
   return data.features.filter(f=>f.geometry).map(f=>{
    const p=f.properties!,id=String(layer===0?p.id:p.GEOID),kind=layer===0?'country':kinds[layer];
    const value=p.value>0?p.value:null;
    return {...f,box:geometryBox(f.geometry),properties:{id,name:layer===0?p.name:areaName(id,p.NAME,names),kind,value,moe:p.moe??null,index:globalIndex(value,kind,meta)}} as Area;
   });
  }
  function stateIncome(state:string) {
   if(['60','66','69','78'].includes(state))return Promise.resolve({} as Record<string,[number|null,number|null]>);
   if(!incomes.has(state)) {
    const promise=readJSON<Record<string,[number|null,number|null]>>(`/wealth-data/us-${state}.json`,abort.signal);
    incomes.set(state,promise);promise.catch(()=>incomes.delete(state));
   }
   return incomes.get(state)!;
  }
  async function cellAreas(cell:Cell) {
   const data=await loadCell(cell,staticKeys,abort.signal,source=>{metrics[source]++;if(host.current)host.current.dataset[source+'Loads']=String(metrics[source]);});
   const states=[...new Set(data.features.map(f=>String(f.properties!.GEOID).slice(0,2)))];
   const tables=new Map(await Promise.all(states.map(async state=>[state,await stateIncome(state)] as const)));
   for(const f of data.features) { const p=f.properties!,id=String(p.GEOID);const [value,moe]=tables.get(id.slice(0,2))?.[id] || [null,null];p.value=value;p.moe=moe; }
   return convert(data,cell.layer);
  }
  function getGroup(id:number) {
   if(!groups.has(id)){groups.set(id,L.layerGroup());entries.set(id,new Map());}
   return groups.get(id)!;
  }
  // Reuse shapes and their already-computed bounds. A pan never reconstructs
  // every GeoJSON object, and a scale change only repaints changed color bins.
  function draw(id:number,areas:Area[],reference:number) {
   const group=getGroup(id),known=entries.get(id)!,keep=new Set<string>();
   for(const area of areas) {
    if(!intersects(area.box,view))continue;
    const p=area.properties;keep.add(p.id);const fill=color(p.index,reference);
    const existing=known.get(p.id);
    if(existing){if(existing.fill!==fill){existing.shape.setStyle({fillColor:fill});existing.fill=fill;}continue;}
    const shape=L.geoJSON(area,{pane:`wealth-${id}`,style:{fillColor:fill,fillOpacity:.92,color:'#15303a',weight:id===10?.5:.8},onEachFeature:(_,path)=>{
     const label=document.createElement('span');label.textContent=`${p.name} · ${money(p.value)}`;
     path.bindTooltip(label,{sticky:true,className:'atlas-tooltip'});
     path.on('click',()=>setSelected(p));
    }});
    known.set(p.id,{area,shape,fill});group.addLayer(shape);
   }
   for(const [id,e] of known)if(!keep.has(id)){group.removeLayer(e.shape);known.delete(id);}
   if(!m.hasLayer(group))group.addTo(m);
  }
  function schedulePaint(){if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;paint();});}
  function paint() {
   if(disposed||!m)return;
   const started=performance.now();
   let data:Area[],missing:Cell[]=[];
   if(target===0)data=world;
   else if(target===80||target===82)data=overview.get(target)||[];
   else { const unique=new Map<string,Area>();for(const cell of wanted){const areas=tileCache.get(cell.key);if(areas)for(const a of areas)unique.set(a.properties.id,a);else missing.push(cell);}data=[...unique.values()]; }
   const complete=target===0||(target===80||target===82?overview.has(target):missing.length===0);
   const visible=data.filter(a=>intersects(a.box,view));
   // Never calculate a relative reference from an incomplete set of tiles.
   if(complete){base=target===0?1:median(visible.map(a=>a.properties.index||0))||1;setAnchor(base);setGlobal(target===0);}
   draw(0,world,target===0?1:base);
   // A jump into an uncached city still has recognizable local geography.
   // Keep the prior detail too, until its replacement has finished loading.
   if(!complete&&(target===8||target===10)&&overview.has(82))draw(82,overview.get(82)!,base);
   if(target!==0)draw(target,visible,base);
   if(complete){completeLevel=target;fallback=null;}
   for(const [id,g] of groups)if(id!==0&&id!==target&&id!==fallback&&!(id===82&&!complete&&(target===8||target===10)))m.removeLayer(g);
   loadingGrid.clearLayers();
   for(const cell of missing) {
    const b=cell.box;
    L.rectangle([[b[1],b[0]],[b[3],b[2]]],{pane:'pending',interactive:false,color:failed.has(cell.key)?'#efb985':'#b8d5d1',weight:1,dashArray:'4 6',fillColor:'#b8d5d1',fillOpacity:.05}).addTo(loadingGrid);
   }
   setLoading(!complete);
   const failures=missing.filter(c=>failed.has(c.key)).length;
   setError(failures?`${failures} map ${failures===1?'section':'sections'} unavailable. Existing detail is still visible.`:'');
   setStatus(complete?`${plural[target]} · ${target===0?'2024':'2020–2024'}`:`${failures?'Waiting for':'Loading'} ${plural[target].toLowerCase()}${wanted.length?` · ${wanted.length-missing.length}/${wanted.length} sections`:''}`);
   if(host.current){host.current.dataset.renderMs=(performance.now()-started).toFixed(1);host.current.dataset.cachedTiles=String(tileCache.size);host.current.dataset.pendingTiles=String(missing.length);}
  }
  function pump() {
   if(disposed)return;
   while(inflight.size<4 && queue.length) {
    const cell=queue.shift()!;
    if(tileCache.has(cell.key)||inflight.has(cell.key)||failed.has(cell.key))continue;
    inflight.add(cell.key);
    cellAreas(cell).then(areas=>{
     if(disposed)return;tileCache.set(cell.key,areas);
     const protectedKeys=new Set(wanted.map(c=>c.key));
     for(const key of tileCache.keys()){if(tileCache.size<=96)break;if(!protectedKeys.has(key))tileCache.delete(key);}
    }).catch(()=>{if(!disposed)failed.add(cell.key);}).finally(()=>{inflight.delete(cell.key);schedulePaint();pump();});
   }
  }
  function loadOverview(id:number) {
   if(!overviewPromises.has(id)) {
    const p=readJSON<FeatureCollection>(`/wealth-data/${id===80?'states':'counties'}.json`,abort.signal).then(data=>{overview.set(id,convert(data,id));schedulePaint();}).catch(()=>{overviewPromises.delete(id);if(target===id&&!disposed){setError('Overview unavailable. Retry to load it.');setLoading(false);}});
    overviewPromises.set(id,p);
   }
   return overviewPromises.get(id)!;
  }
  function update() {
   const b=m.getBounds();view=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
   let next=detailLevel(m.getZoom());
   const countyAreas=overview.get(82);
   const inUS=countyAreas?countyAreas.some(a=>intersects(a.box,view)):intersects(view,[-179,18,-66,72]);
   if(!inUS)next=0;
   if(next!==target){fallback=completeLevel||null;target=next;setSelected(null);}
   if(target===80||target===82)void loadOverview(target);
   wanted=target===8||target===10?cellsFor(view,target).filter(c=>!countyAreas||countyAreas.some(a=>intersects(a.box,c.box))):[];
   // Replace queued work on navigation; completed and in-flight cells are reused.
   queue=wanted.filter(c=>!tileCache.has(c.key)&&!inflight.has(c.key)&&!failed.has(c.key));
   paint();pump();
  }
  (async()=>{
   try {
    const loaded=await Promise.all([import('leaflet'),readJSON<FeatureCollection>('/wealth-data/world.json',abort.signal),readJSON<Meta>('/wealth-data/meta.json',abort.signal),readJSON<Record<string,string>>('/wealth-data/county-names.json',abort.signal),readJSON<string[]>('/wealth-data/tiles-v3/manifest.json',abort.signal)]);
    if(disposed||!host.current)return;
    L=loaded[0];meta=loaded[2];names=loaded[3];staticKeys=new Set(loaded[4]);world=convert(loaded[1],0);
    m=L.map(host.current,{zoomControl:false,minZoom:2,maxZoom:16,preferCanvas:true,zoomAnimation:true,wheelDebounceTime:80,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1}).setView([37.765,-122.44],12);
    map.current=m;
    [0,80,82,8,10].forEach((id,i)=>{m.createPane(`wealth-${id}`).style.zIndex=String(300+i*10);});
    m.createPane('pending').style.pointerEvents='none';loadingGrid=L.layerGroup().addTo(m);
    L.control.zoom({position:'bottomright'}).addTo(m);m.attributionControl.addAttribution('Census · World Bank · Natural Earth');
    for(const city of [{name:'San Francisco',lat:37.775,lon:-122.44},{name:'Oakland',lat:37.805,lon:-122.27},{name:'New York',lat:40.73,lon:-73.98}]) {
     const marker=L.marker([city.lat,city.lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'city-label',html:city.name,iconSize:[130,16],iconAnchor:[65,8]})});
     const show=()=>{if(m.getZoom()>=9)marker.addTo(m);else marker.remove();};m.on('zoomend',show);show();
    }
    m.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(update,100);});
    retry.current=()=>{failed.clear();update();};setReady(true);update();
    // Warm cheap, site-hosted overviews once. Later zoom-outs are memory-only.
    void loadOverview(80);void loadOverview(82);
   }catch {if(!disposed){setError('Map could not load. Reload the page to retry.');setStatus('Unavailable');setLoading(false);}}
  })();
  return()=>{disposed=true;abort.abort();clearTimeout(timer);cancelAnimationFrame(frame);map.current?.remove();map.current=null;};
 },[]);

 function closeInfo(){setInfo(false);aboutButton.current?.focus();}
 return <main className="atlas">
  <div ref={host} className="atlas-map" aria-label="Wealth map. Arrow keys pan; plus and minus zoom." />
  <header className="atlas-header"><a href="/" aria-label="Matt Takao home">MT</a><h1>Wealth map</h1><select aria-label="Jump to a place" defaultValue="0" disabled={!ready} onChange={e=>{const p=places[Number(e.target.value)];map.current?.setView(p.center as [number,number],p.zoom);}}>{places.map((p,i)=><option value={i} key={p.name}>{p.name}</option>)}</select><button ref={aboutButton} onClick={()=>setInfo(true)}>About</button></header>
  <div className={`map-status${loading?' is-loading':''}`} role="status"><i/>{status}{loading&&<span>Outlined sections are loading. You can keep exploring.</span>}</div>
  <div className="legend"><div className="color-scale">{palette.map(c=><i key={c} style={{background:c}}/>)}</div><div className="legend-values"><span>Lower</span><span>{loading?'Updating comparison':global?'World reference':'Relative to view'}</span><span>Higher</span></div></div>
  {selected&&<section className="area-card" aria-label="Selected area" aria-live="polite"><button className="close" aria-label="Close area details" onClick={()=>setSelected(null)}>×</button><h2>{selected.name}</h2><strong>{money(selected.value)}</strong><p>{selected.kind==='country'?'GDP/person · PPP international $ · 2024':'Income/person · USD · 2020–2024'}</p>{selected.moe!=null&&<p>90% margin: ±{money(selected.moe)}{selected.value&&selected.moe/selected.value>.3?' · High uncertainty':''}</p>}<p>{selected.index?(selected.index/anchor).toFixed(2)+'×':'—'} {global?'world reference':'visible-area median'}{loading?' (comparison updating)':''}</p></section>}
  {error&&<div className="map-error" role="alert">{error}<button onClick={()=>retry.current()}>Retry</button></div>}
  {info&&<div className="method-backdrop" onClick={closeInfo}><section className="method-panel" role="dialog" aria-modal="true" aria-label="About the wealth map" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')closeInfo();if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button,a');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}><button autoFocus className="close" onClick={closeInfo}>Close ×</button><h2>About this map</h2><p>Colors adapt automatically: a fixed world reference at world scale, and comparison with the visible-area median as you zoom in. Each area counts equally. Missing estimates are gray.</p><p>Countries show World Bank 2024 GDP per person (PPP). U.S. areas show Census ACS 2020–2024 income per person, down to block groups at zoom 12. These are economic proxies, not personal net worth.</p><p>The global proxy is GDP/person ÷ world GDP/person. U.S. detail multiplies the U.S. proxy by local income ÷ national income. This illustrative bridge is not measured local GDP or globally comparable household wealth. Seven logarithmic color bins span ⅛× to 8× the reference.</p><p>Block groups have numbers, not unique neighborhood names. Labels include the county and census tract so every area is identifiable. Survey uncertainty is shown when you select an area.</p><p>Detail loads in small, reusable sections. Outlines mark pending sections; existing geometry remains visible. The reference updates when the view finishes loading. Boundaries are cached in your browser for repeat visits. No paid map service or new backend.</p><div className="source-links"><a href="https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html">Census ACS</a><a href="https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.CD">World Bank</a><a href="/wealth-data/meta.json">Sources &amp; snapshot</a></div></section></div>}
 </main>;
}
