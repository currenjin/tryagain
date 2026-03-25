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
let activeFilter = '전체';
let map;

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
  // 리스트 하이라이트
  document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.spot-item[data-id="${spot.id}"]`);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest' });
  }

  // 지도 이동
  if (spot.lat && spot.lng) {
    map.setView([spot.lat, spot.lng], 15);
  }

  // 상세 패널
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

async function init() {
  // 지도 초기화 (서울 중심)
  map = L.map('map').setView([37.5665, 126.978], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  // 데이터 로드
  const res = await fetch('data/spots.json');
  allSpots = await res.json();

  renderList(allSpots);
  renderMarkers(allSpots);

  // 필터 이벤트
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.category));
  });

  // 상세 패널 닫기
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.add('hidden');
    document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
  });
}

init();
