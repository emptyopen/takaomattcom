'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { color, globalIndex, median, palette } from './model';
import 'leaflet/dist/leaflet.css';
import './wealth-map.css';

type Props = { id: string; name: string; value: number | null; moe?: number | null; kind: string; index?: number | null };
type Area = Feature<Geometry, Props>;
type Meta = { usIncome: number; usGDP: number; worldGDP: number; year: number };
const places = [ {name:'San Francisco', center:[37.765,-122.44], zoom:12}, {name:'New York', center:[40.73,-73.98], zoom:11}, {name:'United States', center:[38,-97], zoom:4}, {name:'World', center:[22,8], zoom:2} ];
const money = (n: number | null | undefined) => n == null ? 'No estimate' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer';
async function json(url: string, signal?: AbortSignal) { const r = await fetch(url,{signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000)}); if(!r.ok) throw new Error(`Data request failed (${r.status})`); const d = await r.json(); if(d.error) throw new Error(d.error.message); return d; }

export default function WealthMap() {
 const host = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null), modeRef = useRef('relative'), refresh = useRef<()=>void>(()=>{});
 const [mode,setMode] = useState('relative'), [selected,setSelected] = useState<Props|null>(null), [status,setStatus] = useState('Preparing the atlas…'), [count,setCount] = useState(0), [anchor,setAnchor] = useState(1), [level,setLevel] = useState('Block groups'), [error,setError] = useState(''), [info,setInfo] = useState(false), [ready,setReady] = useState(false);
 useEffect(()=>{
  let disposed = false, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout>;
  let layer: Leaflet.GeoJSON, world: Area[] = [], current: Area[] = [], meta: Meta;
  const incomes = new Map<string, Record<string,[number|null,number|null]>>();
  const cache = new Map<string, FeatureCollection>();
  let L: typeof Leaflet;
  function paint() {
   const m = map.current; if (!m || !layer) return;
   const bounds = m.getBounds();
   const visible = current.filter(f=>bounds.intersects(L.geoJSON(f).getBounds()));
   const base = modeRef.current === 'relative' ? median(visible.map(f=>f.properties.index || 0)) || 1 : 1;
   setAnchor(base); setCount(visible.filter(f=>f.properties.index != null).length);
   layer.clearLayers();
   layer.addData({type:'FeatureCollection',features:current} as FeatureCollection);
   layer.setStyle(f=>({fillColor:color(f?.properties.index,base), fillOpacity:.85, color:'#112b35',weight:m.getZoom()>8 ? .6 : .7}));
  }
  async function update() {
   const m = map.current; if(!m) return;
   controller?.abort(); controller = new AbortController(); const signal = controller.signal;
   const zoom = m.getZoom(), b = m.getBounds();
   setSelected(null); setError('');
   const us = zoom >= 4 && b.intersects(L.latLngBounds([18,-179],[72,-66]));
   if(!us) { current = world; setLevel('Countries'); setStatus('2024 · World Bank'); paint(); return; }
   const id = zoom >= 10 ? 10 : zoom >= 7 ? 8 : zoom >= 5 ? 82 : 80;
   const kind = id === 10 ? 'Block group' : id === 8 ? 'Census tract' : id === 82 ? 'County' : 'State';
   setStatus('Loading public Census boundaries…'); setLevel(kind+'s');
   try {
    const key = `${id}:${[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(x=>x.toFixed(4)).join(',')}`;
    let data = cache.get(key);
    if(!data) {
     if(id===10 && b.getWest()>=-122.65 && b.getEast()<=-122.15 && b.getSouth()>=37.5 && b.getNorth()<=38.0) data = await json('/wealth-data/san-francisco.json',signal);
     else {
      const features: Feature[] = [];
      for(let offset=0;offset<10000;offset+=2000) {
       const p = new URLSearchParams({f:'geojson',where:'1=1',geometry:`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'GEOID,NAME,STATE',returnGeometry:'true',geometryPrecision:'5',maxAllowableOffset:zoom>=10?'0.00004':zoom>=7?'0.0003':'0.005',resultRecordCount:'2000',resultOffset:String(offset),orderByFields:'GEOID'});
       const page = await json(`${TIGER}/${id}/query?${p}`,signal);
       if(!page.features) throw new Error('Boundary service did not return features');
       features.push(...page.features);
       if(!page.exceededTransferLimit && !page.properties?.exceededTransferLimit) break;
       if(offset===8000) throw new Error('Too many areas. Zoom in to load a complete comparison.');
      }
      data = {type:'FeatureCollection',features};
     }
     if(data) { cache.set(key,data); if(cache.size>20) cache.delete(cache.keys().next().value!); }
    }
    const features = data!.features;
    const states = [...new Set(features.map(f=>String(f.properties?.GEOID).slice(0,2)))];
    await Promise.all(states.map(async state=>{if(!incomes.has(state)) incomes.set(state,await json(`/wealth-data/us-${state}.json`,signal));}));
    if(signal.aborted || disposed) return;
    const local: Area[] = features.map(f=>{const p=f.properties!, geo=String(p.GEOID), [value,moe]=incomes.get(geo.slice(0,2))?.[geo] || [null,null]; return {...f,properties:{id:geo,name:p.NAME,value,moe,kind,index:globalIndex(value,kind,meta)}} as Area;});
    current = [...world.filter(f=>f.properties.id!=='USA' && f.properties.id!=='PRI'),...local];
    setStatus('2020–2024 · U.S. Census ACS'); paint();
   } catch(e) { if(signal.aborted || disposed) return; current=world; setLevel('Countries'); paint(); setStatus('Country overview'); setError(`${e instanceof Error ? e.message : 'Census unavailable'}. Showing country data; retry or choose a closer view.`); }
  }
  (async()=>{
   try {
    const loaded = await Promise.all([import('leaflet'),json('/wealth-data/world.json'),json('/wealth-data/meta.json')]);
    if(disposed || !host.current) return;
    L=loaded[0]; meta=loaded[2]; world=loaded[1].features.map((f:Area)=>({...f,properties:{...f.properties,index:globalIndex(f.properties.value,'country',meta)}}));
    const m=L.map(host.current,{zoomControl:false,attributionControl:true,minZoom:2,maxZoom:16,worldCopyJump:false,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1,preferCanvas:true}).setView([37.765,-122.44],12); map.current=m;
    L.control.zoom({position:'bottomright'}).addTo(m);
    m.attributionControl.addAttribution('U.S. Census Bureau · World Bank · Natural Earth');
    layer=L.geoJSON(undefined,{onEachFeature:(f,l)=>{
     const label=document.createElement('span'); label.textContent=f.properties.name;
     l.bindTooltip(label,{sticky:true,className:'atlas-tooltip'});
     l.on('click',()=>setSelected(f.properties as Props));
     l.on('mouseover',()=>{(l as Leaflet.Path).setStyle({weight:2,color:'#fff3c5',fillOpacity:1});});
     l.on('mouseout',()=>{(l as Leaflet.Path).setStyle({weight:m.getZoom()>8?.6:.7,color:'#112b35',fillOpacity:.85});});
    }}).addTo(m);
    for (const city of [{name:'SAN FRANCISCO',lat:37.775,lon:-122.44},{name:'OAKLAND',lat:37.805,lon:-122.27},{name:'NEW YORK',lat:40.73,lon:-73.98}]) { const marker=L.marker([city.lat,city.lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'city-label',html:city.name,iconSize:[130,16],iconAnchor:[65,8]})}); const show=()=>{if(m.getZoom()>=9)marker.addTo(m);else marker.remove();};m.on('zoomend',show);show(); }
    current=world; paint(); refresh.current=()=>{void update();};
    m.on('moveend',()=>{clearTimeout(timer); timer=setTimeout(()=>void update(),180);});
    setReady(true); await update();
   } catch { if(!disposed) {setError('The atlas could not load. Reload the page to try again.');setStatus('Data unavailable');} }
  })();
  return ()=>{disposed=true;clearTimeout(timer);controller?.abort();map.current?.remove();map.current=null;};
 },[]);
 function changeMode(value:string) {setMode(value);modeRef.current=value;refresh.current();}
 return <main className="atlas">
  <header className="atlas-header"><a className="atlas-brand" href="/">MT<span>/</span> LABS</a><div className="atlas-title">WEALTH ATLAS <span>EXPLORER 01</span></div><button className="method-button" onClick={()=>setInfo(!info)}>About the data <span>↗</span></button></header>
  <div className="atlas-body">
   <aside className="atlas-sidebar">
    <div className="eyebrow"><i /> PUBLIC DATA · OPEN EXPLORATION</div>
    <h1>A different <br/>perspective on <br/><em>prosperity.</em></h1>
    <p className="intro">From a whole world to a few city blocks. Explore how economic advantage changes with your point of view.</p>
    <div className="control-label">01 / CHOOSE YOUR LENS</div>
    <div className="lens-switch"><button aria-pressed={mode==='relative'} onClick={()=>changeMode('relative')}>Relative to view</button><button aria-pressed={mode==='global'} onClick={()=>changeMode('global')}>Absolute global</button></div>
    <p className="lens-note">{mode==='relative'?'Colors compare areas in your current window. Pan or zoom to change the reference.':'A fixed world reference. Colors stay consistent wherever you move.'}</p>
    <div className="control-label">02 / JUMP SOMEWHERE</div>
    <div className="destinations">{places.map((p,i)=><button key={p.name} disabled={!ready} onClick={()=>map.current?.setView(p.center as [number,number],p.zoom)}><span>0{i+1}</span>{p.name}<b>↗</b></button>)}</div>
    <div className={`area-card${selected ? " area-selected" : ""}`} aria-live="polite">{selected ? <><button className="close-selection" aria-label="Close area details" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">{selected.kind} · {selected.id}</div><h2>{selected.name}</h2><div className="area-value">{money(selected.value)}</div><p>{selected.kind==='country'?'GDP per person · PPP international $ · 2024':'Income per person · annual USD · 2020–2024'}</p>{selected.moe!=null && <p>90% margin of error: ±{money(selected.moe)}{selected.value && selected.moe/selected.value>.3?' · High uncertainty':''}</p>}<div className="index-row"><strong>{selected.index ? (selected.index/anchor).toFixed(2)+'×' : '—'}</strong><span>{mode==='relative'?'visible-area median':'world GDP/person anchor'}<br/>prosperity proxy</span></div></> : <><div className="eyebrow">THE SMALLER PICTURE</div><h2>Every place has a story.</h2><p>Click an area to inspect its estimate, uncertainty, and comparison.</p><div className="selection-icon">⌖ <span>Pan to explore · Scroll to zoom</span></div></>}</div>
    <div className="sidebar-footer"><span>NO PAID DATA API</span><span>2024 SNAPSHOT</span></div>
   </aside>
   <section className="map-section" aria-label="Interactive prosperity map">
    <div ref={host} className="atlas-map" aria-label="Map. Use arrow keys to pan and plus or minus to zoom." />
    <div className="map-top"><div className="map-badge"><i/>{level}<span>Adaptive detail</span></div><div className="map-live">{count.toLocaleString()} areas with estimates in view</div></div>
    <div className="map-caption"><span>THE GEOGRAPHY OF OPPORTUNITY</span><strong>{mode==='relative'?'Everything is relative.':'One world. One reference.'}</strong></div>
    <div className="legend"><div className="legend-heading"><strong>Prosperity proxy</strong><span>{mode==='relative'?'RELATIVE':'FIXED GLOBAL'}</span></div><div className="color-scale">{palette.map(c=><i key={c} style={{background:c}}/>)}</div><div className="legend-values"><span>≤ 0.125×</span><span>1× reference</span><span>≥ 8×</span></div><p>{mode==='relative'?'Reference = median proxy of visible areas; each area counts equally.':'Reference = 2024 world GDP per person (PPP). U.S. detail is modeled.'}</p><div className="no-data-key"><i/> No estimate</div><div className="legend-status"><i/>{status}</div></div>
    {error && <div className="map-error" role="alert">{error}<button onClick={()=>refresh.current()}>Retry</button></div>}
   </section>
  </div>
  {info && <div className="method-backdrop" onClick={()=>setInfo(false)}><section className="method-panel" role="dialog" aria-modal="true" aria-label="Data and methodology" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setInfo(false); if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button,a');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}}}><button autoFocus className="close-method" onClick={()=>setInfo(false)}>Close ×</button><div className="eyebrow">TRANSPARENCY FIRST</div><h2>A map of economic proxies.<br/>Not personal net worth.</h2><p>Countries show 2024 GDP per capita at purchasing-power parity from the World Bank. U.S. states, counties, tracts and block groups show Census ACS 2020–2024 per capita income (B19301). Zoom 10+ unlocks block groups, the smallest published geography for this income table. No household or property-level estimates are invented.</p><h3>Two ways to compare</h3><p>The fixed global proxy is country GDP per person ÷ world GDP per person. U.S. areas use (local income ÷ U.S. income) × (U.S. GDP per person ÷ world GDP per person). This is an illustrative allocation of national output, not a measured local GDP, global income percentile, or wealth estimate.</p><p>Relative mode divides that proxy by the median of areas intersecting the visible window (boundary bounding boxes). Areas are equally weighted, not population weighted. Missing estimates are gray and excluded. Seven logarithmic color bins span ⅛× to 8×; values beyond that range saturate.</p><h3>Resolution is not certainty</h3><p>ACS figures are five-year survey estimates in 2024 dollars. Small-area margins of error can be large; click an area to see its reported 90% margin. U.S. income and global economic output are different concepts. The global bridge does not adjust for local cost of living, household size, assets, debts, or inequality within each area. Outside the U.S., detail remains country-level. Geography boundaries do not imply endorsement.</p><h3>Free sources, minimal infrastructure</h3><p>Income and world snapshots ship as static files. U.S. boundaries are requested from Census TIGERweb as you move; San Francisco has a cached starter view. No paid map tiles, tracking, accounts, or new backend. Existing hosting bandwidth still applies.</p><div className="source-links"><a href="https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html" target="_blank" rel="noreferrer">Census ACS ↗</a><a href="https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.CD" target="_blank" rel="noreferrer">World Bank ↗</a><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth ↗</a><a href="/wealth-data/meta.json" target="_blank" rel="noreferrer">Snapshot provenance ↗</a></div></section></div>}
 </main>;
}
