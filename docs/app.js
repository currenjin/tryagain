const CATEGORY_EMOJI = {
  '공공스케이트파크': '🛹',
  '사설스케이트파크': '🏢',
  '스팟': '📍',
  '스케이트샵': '🛒',
};

const CATEGORY_COLOR = {
  '공공스케이트파크': '#0284c7',
  '사설스케이트파크': '#c2610f',
  '스팟': '#16a34a',
  '스케이트샵': '#dc2626',
};

// ── State ──
let allSpots = [];
let clusterGroup;
let subwayMarkers = [];
let activeFilter = '전체';
let searchQuery = '';
let sortByDistance = false;
let radiusKm = 0;
let userLocation = null;
let userMarker = null;
let userCircle = null;
let favorites = new Set(JSON.parse(localStorage.getItem('spotmap_favorites') || '[]'));
let map;
let subwayFetchTimer = null;

// ── Helpers ──
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function saveFavorites() {
  localStorage.setItem('spotmap_favorites', JSON.stringify([...favorites]));
}

function toggleFavorite(id, e) {
  e.stopPropagation();
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  refresh();
}

// ── Filter & Sort ──
function getFilteredSpots() {
  let spots = allSpots.map(s => ({
    ...s,
    _dist: userLocation ? calcDistance(userLocation.lat, userLocation.lng, s.lat, s.lng) : null,
    _fav: favorites.has(s.id),
  }));

  if (activeFilter === '즐겨찾기') {
    spots = spots.filter(s => s._fav);
  } else if (activeFilter !== '전체') {
    spots = spots.filter(s => s.category === activeFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    spots = spots.filter(s =>
      s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)
    );
  }

  if (radiusKm > 0 && userLocation) {
    spots = spots.filter(s => s._dist !== null && s._dist <= radiusKm);
  }

  if (sortByDistance && userLocation) {
    spots = spots.sort((a, b) => (a._dist ?? 9999) - (b._dist ?? 9999));
  }

  return spots;
}

// ── Marker icons ──
function createMarkerIcon(category, isFav) {
  const color = CATEGORY_COLOR[category] || '#888';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px; height:14px; border-radius:50%;
      background:${color}; border:2.5px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,0.35);
      ${isFav ? 'outline:2px solid gold;' : ''}
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function subwayDotIcon(colors) {
  const bg = colors[0] || '#555';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:10px; height:10px; border-radius:50%;
      background:${bg}; border:1.5px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

// ── Render list ──
function renderList(spots) {
  const list = document.getElementById('spot-list');
  const count = document.getElementById('list-count');
  list.innerHTML = '';
  count.textContent = `${spots.length}개 스팟`;

  spots.forEach(spot => {
    const li = document.createElement('li');
    li.className = 'spot-item';
    li.dataset.id = spot.id;

    const thumb = spot.image
      ? `<img class="spot-thumb" src="${spot.image}" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="spot-thumb-placeholder">${CATEGORY_EMOJI[spot.category] || '📍'}</div>`;

    const distHtml = spot._dist !== null
      ? `<span class="spot-distance">${formatDistance(spot._dist)}</span>` : '';

    const favClass = spot._fav ? 'fav-btn active' : 'fav-btn';

    li.innerHTML = `
      ${thumb}
      <div class="spot-info">
        <div class="spot-name">${spot.name || '이름 없음'}</div>
        <div class="spot-category cat-${spot.category}">${spot.category}</div>
        <div class="spot-address">${spot.address || ''}</div>
      </div>
      <div class="spot-right">
        ${distHtml}
        <button class="${favClass}" data-id="${spot.id}">${spot._fav ? '♥' : '♡'}</button>
      </div>
    `;

    li.querySelector('.fav-btn').addEventListener('click', e => toggleFavorite(spot.id, e));
    li.addEventListener('click', () => selectSpot(spot));
    list.appendChild(li);
  });
}

// ── Render markers ──
function renderMarkers(spots) {
  clusterGroup.clearLayers();
  spots.forEach(spot => {
    if (!spot.lat || !spot.lng) return;
    const marker = L.marker([spot.lat, spot.lng], {
      icon: createMarkerIcon(spot.category, spot._fav),
    }).on('click', () => selectSpot(spot));
    clusterGroup.addLayer(marker);
  });
}

function refresh() {
  const spots = getFilteredSpots();
  renderList(spots);
  renderMarkers(spots);
}

// ── Select spot ──
function selectSpot(spot) {
  document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.spot-item[data-id="${spot.id}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (spot.lat && spot.lng) map.setView([spot.lat, spot.lng], 16);
  showDetail(spot);
}

// ── Detail panel ──
function showDetail(spot) {
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  panel.appendChild(closeBtn);

  // Gallery
  const images = spot.images?.length ? spot.images : (spot.image ? [spot.image] : []);
  if (images.length) {
    const gallery = document.createElement('div');
    gallery.className = images.length === 1 ? 'detail-gallery single' : 'detail-gallery';
    gallery.innerHTML = images.map(src =>
      `<img src="${src}" loading="lazy" onerror="this.style.display='none'">`
    ).join('');
    panel.appendChild(gallery);
  }

  // Content
  const isFav = favorites.has(spot.id);
  const distHtml = userLocation && spot.lat
    ? `<div class="detail-distance">📍 ${formatDistance(calcDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng))} 거리</div>`
    : '';

  const naverUrl = `https://map.naver.com/v5/search/${encodeURIComponent(spot.address || spot.name)}`;
  const kakaoUrl = `https://map.kakao.com/link/to/${encodeURIComponent(spot.name)},${spot.lat},${spot.lng}`;

  const content = document.createElement('div');
  content.id = 'detail-content';
  content.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-category cat-${spot.category}">${spot.category}</div>
        <div class="detail-name">${spot.name || '이름 없음'}</div>
      </div>
      <button class="detail-fav ${isFav ? 'active' : ''}" data-id="${spot.id}">${isFav ? '♥' : '♡'}</button>
    </div>
    <div class="detail-address">${spot.address || '주소 정보 없음'}</div>
    ${distHtml}
    <div class="detail-nav">
      <a href="${naverUrl}" target="_blank" rel="noopener" class="nav-btn naver">네이버 지도</a>
      <a href="${kakaoUrl}" target="_blank" rel="noopener" class="nav-btn kakao">카카오맵</a>
    </div>
  `;
  content.querySelector('.detail-fav').addEventListener('click', e => {
    toggleFavorite(spot.id, e);
    showDetail({ ...spot, _fav: favorites.has(spot.id) });
  });
  panel.appendChild(content);
  panel.classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.add('hidden');
  document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
}

// ── Geolocation ──
function locateMe() {
  map.locate({ setView: true, maxZoom: 14 });
}

function onLocationFound(e) {
  userLocation = { lat: e.latlng.lat, lng: e.latlng.lng };

  if (userMarker) userMarker.remove();
  if (userCircle) userCircle.remove();

  userMarker = L.circleMarker(e.latlng, {
    radius: 7, color: '#fff', weight: 2.5,
    fillColor: '#3b82f6', fillOpacity: 1,
  }).addTo(map);

  userCircle = L.circle(e.latlng, {
    radius: e.accuracy / 2,
    color: '#3b82f6', weight: 1,
    fillColor: '#3b82f6', fillOpacity: 0.08,
  }).addTo(map);

  // 반경 필터 UI 표시
  document.getElementById('radius-row').classList.remove('hidden');

  if (!sortByDistance) toggleSort();
  else refresh();
}

function toggleSort() {
  sortByDistance = !sortByDistance;
  const btn = document.getElementById('btn-sort');
  btn.dataset.active = sortByDistance;
  if (sortByDistance && !userLocation) {
    map.locate({ setView: true, maxZoom: 14 });
    return;
  }
  refresh();
}

// ── Radius filter ──
function setRadius(km) {
  radiusKm = km;
  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.km) === km);
  });
  refresh();
}

// ── Subway stations ──
async function fetchSubwayStations() {
  const bounds = map.getBounds();
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const query = `
    [out:json][timeout:20];
    node["railway"="station"]["subway"="yes"](${bbox})->.s;
    rel["route"="subway"](bn.s);
    out tags members qt;
    .s out tags qt;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();

    const lineMap = {};
    data.elements.forEach(el => {
      if (el.type !== 'relation') return;
      const ref = el.tags?.ref || '';
      const colour = el.tags?.colour || el.tags?.color || '#888';
      (el.members || []).forEach(m => {
        if (m.type !== 'node') return;
        if (!lineMap[m.ref]) lineMap[m.ref] = [];
        lineMap[m.ref].push({ ref, colour });
      });
    });

    subwayMarkers.forEach(m => m.remove());
    subwayMarkers = [];

    data.elements.forEach(el => {
      if (el.type !== 'node') return;
      const name = el.tags?.name || '';
      const lines = lineMap[el.id] || [];
      const colors = lines.map(l => l.colour);
      const lineLabels = [...new Set(lines.map(l => l.ref ? `${l.ref}호선` : ''))].filter(Boolean);

      const tooltipHtml = `
        <span style="font-weight:600">${name}</span>
        ${lineLabels.length ? `<br><span style="font-size:10px;opacity:0.8">${lineLabels.join(' · ')}</span>` : ''}
      `;

      const marker = L.marker([el.lat, el.lon], {
        icon: subwayDotIcon(colors),
        zIndexOffset: -100,
      }).addTo(map);

      if (name) marker.bindTooltip(tooltipHtml, {
        permanent: true, direction: 'top', offset: [0, -8], className: 'subway-tooltip',
      });
      subwayMarkers.push(marker);
    });
  } catch (e) { /* 조용히 실패 */ }
}

function scheduleSubwayFetch() {
  clearTimeout(subwayFetchTimer);
  subwayFetchTimer = setTimeout(() => {
    if (map.getZoom() >= 13) fetchSubwayStations();
    else { subwayMarkers.forEach(m => m.remove()); subwayMarkers = []; }
  }, 600);
}

// ── Init ──
async function init() {
  map = L.map('map').setView([37.5665, 126.978], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
  });
  map.addLayer(clusterGroup);

  const res = await fetch('data/spots.json');
  allSpots = await res.json();
  refresh();

  map.on('moveend', scheduleSubwayFetch);
  scheduleSubwayFetch();
  map.on('locationfound', onLocationFound);

  document.getElementById('btn-locate').addEventListener('click', locateMe);
  document.getElementById('btn-sort').addEventListener('click', toggleSort);

  document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    refresh();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.category;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refresh();
    });
  });

  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.addEventListener('click', () => setRadius(Number(btn.dataset.km)));
  });
}

init();
