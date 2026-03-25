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

let allSpots = [];
let markers = [];
let subwayMarkers = [];
let activeFilter = '전체';
let map;
let subwayFetchTimer = null;

function createMarkerIcon(category) {
  const color = CATEGORY_COLOR[category] || '#888';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:12px; height:12px; border-radius:50%;
      background:${color}; border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const subwayIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:8px; height:8px; border-radius:50%;
    background:#555; border:1.5px solid #fff;
    box-shadow:0 1px 3px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

async function fetchSubwayStations() {
  const bounds = map.getBounds();
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const query = `[out:json][timeout:10];node["railway"="station"]["subway"="yes"](${bbox});out;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    subwayMarkers.forEach(m => m.remove());
    subwayMarkers = [];

    data.elements.forEach(el => {
      const name = el.tags?.name || '';
      const marker = L.marker([el.lat, el.lon], { icon: subwayIcon, zIndexOffset: -100 })
        .addTo(map);
      if (name) marker.bindTooltip(name, { permanent: false, direction: 'top', offset: [0, -6], className: 'subway-tooltip' });
      subwayMarkers.push(marker);
    });
  } catch (e) {
    // 조용히 실패
  }
}

function scheduleSubwayFetch() {
  clearTimeout(subwayFetchTimer);
  subwayFetchTimer = setTimeout(() => {
    if (map.getZoom() >= 13) fetchSubwayStations();
    else {
      subwayMarkers.forEach(m => m.remove());
      subwayMarkers = [];
    }
  }, 500);
}

function renderList(spots) {
  const list = document.getElementById('spot-list');
  list.innerHTML = '';
  spots.forEach(spot => {
    const li = document.createElement('li');
    li.className = 'spot-item';
    li.dataset.id = spot.id;

    const thumb = spot.image
      ? `<img class="spot-thumb" src="${spot.image}" onerror="this.style.display='none'">`
      : `<div class="spot-thumb-placeholder">${CATEGORY_EMOJI[spot.category] || '📍'}</div>`;

    li.innerHTML = `
      ${thumb}
      <div class="spot-info">
        <div class="spot-name">${spot.name || '이름 없음'}</div>
        <div class="spot-category cat-${spot.category}">${spot.category}</div>
        <div class="spot-address">${spot.address || ''}</div>
      </div>
    `;
    li.addEventListener('click', () => selectSpot(spot));
    list.appendChild(li);
  });
}

function renderMarkers(spots) {
  markers.forEach(m => m.remove());
  markers = [];
  spots.forEach(spot => {
    if (!spot.lat || !spot.lng) return;
    const marker = L.marker([spot.lat, spot.lng], { icon: createMarkerIcon(spot.category) })
      .addTo(map)
      .on('click', () => selectSpot(spot));
    markers.push(marker);
  });
}

function selectSpot(spot) {
  document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.spot-item[data-id="${spot.id}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest' });
  }
  if (spot.lat && spot.lng) map.setView([spot.lat, spot.lng], 15);
  showDetail(spot);
}

function showDetail(spot) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  const img = spot.image ? `<img class="detail-img" src="${spot.image}" onerror="this.parentNode.removeChild(this)">` : '';
  content.innerHTML = `
    ${img}
    <div class="detail-category cat-${spot.category}">${spot.category}</div>
    <div class="detail-name">${spot.name || '이름 없음'}</div>
    <div class="detail-address">${spot.address || '주소 정보 없음'}</div>
  `;
  panel.classList.remove('hidden');
}

function applyFilter(category) {
  activeFilter = category;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  const filtered = category === '전체' ? allSpots : allSpots.filter(s => s.category === category);
  renderList(filtered);
  renderMarkers(filtered);
}

function locateMe() {
  map.locate({ setView: true, maxZoom: 15 });
}

async function init() {
  map = L.map('map').setView([37.5665, 126.978], 12);

  // CartoDB Positron - 깔끔한 배경
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  }).addTo(map);

  // 데이터 로드
  const res = await fetch('data/spots.json');
  allSpots = await res.json();
  renderList(allSpots);
  renderMarkers(allSpots);

  // 지하철역: 지도 이동/줌 시 갱신
  map.on('moveend', scheduleSubwayFetch);
  scheduleSubwayFetch();

  // 필터
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.category));
  });

  // 내 위치 버튼
  document.getElementById('btn-locate').addEventListener('click', locateMe);

  // 상세 패널 닫기
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.add('hidden');
    document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  });
}

init();
