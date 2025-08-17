// GPS Canavieiro - v2.1
// Navegação por rotas GPX com HUD, voz e vibração

let map = L.map('map').setView([-23.55052, -46.63331], 18);

// Mapa base
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 20
}).addTo(map);

let routeLine, userMarker;
let currentRoute = null;
let navigationActive = false;
let currentIndex = 0;

// HUD
const hud = document.getElementById('hudAlert');
function showHUD(msg, risk = false) {
  hud.textContent = msg;
  hud.classList.toggle("risk", risk);
  hud.style.display = "block";

  // Voz
  const u = new SpeechSynthesisUtterance(msg);
  u.lang = "pt-BR";
  speechSynthesis.speak(u);

  // Vibração
  if (navigator.vibrate) {
    navigator.vibrate(risk ? [200, 100, 200] : 200);
  }
}

// Painel
const panel = document.getElementById('panel');
function showPanel() {
  panel.classList.remove('hidden');
  clearTimeout(panel._hideTimeout);
  panel._hideTimeout = setTimeout(() => panel.classList.add('hidden'), 5000);
}
map.on('click', showPanel);

// Botões
document.getElementById('btnStart').onclick = () => {
  if (currentRoute) {
    navigationActive = true;
    document.getElementById('navStatus').textContent = "navegando";
    showHUD("Navegação iniciada");
  }
};
document.getElementById('btnStop').onclick = () => {
  navigationActive = false;
  document.getElementById('navStatus').textContent = "parado";
  showHUD("Navegação parada");
};

// Carregar rotas
async function loadRoutes() {
  const res = await fetch('routes/routes.json');
  const routes = await res.json();
  if (routes.length > 0) {
    loadGPX("routes/" + routes[0].file, routes[0].name);
  }
}
loadRoutes();

// GPX Loader
async function loadGPX(url, name) {
  const res = await fetch(url);
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  const pts = xml.getElementsByTagName("trkpt");
  let latlngs = [];
  for (let p of pts) {
    latlngs.push([parseFloat(p.getAttribute("lat")), parseFloat(p.getAttribute("lon"))]);
  }
  if (routeLine) routeLine.remove();
  routeLine = L.polyline(latlngs, {color: 'lime'}).addTo(map);
  map.fitBounds(routeLine.getBounds());

  currentRoute = latlngs;
  currentIndex = 0;

  document.getElementById('routeName').textContent = name;
  document.getElementById('routePts').textContent = latlngs.length;
  document.getElementById('routeDist').textContent = (L.GeometryUtil.length(routeLine)/1000).toFixed(2) + " km";
}

// Geolocalização
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(pos => {
    const {latitude, longitude} = pos.coords;
    if (!userMarker) {
      userMarker = L.marker([latitude, longitude]).addTo(map);
    } else {
      userMarker.setLatLng([latitude, longitude]);
    }

    if (navigationActive && currentRoute) {
      followRoute(latitude, longitude);
    }
  }, err => console.error(err), {enableHighAccuracy:true});
}

// Seguir rota
function followRoute(lat, lon) {
  if (currentIndex >= currentRoute.length) return;

  let target = currentRoute[currentIndex];
  let dist = distance(lat, lon, target[0], target[1]);

  if (dist < 15) {
    // Detectar curva
    if (currentIndex > 0 && currentIndex < currentRoute.length-1) {
      let a = currentRoute[currentIndex-1];
      let b = currentRoute[currentIndex];
      let c = currentRoute[currentIndex+1];
      let ang = angleBetween(a,b,c);
      if (ang < 160 && ang >= 135) {
        showHUD("Curva perigosa à frente", false);
      } else if (ang < 135) {
        showHUD("Área de risco!", true);
      }
    }
    currentIndex++;
  }
}

// Distância haversine
function distance(lat1, lon1, lat2, lon2) {
  function toRad(x) {return x*Math.PI/180;}
  let R=6371e3;
  let dLat=toRad(lat2-lat1);
  let dLon=toRad(lon2-lon1);
  let a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Ângulo entre 3 pontos
function angleBetween(a,b,c) {
  function vec(p1,p2){return [p2[0]-p1[0],p2[1]-p1[1]];}
  function dot(v1,v2){return v1[0]*v2[0]+v1[1]*v2[1];}
  function norm(v){return Math.sqrt(v[0]**2+v[1]**2);}
  let v1=vec(b,a), v2=vec(b,c);
  return Math.acos(dot(v1,v2)/(norm(v1)*norm(v2)))*180/Math.PI;
}