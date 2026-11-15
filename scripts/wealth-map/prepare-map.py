"""Prepare static overview layers and tile the existing SF starter geometry."""
import json, pathlib, urllib.request, urllib.parse, math
ROOT = pathlib.Path(__file__).resolve().parents[2] / 'public/wealth-data'
TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024'
LAYERS = {80:'State_County/MapServer/7',82:'State_County/MapServer/11',8:'Tracts_Blocks/MapServer/4',10:'Tracts_Blocks/MapServer/6'}

def query(layer, extra=None):
    features = []
    for offset in range(0, 20000, 2000):
        p = dict(f='geojson', where='1=1', outFields='GEOID,NAME,STATE', outSR=4326,
                 returnGeometry='true', geometryPrecision=4, maxAllowableOffset=.003,
                 resultRecordCount=2000, resultOffset=offset, orderByFields='GEOID')
        p.update(extra or {})
        with urllib.request.urlopen(TIGER+'/'+LAYERS[layer]+'/query?'+urllib.parse.urlencode(p),timeout=120) as r:
            d = json.load(r)
        if 'features' not in d: raise RuntimeError(d)
        features.extend(d['features'])
        if not (d.get('exceededTransferLimit') or d.get('properties',{}).get('exceededTransferLimit')):
            return {'type':'FeatureCollection','features':features}
    raise RuntimeError('Truncated layer')

def save(name, data):
    (ROOT/name).write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')

states = query(80)
state_names = {f['properties']['GEOID']:f['properties']['NAME'] for f in states['features']}
counties = query(82)
names = {f['properties']['GEOID']:f['properties']['NAME']+', '+state_names[f['properties']['STATE']] for f in counties['features']}
for name,data in [('states.json',states),('counties.json',counties)]:
    for f in data['features']:
        p=f['properties']; geo=p['GEOID']
        income=json.loads((ROOT/f'us-{geo[:2]}.json').read_text()).get(geo,[None,None]) if (ROOT/f'us-{geo[:2]}.json').exists() else [None,None]
        p.update(value=income[0],moe=income[1])
    save(name,data)
save('county-names.json',names)

# Reuse small fixed cells regardless of viewport pixels or zoom within a level.
# Only publish cells wholly contained in the original snapshot coverage.
tiles=ROOT/'tiles-v4'; tiles.mkdir(exist_ok=True)
manifest=[]
def bounds(coords):
    if isinstance(coords[0],(int,float)): return [coords[0],coords[1],coords[0],coords[1]]
    b=[bounds(c) for c in coords]
    return [min(x[0] for x in b),min(x[1] for x in b),max(x[2] for x in b),max(x[3] for x in b)]
def tile_data(data,layer,size,coverage):
    features=[(f,bounds(f['geometry']['coordinates'])) for f in data['features']]
    w,s,e,n=coverage
    for x in range(math.ceil((w+180)/size),math.floor((e+180)/size)):
        for y in range(math.ceil((s+90)/size),math.floor((n+90)/size)):
            left=x*size-180;bottom=y*size-90
            found=[f for f,b in features if b[0]<=left+size and b[2]>=left and b[1]<=bottom+size and b[3]>=bottom]
            key=f'{layer}-{x}-{y}'
            save('tiles-v4/'+key+'.json',{'type':'FeatureCollection','features':found})
            manifest.append(key)
blocks=query(10,dict(geometry='-123,37.375,-121.875,38.25',geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects',maxAllowableOffset=.00004,geometryPrecision=5))
tile_data(blocks,10,.125,[-123,37.375,-121.875,38.25])
tracts=query(8,dict(geometry='-124,36,-121,40',geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects',maxAllowableOffset=.0004))
tile_data(tracts,8,1,[-124,36,-121,40])
save('tiles-v4/manifest.json',manifest)
print(f'Prepared {len(states["features"])} states, {len(counties["features"])} counties, {len(manifest)} static detail cells')
