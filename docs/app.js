const CATEGORY_EMOJI = {
  '공공스케이트파크': '🛹',
  '사설스케이트파크': '🏢',
  '스팟': '📍',
  '스케이트샵': '🛒',
  '스케이트보드 강사': '👟',
};

const CATEGORY_COLOR = {
  '공공스케이트파크': '#20B9FC',
  '사설스케이트파크': '#FF8C00',
  '스팟': '#2ECC71',
  '스케이트샵': '#E74C3C',
  '스케이트보드 강사': '#9B59B6',
};

// ── State ──
let allSpots = [];
let clusterGroup;
let subwayMarkers = [];
let activeFilter = '전체';
let searchQuery = '';
let sortByDistance = false;
let userLocation = null;
let userMarker = null;
let userCircle = null;
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

function getFilteredSpots() {
  let spots = allSpots;

  if (activeFilter !== '전체') {
    spots = spots.filter(s => s.category === activeFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    spots = spots.filter(s =>
      s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)
    );
  }
  if (sortByDistance && userLocation) {
    spots = spots
      .map(s => ({ ...s, _dist: calcDistance(userLocation.lat, userLocation.lng, s.lat, s.lng) }))
      .sort((a, b) => a._dist - b._dist);
  }
  return spots;
}

// ── Marker icon ──
function createMarkerIcon(category) {
  const color = CATEGORY_COLOR[category] || '#888';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:13px; height:13px; border-radius:50%;
      background:${color}; border:2.5px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
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

    const distHtml = spot._dist !== undefined
      ? `<span class="spot-distance">${formatDistance(spot._dist)}</span>` : '';

    li.innerHTML = `
      ${thumb}
      <div class="spot-info">
        <div class="spot-name">${spot.name || '이름 없음'}</div>
        <div class="spot-category cat-${spot.category}">${spot.category}</div>
        <div class="spot-address">${spot.address || ''}</div>
      </div>
      ${distHtml}
    `;
    li.addEventListener('click', () => selectSpot(spot));
    list.appendChild(li);
  });
}

// ── Render markers ──
function renderMarkers(spots) {
  clusterGroup.clearLayers();
  spots.forEach(spot => {
    if (!spot.lat || !spot.lng) return;
    const marker = L.marker([spot.lat, spot.lng], { icon: createMarkerIcon(spot.category) })
      .on('click', () => selectSpot(spot));
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
  if (spot.lat && spot.lng) map.setView([spot.lat, spot.lng], 15);
  showDetail(spot);
}

// ── Detail panel ──
function showDetail(spot) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  const images = spot.images?.length ? spot.images : (spot.image ? [spot.image] : []);
  let galleryHtml = '';
  if (images.length) {
    const cls = images.length === 1 ? 'detail-gallery single' : 'detail-gallery';
    galleryHtml = `<div class="${cls}">${images.map(src =>
      `<img src="${src}" loading="lazy" onerror="this.style.display='none'">`
    ).join('')}</div>`;
  }

  const distHtml = userLocation && spot.lat
    ? `<div class="detail-distance">${formatDistance(calcDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng))} 거리</div>`
    : '';

  content.innerHTML = `
    <div class="detail-category cat-${spot.category}">${spot.category}</div>
    <div class="detail-name">${spot.name || '이름 없음'}</div>
    <div class="detail-address">${spot.address || '주소 정보 없음'}</div>
    ${distHtml}
  `;
  panel.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  panel.appendChild(closeBtn);

  if (galleryHtml) {
    const galleryWrapper = document.createElement('div');
    galleryWrapper.innerHTML = galleryHtml;
    panel.appendChild(galleryWrapper.firstElementChild);
  }
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
    radius: 7, color: '#fff', weight: 2,
    fillColor: '#4A90E2', fillOpacity: 1,
  }).addTo(map);

  userCircle = L.circle(e.latlng, {
    radius: e.accuracy / 2,
    color: '#4A90E2', weight: 1,
    fillColor: '#4A90E2', fillOpacity: 0.1,
  }).addTo(map);

  // 위치 확보 후 가까운 순 자동 활성화
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

      if (name) {
        marker.bindTooltip(tooltipHtml, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'subway-tooltip',
        });
      }
      subwayMarkers.push(marker);
    });
  } catch (e) { /* 조용히 실패 */ }
}

function scheduleSubwayFetch() {
  clearTimeout(subwayFetchTimer);
  subwayFetchTimer = setTimeout(() => {
    if (map.getZoom() >= 13) fetchSubwayStations();
    else {
      subwayMarkers.forEach(m => m.remove());
      subwayMarkers = [];
    }
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
}

init();
