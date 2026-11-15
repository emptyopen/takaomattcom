"""Refresh public snapshots. Python stdlib only; no API key or paid service."""
import csv, io, json, pathlib, urllib.parse, urllib.request, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2] / 'public' / 'wealth-data'
ROOT.mkdir(exist_ok=True)
TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer'
ACS = 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b19301.dat'

def read(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode('utf-8-sig')

def save(name, data):
    (ROOT / name).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')

rows = csv.DictReader(io.StringIO(read(ACS)), delimiter='|')
states = {}
national = None
for row in rows:
    geo = row['GEO_ID']
    def number(v):
        try:
            n = float(v)
            return n if n >= 0 else None
        except ValueError:
            return None
    pair = [number(row['B19301_E001']), number(row['B19301_M001'])]
    if geo == '0100000US':
        national = pair[0]
    if geo[:7] in ('0400000', '0500000', '1400000', '1500000'):
        fips = geo.split('US')[1]
        states.setdefault(fips[:2], {})[fips] = pair
for state, values in states.items():
    save('us-' + state + '.json', values)

wb_url = 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.CD?date=2024&format=json&per_page=400'
wb = json.loads(read(wb_url))[1]
values = {r['countryiso3code']: r['value'] for r in wb if r['value'] is not None}
world_url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
world = json.loads(read(world_url))
for f in world['features']:
    p = f['properties']
    code = p['ADM0_A3']
    f['properties'] = {'id': code, 'name': p['ADMIN'], 'value': values.get(code), 'kind': 'country'}
save('world.json', world)

# A useful first view works even if the Census geometry service is offline.
params = dict(f='geojson', where='1=1', geometry='-122.65,37.5,-122.15,38.0', geometryType='esriGeometryEnvelope', inSR=4326, outSR=4326, spatialRel='esriSpatialRelIntersects', outFields='GEOID,NAME,STATE', returnGeometry='true', geometryPrecision=5, maxAllowableOffset=0.00004, resultRecordCount=2000)
sf = json.loads(read(TIGER + '/10/query?' + urllib.parse.urlencode(params)))
assert sf.get('features') and not sf.get('exceededTransferLimit'), 'Incomplete starter geometry'
save('san-francisco.json', sf)
meta = {'year': 2024, 'acsPeriod': '2020–2024', 'usIncome': national, 'usGDP': values['USA'], 'worldGDP': values['WLD'], 'retrieved': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': {'acs': ACS, 'worldBank': wb_url, 'boundaries': TIGER, 'naturalEarth': world_url}, 'stateFiles': len(states), 'usAreas': sum(map(len, states.values()))}
save('meta.json', meta)
print(json.dumps(meta, indent=2))
