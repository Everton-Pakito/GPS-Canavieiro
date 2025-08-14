
/* GPX Navigator – follows GPX exactly with simple voice prompts */
let map, gpxLayer, route = [], routeName = '', routeDist = 0;
let watchId = null, speakEnabled = true, following = false;
let markerUser, markerNext;
let favorites = new Set(JSON.parse(localStorage.getItem('favorites')||'[]'));
let nextTurnIndex = 0;

const routeSelect = document.getElementById('routeSelect');
const routeNameEl = document.getElementById('routeName');
const routeDistEl = document.getElementById('routeDist');
const routePtsEl  = document.getElementById('routePts');
const gpsText = document.getElementById('gpsText');
const navStatus = document.getElementById('navStatus');
const toast = document.getElementById('toast');
const nextTurnText = document.getElementById('nextTurnText');
const cacheInfo = document.getElementById('cacheInfo');

function metersToText(m){ return m >= 1000 ? (m/1000).toFixed(1)+' km' : Math.round(m)+' m'; }
function bearing(p1, p2){
  const toRad = d=>d*Math.PI/180, toDeg = r=>r*180/Math.PI;
  const y = Math.sin(toRad(p2.lon-p1.lon))*Math.cos(toRad(p2.lat));
  const x = Math.cos(toRad(p1.lat))*Math.sin(toRad(p2.lat)) - Math.sin(toRad(p1.lat))*Math.cos(toRad(p2.lat))*Math.cos(toRad(p2.lon-p1.lon));
  const brng = (toDeg(Math.atan2(y,x))+360)%360;
  return brng;
}
function turnDir(a,b){ // returns 'direita', 'esquerda' or 'siga'
  let d = ((b - a + 540) % 360) - 180; // [-180,180]
  if (Math.abs(d) < 20) return 'siga em frente';
  return d > 0 ? 'vire à direita' : 'vire à esquerda';
}
function hav(p1,p2){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(p2.lat-p1.lat), dLon=toRad(p2.lon-p1.lon);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(p1.lat))*Math.cos(toRad(p2.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function cumulativeDistances(points){
  let total=0, out=[0];
  for(let i=1;i<points.length;i++){ total += hav(points[i-1], points[i]); out.push(total); }
  return out;
}
function speak(msg){
  if(!speakEnabled) return;
  const u = new SpeechSynthesisUtterance(msg);
  u.lang = 'pt-BR';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function loadRoutes(){
  const res = await fetch('./routes/routes.json?cache=' + Date.now());
  if(!res.ok) { routeSelect.innerHTML = '<option>Erro ao carregar rotas</option>'; return; }
  const files = await res.json(); // [{file, name}]
  // Detect new routes vs cache
  const prev = JSON.parse(localStorage.getItem('routes_list')||'[]');
  localStorage.setItem('routes_list', JSON.stringify(files));
  if (prev.length && JSON.stringify(prev) !== JSON.stringify(files)) {
    toast.style.display = 'block';
    setTimeout(()=> toast.style.display='none', 4500);
  }

  routeSelect.innerHTML = files.map(f=>`<option value="${f.file}">${favorites.has(f.file)?'★ ':''}${f.name||f.file}</option>`).join('');
  if(files.length) loadRoute(files[0].file, files[0].name);
}

async function loadRoute(file, niceName){
  const res = await fetch('./routes/' + file);
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const trkpts = Array.from(xml.getElementsByTagName('trkpt')).map(el=>({lat: +el.getAttribute('lat'), lon:+el.getAttribute('lon')}));
  if(trkpts.length<2){ alert('GPX inválido'); return; }
  route = trkpts;
  routeName = niceName || file;
  routeNameEl.textContent = routeName;
  routePtsEl.textContent = route.length;
  const dists = cumulativeDistances(route);
  routeDist = dists[dists.length-1];
  routeDistEl.textContent = metersToText(routeDist);

  if(gpxLayer) gpxLayer.remove();
  const latlngs = route.map(p=>[p.lat,p.lon]);
  gpxLayer = L.polyline(latlngs,{weight:5, opacity:.9}).addTo(map);
  map.fitBounds(gpxLayer.getBounds(), {padding:[60,60]});

  if(markerNext) markerNext.remove();
  markerNext = L.circleMarker(latlngs[1], {radius:6, weight:2}).addTo(map);
  nextTurnIndex = 1;
  nextTurnText.textContent = 'Pressione "Iniciar navegação"';
}

function initMap(){
  map = L.map('map', { zoomControl:true }).setView([0,0], 2);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 });
  tiles.addTo(map);

  markerUser = L.circleMarker([0,0], {radius:6, color:'#22c55e', weight:2}).addTo(map);
}

function onStart(){
  if(!route.length){ alert('Carregue uma rota'); return; }
  following = true; navStatus.textContent = 'navegando';
  if(watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, err=> gpsText.textContent = 'GPS erro: '+err.message, {enableHighAccuracy:true, maximumAge:1000, timeout:10000});
  speak('Navegação iniciada');
}
function onStop(){
  following = false; navStatus.textContent = 'parado';
  if(watchId) navigator.geolocation.clearWatch(watchId);
  speak('Navegação encerrada');
}

function nearestIndex(pos){
  // find closest segment index >= nextTurnIndex-1 for efficiency
  let bestI = 0, bestD = 1e12;
  const start = Math.max(0, nextTurnIndex-5);
  for(let i=start;i<route.length;i++){
    const d = hav(pos, route[i]);
    if(d<bestD){bestD=d; bestI=i;}
  }
  return bestI;
}

function onPos(e){
  const {latitude, longitude} = e.coords;
  const pos = {lat:latitude, lon:longitude};
  gpsText.textContent = `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  markerUser.setLatLng([latitude, longitude]);

  if(!following) return;

  // Find nearest point ahead
  let i = nearestIndex(pos);
  nextTurnIndex = Math.max(nextTurnIndex, i);

  // Move "next" marker
  if(nextTurnIndex < route.length) {
    markerNext.setLatLng([route[nextTurnIndex].lat, route[nextTurnIndex].lon]);
  }

  // Compute upcoming instruction based on bearing change
  if(nextTurnIndex < route.length-2){
    const a = bearing(route[nextTurnIndex-1>=0?nextTurnIndex-1:0], route[nextTurnIndex]);
    const b = bearing(route[nextTurnIndex], route[nextTurnIndex+1]);
    const dir = turnDir(a,b);
    const dist = hav(pos, route[nextTurnIndex]);
    nextTurnText.textContent = `${dir} em ${metersToText(dist)}`;
    if(dist < 18) { // 18 m threshold to announce and advance
      speak(`${dir}`);
      nextTurnIndex += 1;
    } else if (dist < 60 && Math.random() < 0.02) { // occasional reminder
      speak(`${dir} em ${Math.max(10, Math.round(dist/10)*10)} metros`);
    }
  } else {
    const distEnd = hav(pos, route[route.length-1]);
    nextTurnText.textContent = distEnd < 15 ? 'Chegou ao destino' : `Siga até o destino (${metersToText(distEnd)})`;
    if(distEnd < 15) { speak('Você chegou ao destino'); onStop(); }
  }
}

document.getElementById('btnStart').onclick = onStart;
document.getElementById('btnStop').onclick = onStop;
document.getElementById('btnReload').onclick = loadRoutes;
document.getElementById('btnDark').onclick = ()=> document.documentElement.classList.toggle('light');
document.getElementById('chkVoice').onchange = (e)=> speakEnabled = e.target.checked;
document.getElementById('btnFav').onclick = ()=>{
  const file = routeSelect.value;
  if(!file) return;
  if(favorites.has(file)) favorites.delete(file); else favorites.add(file);
  localStorage.setItem('favorites', JSON.stringify([...favorites]));
  loadRoutes();
};
routeSelect.onchange = ()=> loadRoute(routeSelect.value, routeSelect.options[routeSelect.selectedIndex].textContent);

window.addEventListener('load', ()=>{
  initMap();
  loadRoutes();
  caches.keys().then(keys => document.getElementById('cacheInfo').textContent = keys.join(', '));
});
