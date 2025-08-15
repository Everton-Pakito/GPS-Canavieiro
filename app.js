let map, gpxLayer, route = [], following = false;
let markerUser, nextTurnIndex = 0;
const hud = document.getElementById('hudAlert');
const panel = document.getElementById('panel');
let hideTimeout;

function metersToText(m){return m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';}
function hav(p1,p2){const R=6371000,toRad=d=>d*Math.PI/180;
  const dLat=toRad(p2.lat-p1.lat),dLon=toRad(p2.lon-p1.lon);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(p1.lat))*Math.cos(toRad(p2.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));}
function bearing(p1,p2){const toRad=d=>d*Math.PI/180,toDeg=r=>r*180/Math.PI;
  const y=Math.sin(toRad(p2.lon-p1.lon))*Math.cos(toRad(p2.lat));
  const x=Math.cos(toRad(p1.lat))*Math.sin(toRad(p2.lat))-Math.sin(toRad(p1.lat))*Math.cos(toRad(p2.lat))*Math.cos(toRad(p2.lon-p1.lon));
  return (toDeg(Math.atan2(y,x))+360)%360;}
function speak(msg){const u=new SpeechSynthesisUtterance(msg);u.lang='pt-BR';speechSynthesis.speak(u);}
function vibrate(ms){if(navigator.vibrate) navigator.vibrate(ms);}

function showHUD(msg, risk=false){
  hud.textContent = msg;
  hud.classList.toggle('risk', risk);
  hud.style.display = 'block';
}
function hideHUD(){hud.style.display = 'none';}

function showPanel(){
  panel.classList.remove('hidden');
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(()=>panel.classList.add('hidden'), 5000);
}

function initMap(){
  map = L.map('map', { zoomControl:true }).setView([0,0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
  markerUser = L.circleMarker([0,0],{radius:6,color:'#22c55e',weight:2}).addTo(map);
}

async function loadRoute(){
  const res = await fetch('./routes/sample.gpx');
  const xml = new DOMParser().parseFromString(await res.text(),'application/xml');
  const trkpts = Array.from(xml.getElementsByTagName('trkpt')).map(el=>({lat:+el.getAttribute('lat'),lon:+el.getAttribute('lon')}));
  route = trkpts;
  document.getElementById('routeName').textContent = 'Exemplo';
  document.getElementById('routePts').textContent = route.length;
  let dist=0;for(let i=1;i<route.length;i++) dist+=hav(route[i-1],route[i]);
  document.getElementById('routeDist').textContent = metersToText(dist);
  if(gpxLayer) gpxLayer.remove();
  gpxLayer = L.polyline(route.map(p=>[p.lat,p.lon]),{weight:5}).addTo(map);
  map.fitBounds(gpxLayer.getBounds(),{padding:[50,50]});
}

function startNav(){
  following = true;
  document.getElementById('navStatus').textContent = 'navegando';
  navigator.geolocation.watchPosition(onPos,()=>{}, {enableHighAccuracy:true});
  speak('Navegação iniciada'); vibrate(200);
}
function stopNav(){
  following = false;
  document.getElementById('navStatus').textContent = 'parado';
  speak('Navegação encerrada'); vibrate([100,100,100]);
  hideHUD();
}
function nearestIndex(pos){
  let bestI=0,bestD=1e12;
  for(let i=0;i<route.length;i++){const d=hav(pos,route[i]);if(d<bestD){bestD=d;bestI=i;}}
  return bestI;
}

function onPos(e){
  const pos={lat:e.coords.latitude,lon:e.coords.longitude};
  markerUser.setLatLng([pos.lat,pos.lon]);
  if(!following) return;
  const i=nearestIndex(pos);
  nextTurnIndex = Math.max(nextTurnIndex,i);
  if(nextTurnIndex<route.length-2){
    const a=bearing(route[nextTurnIndex-1>=0?nextTurnIndex-1:0], route[nextTurnIndex]);
    const b=bearing(route[nextTurnIndex], route[nextTurnIndex+1]);
    const turnAngle=Math.abs(((b-a+540)%360)-180);
    if(turnAngle>=20){
      if(turnAngle>45){showHUD('Área de Risco',true);speak('Área de risco à frente');vibrate([300,150,300]);}
      else {showHUD('Curva Perigosa à Frente',false);speak('Curva perigosa à frente');vibrate(300);}
    } else {
      hideHUD();
    }
  }
}

document.getElementById('btnStart').onclick = startNav;
document.getElementById('btnStop').onclick = stopNav;
document.body.addEventListener('click', showPanel);

window.onload = ()=>{initMap();loadRoute();};