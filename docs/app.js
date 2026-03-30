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

let allSpots = [];
let allTricks = [];
let clusterGroup;
let activeFilter = '전체';
let activeView = 'spots';
let searchQuery = '';
let trickDifficultyFilter = '전체';
let trickCategoryFilter = '전체';
let trickSortMode = 'difficulty';
let sortByDistance = false;
let radiusKm = 0;
let userLocation = null;
let userMarker = null;
let userCircle = null;
let favorites = new Set(JSON.parse(localStorage.getItem('tryagain_favorites') || '[]'));
let map;

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
  localStorage.setItem('tryagain_favorites', JSON.stringify([...favorites]));
}

function toggleFavorite(id, e) {
  e.stopPropagation();
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  refresh();
}

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

function getFilteredTricks() {
  let tricks = [...allTricks];

  if (trickDifficultyFilter !== '전체') {
    tricks = tricks.filter(t => t.difficulty === trickDifficultyFilter);
  }

  if (trickCategoryFilter !== '전체') {
    tricks = tricks.filter(t => t.category === trickCategoryFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    tricks = tricks.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  }

  if (trickSortMode === 'difficulty') {
    const order = { '입문': 1, '초급': 2, '중급': 3, '고급': 4 };
    tricks.sort((a, b) => (order[a.difficulty] || 99) - (order[b.difficulty] || 99));
  } else {
    tricks.sort((a, b) => a.name.localeCompare(b.name));
  }

  return tricks;
}

function createMarkerIcon(category, isFav) {
  const color = CATEGORY_COLOR[category] || '#888';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px; height:18px; border-radius:50%;
      background:${color}; border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      ${isFav ? 'outline:2.5px solid #B8922A; outline-offset:2px;' : ''}
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

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

function renderTrickList(tricks) {
  const list = document.getElementById('trick-list');
  const count = document.getElementById('list-count');
  list.innerHTML = '';
  count.textContent = `${tricks.length}개 트릭`;

  tricks.forEach(trick => {
    const li = document.createElement('li');
    li.className = 'trick-item';
    li.dataset.id = trick.id;
    li.innerHTML = `
      <div class="trick-title-row">
        <div class="trick-name">${trick.name}</div>
      </div>
      <div class="trick-badges">
        <span class="trick-badge diff-${trick.difficulty}">${trick.difficulty}</span>
        <span class="trick-badge">${trick.category}</span>
        <span class="trick-badge">risk ${trick.risk_level}</span>
      </div>
      <div class="trick-summary">${trick.summary}</div>
    `;
    li.addEventListener('click', () => selectTrick(trick));
    list.appendChild(li);
  });
}

function renderMarkers(spots) {
  clusterGroup.clearLayers();
  if (activeView !== 'spots') return;

  spots.forEach(spot => {
    if (!spot.lat || !spot.lng) return;
    const marker = L.marker([spot.lat, spot.lng], {
      icon: createMarkerIcon(spot.category, spot._fav),
    }).on('click', () => selectSpot(spot));
    clusterGroup.addLayer(marker);
  });
}

function refresh() {
  const spotList = document.getElementById('spot-list');
  const trickList = document.getElementById('trick-list');

  if (activeView === 'spots') {
    spotList.classList.remove('hidden');
    trickList.classList.add('hidden');
    document.getElementById('controls').classList.remove('hidden');
    document.getElementById('trick-controls').classList.add('hidden');
    const spots = getFilteredSpots();
    renderList(spots);
    renderMarkers(spots);
  } else {
    spotList.classList.add('hidden');
    trickList.classList.remove('hidden');
    document.getElementById('controls').classList.add('hidden');
    document.getElementById('radius-row').classList.add('hidden');
    document.getElementById('trick-controls').classList.remove('hidden');
    renderMarkers([]);
    const tricks = getFilteredTricks();
    renderTrickList(tricks);
  }
}

function selectSpot(spot) {
  document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.spot-item[data-id="${spot.id}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (spot.lat && spot.lng) map.setView([spot.lat, spot.lng], 16);

  const sb = document.getElementById('sidebar');
  const tgl = document.getElementById('btn-list-toggle');
  if (sb.classList.contains('open')) {
    sb.classList.remove('open');
    if (tgl) tgl.textContent = '목록';
  }
  showSpotDetail(spot);
}

function selectTrick(trick) {
  document.querySelectorAll('.trick-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.trick-item[data-id="${trick.id}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  showTrickDetail(trick);
}

function showSpotDetail(spot) {
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  panel.appendChild(closeBtn);

  const images = spot.images?.length ? spot.images : (spot.image ? [spot.image] : []);
  if (images.length) {
    const gallery = document.createElement('div');
    gallery.className = images.length === 1 ? 'detail-gallery single' : 'detail-gallery';
    gallery.innerHTML = images.map(src =>
      `<img src="${src}" loading="lazy" onerror="this.style.display='none'">`
    ).join('');
    panel.appendChild(gallery);
  }

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
    showSpotDetail({ ...spot, _fav: favorites.has(spot.id) });
  });
  panel.appendChild(content);
  panel.classList.remove('hidden');
}

function showTrickDetail(trick) {
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  panel.appendChild(closeBtn);

  const content = document.createElement('div');
  content.id = 'detail-content';
  content.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-category diff-${trick.difficulty}">${trick.difficulty}</div>
        <div class="detail-name">${trick.name}</div>
      </div>
    </div>
    <div class="detail-address">${trick.summary}</div>
    <div class="trick-badges" style="margin-top:12px;">
      <span class="trick-badge">${trick.category}</span>
      <span class="trick-badge">${trick.stance}</span>
      <span class="trick-badge">risk ${trick.risk_level}</span>
    </div>
    <div style="margin-top:16px;">
      <strong>핵심 포인트</strong>
      <ul style="margin-top:8px; padding-left:18px; line-height:1.7; color:#666;">
        ${(trick.key_points || []).map(x => `<li>${x}</li>`).join('')}
      </ul>
    </div>
    <div style="margin-top:16px;">
      <strong>자주 망하는 포인트</strong>
      <ul style="margin-top:8px; padding-left:18px; line-height:1.7; color:#666;">
        ${(trick.common_mistakes || []).map(x => `<li>${x}</li>`).join('')}
      </ul>
    </div>
    <div style="margin-top:16px;">
      <strong>연습 드릴</strong>
      <ol style="margin-top:8px; padding-left:18px; line-height:1.7; color:#666;">
        ${(trick.drills || []).map(x => `<li>${x}</li>`).join('')}
      </ol>
    </div>
    <div style="margin-top:16px;">
      <strong>선행 트릭</strong>
      <div style="margin-top:8px; color:#666;">${(trick.prerequisites || []).length ? trick.prerequisites.join(', ') : '없음'}</div>
    </div>
    ${trick.video ? `<div style="margin-top:16px;">
      <strong>참고 영상</strong>
      <div class="trick-video-wrap">
        <iframe src="https://www.youtube.com/embed/${trick.video.split('v=')[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>` : ''}
  `;
  panel.appendChild(content);
  panel.classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.add('hidden');
  document.querySelectorAll('.spot-item, .trick-item').forEach(el => el.classList.remove('active'));
}

function locateMe() {
  if (activeView !== 'spots') return;
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

function setRadius(km) {
  radiusKm = km;
  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.km) === km);
  });
  refresh();
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  document.getElementById('app').classList.toggle('view-tricks', view === 'tricks');

  const search = document.getElementById('search');
  search.placeholder = view === 'spots' ? '스팟 이름, 주소 검색' : '트릭 이름, 키워드 검색';
  refresh();
}

async function init() {
  map = L.map('map').setView([37.5665, 126.978], 11);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
  });
  map.addLayer(clusterGroup);

  const [spotsRes, tricksRes] = await Promise.all([
    fetch('data/spots.json'),
    fetch('data/tricks.json')
  ]);
  allSpots = await spotsRes.json();
  allTricks = await tricksRes.json();
  refresh();

  map.on('locationfound', onLocationFound);

  document.getElementById('btn-locate').addEventListener('click', locateMe);
  document.getElementById('btn-sort').addEventListener('click', toggleSort);

  const btnListToggle = document.getElementById('btn-list-toggle');
  const sidebar = document.getElementById('sidebar');
  btnListToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    btnListToggle.textContent = sidebar.classList.contains('open') ? '닫기' : '목록';
  });

  document.getElementById('search').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    refresh();
  });

  document.querySelectorAll('#filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.category;
      document.querySelectorAll('#filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refresh();
    });
  });

  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.addEventListener('click', () => setRadius(Number(btn.dataset.km)));
  });

  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('.trick-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      trickDifficultyFilter = btn.dataset.difficulty;
      document.querySelectorAll('.trick-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refresh();
    });
  });

  document.querySelectorAll('.trick-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      trickCategoryFilter = btn.dataset.trickcat;
      document.querySelectorAll('.trick-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refresh();
    });
  });

  document.getElementById('btn-trick-sort').addEventListener('click', () => {
    trickSortMode = trickSortMode === 'difficulty' ? 'name' : 'difficulty';
    const btn = document.getElementById('btn-trick-sort');
    btn.textContent = trickSortMode === 'difficulty' ? '↕ 난이도순' : '↕ 이름순';
    btn.dataset.active = trickSortMode === 'name';
    refresh();
  });
}

init();
