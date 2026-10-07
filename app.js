/* ═══════════════════════════════════════════════
   Mis Lugares de Comida — app.js
   Stack: Leaflet + OpenStreetMap + localStorage
═══════════════════════════════════════════════ */

'use strict';

// ── Storage helpers ──────────────────────────────
const STORAGE_KEY = 'misLugares_v1';

function loadPlaces() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function savePlaces(places) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── State ────────────────────────────────────────
let places = loadPlaces();          // array of place objects
let markers = {};                   // id → Leaflet marker
let editingId = null;               // null = new, string = editing existing
let pendingLatLng = null;           // where map was clicked before modal opens

// ── Type → emoji map ─────────────────────────────
const TYPE_EMOJI = {
  tacos:     '🌮',
  desayunos: '🍳',
  hamburguesa: '🍔',
  tortas:    '🥪',
  mariscos:  '🦐',
  postres:   '🍰',
  bebidas:   '🧃',
  otro:      '📍',
};

function emojiFor(type) {
  return TYPE_EMOJI[type] || '📍';
}

// ── Build a custom Leaflet DivIcon ────────────────
function buildIcon(type) {
  const emoji = emojiFor(type);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:38px;height:38px;border-radius:50% 50% 50% 0;
      background:#e85d04;transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 8px rgba(0,0,0,.35);border:2px solid #fff;">
      <span style="transform:rotate(45deg);font-size:18px;line-height:1">${emoji}</span>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -40],
  });
}

// ── Map setup ────────────────────────────────────
const map = L.map('map', { zoomControl: false }).setView([19.4326, -99.1332], 13);

L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 20,
}).addTo(map);

// Move zoom control to bottom-left so it doesn't clash with FABs
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ── Popup HTML builder ───────────────────────────
function buildPopupHTML(p) {
  const stars = '★'.repeat(p.rating || 0) + '☆'.repeat(5 - (p.rating || 0));
  const imgTag = p.photo
    ? `<img class="popup-img" src="${p.photo}" alt="foto" />`
    : '';
  const notes = p.notes
    ? `<div class="popup-notes">${escHtml(p.notes)}</div>`
    : '';
  const meta = [p.schedule, p.price].filter(Boolean).map(escHtml).join(' · ');
  return `
    <div class="popup-card">
      ${imgTag}
      <div class="popup-body">
        <div class="popup-name">${escHtml(p.name)}</div>
        <div class="popup-type">${emojiFor(p.type)} ${escHtml(p.type)}</div>
        ${p.rating ? `<div class="popup-stars">${stars}</div>` : ''}
        ${notes}
        ${meta ? `<div class="popup-price-schedule">${meta}</div>` : ''}
        <button class="popup-edit-btn" onclick="openEditModal('${p.id}')">✏️ Editar</button>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Add / refresh a marker on the map ───────────
function renderMarker(p) {
  if (markers[p.id]) {
    map.removeLayer(markers[p.id]);
  }
  const m = L.marker([p.lat, p.lng], { icon: buildIcon(p.type) })
    .addTo(map)
    .bindPopup(buildPopupHTML(p), { maxWidth: 260 });
  markers[p.id] = m;
}

function removeMarker(id) {
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
}

// ── Render all markers (respecting active filters) ─
function renderAllMarkers() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const typeFilter = document.getElementById('filter-type').value;

  places.forEach(p => {
    const matchType  = !typeFilter || p.type === typeFilter;
    const matchQuery = !query
      || p.name.toLowerCase().includes(query)
      || (p.notes || '').toLowerCase().includes(query)
      || p.type.toLowerCase().includes(query);

    if (matchType && matchQuery) {
      renderMarker(p);
    } else if (markers[p.id]) {
      map.removeLayer(markers[p.id]);
      delete markers[p.id];
    }
  });
}

// ── Sidebar list ─────────────────────────────────
function renderSidebar() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const typeFilter = document.getElementById('filter-type').value;

  const filtered = places.filter(p => {
    const matchType  = !typeFilter || p.type === typeFilter;
    const matchQuery = !query
      || p.name.toLowerCase().includes(query)
      || (p.notes || '').toLowerCase().includes(query)
      || p.type.toLowerCase().includes(query);
    return matchType && matchQuery;
  });

  document.getElementById('count').textContent = filtered.length;
  const ul = document.getElementById('places-list');
  ul.innerHTML = '';

  if (filtered.length === 0) {
    ul.innerHTML = '<li style="padding:20px;color:#57606a;text-align:center">Sin resultados</li>';
    return;
  }

  filtered.forEach(p => {
    const stars = '★'.repeat(p.rating || 0) + '☆'.repeat(5 - (p.rating || 0));
    const li = document.createElement('li');
    li.className = 'place-item';
    li.dataset.id = p.id;

    const thumbHTML = p.photo
      ? `<img class="place-thumb" src="${p.photo}" alt="" />`
      : `<div class="place-thumb-icon">${emojiFor(p.type)}</div>`;

    li.innerHTML = `
      ${thumbHTML}
      <div class="place-info">
        <div class="place-name">${escHtml(p.name)}</div>
        <div class="place-meta">${emojiFor(p.type)} ${escHtml(p.type)}
          ${p.price ? ' · ' + escHtml(p.price) : ''}</div>
        <div class="place-stars">${stars}</div>
      </div>`;

    li.addEventListener('click', () => {
      const m = markers[p.id];
      if (m) {
        map.setView([p.lat, p.lng], 17);
        m.openPopup();
      }
      closeSidebar();
    });

    ul.appendChild(li);
  });
}

// ── Modal helpers ─────────────────────────────────
const overlay = document.getElementById('modal-overlay');
const form    = document.getElementById('place-form');

function openAddModal(latlng) {
  editingId = null;
  pendingLatLng = latlng;
  resetForm();
  document.getElementById('modal-title').textContent = 'Nuevo lugar';
  document.getElementById('btn-delete').classList.add('hidden');
  overlay.classList.remove('hidden');
}

window.openEditModal = function(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  pendingLatLng = null;

  document.getElementById('modal-title').textContent = 'Editar lugar';
  document.getElementById('f-id').value       = p.id;
  document.getElementById('f-lat').value      = p.lat;
  document.getElementById('f-lng').value      = p.lng;
  document.getElementById('f-name').value     = p.name;
  document.getElementById('f-type').value     = p.type;
  document.getElementById('f-notes').value    = p.notes || '';
  document.getElementById('f-rating').value   = p.rating || 0;
  document.getElementById('f-schedule').value = p.schedule || '';
  document.getElementById('f-price').value    = p.price || '';
  updateStarUI(p.rating || 0);

  const preview = document.getElementById('f-photo-preview');
  if (p.photo) {
    preview.src = p.photo;
    preview.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
  }

  document.getElementById('btn-delete').classList.remove('hidden');
  overlay.classList.remove('hidden');
};

function closeModal() {
  overlay.classList.add('hidden');
  editingId = null;
  pendingLatLng = null;
}

function resetForm() {
  form.reset();
  document.getElementById('f-id').value = '';
  document.getElementById('f-lat').value = '';
  document.getElementById('f-lng').value = '';
  document.getElementById('f-rating').value = '0';
  updateStarUI(0);
  const preview = document.getElementById('f-photo-preview');
  preview.src = '';
  preview.classList.add('hidden');
}

// ── Star rating UI ────────────────────────────────
function updateStarUI(value) {
  document.querySelectorAll('#stars-row .star').forEach(s => {
    const v = parseInt(s.dataset.v, 10);
    s.classList.toggle('active', v <= value);
  });
}

document.querySelectorAll('#stars-row .star').forEach(star => {
  star.addEventListener('click', () => {
    const v = parseInt(star.dataset.v, 10);
    document.getElementById('f-rating').value = v;
    updateStarUI(v);
  });
  star.addEventListener('mouseenter', () => {
    const v = parseInt(star.dataset.v, 10);
    document.querySelectorAll('#stars-row .star').forEach(s => {
      s.classList.toggle('hover', parseInt(s.dataset.v, 10) <= v);
    });
  });
  star.addEventListener('mouseleave', () => {
    document.querySelectorAll('#stars-row .star').forEach(s => s.classList.remove('hover'));
  });
});

// ── Photo file input ──────────────────────────────
document.getElementById('f-photo').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('f-photo-preview');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

// ── Form submit ───────────────────────────────────
form.addEventListener('submit', e => {
  e.preventDefault();

  const lat = editingId
    ? parseFloat(document.getElementById('f-lat').value)
    : pendingLatLng.lat;
  const lng = editingId
    ? parseFloat(document.getElementById('f-lng').value)
    : pendingLatLng.lng;

  const photoInput = document.getElementById('f-photo');
  const previewSrc = document.getElementById('f-photo-preview').src;

  // Resolve photo: new file takes precedence, otherwise keep existing preview
  function saveWithPhoto(photoData) {
    const place = {
      id:       editingId || genId(),
      lat, lng,
      name:     document.getElementById('f-name').value.trim(),
      type:     document.getElementById('f-type').value,
      notes:    document.getElementById('f-notes').value.trim(),
      rating:   parseInt(document.getElementById('f-rating').value, 10) || 0,
      schedule: document.getElementById('f-schedule').value.trim(),
      price:    document.getElementById('f-price').value.trim(),
      photo:    photoData || '',
      createdAt: editingId
        ? (places.find(x => x.id === editingId) || {}).createdAt || Date.now()
        : Date.now(),
    };

    if (editingId) {
      const idx = places.findIndex(x => x.id === editingId);
      if (idx !== -1) places[idx] = place;
    } else {
      places.push(place);
    }

    savePlaces(places);
    renderMarker(place);
    renderAllMarkers();
    renderSidebar();
    closeModal();

    // Open popup on the new/updated marker
    setTimeout(() => {
      if (markers[place.id]) markers[place.id].openPopup();
    }, 100);
  }

  if (photoInput.files[0]) {
    const reader = new FileReader();
    reader.onload = ev => saveWithPhoto(ev.target.result);
    reader.readAsDataURL(photoInput.files[0]);
  } else {
    // Keep existing photo if the preview still has a data: URI
    const existing = previewSrc && previewSrc.startsWith('data:') ? previewSrc : '';
    saveWithPhoto(existing);
  }
});

// ── Delete ────────────────────────────────────────
document.getElementById('btn-delete').addEventListener('click', () => {
  if (!editingId) return;
  if (!confirm('¿Eliminar este lugar?')) return;
  places = places.filter(x => x.id !== editingId);
  savePlaces(places);
  removeMarker(editingId);
  renderSidebar();
  closeModal();
});

// ── Cancel ────────────────────────────────────────
document.getElementById('btn-cancel').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// ── Sidebar toggle ────────────────────────────────
function openSidebar() {
  renderSidebar();
  document.getElementById('sidebar').classList.remove('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.add('hidden');
}

document.getElementById('btn-list').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('hidden')) openSidebar();
  else closeSidebar();
});

document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);

// ── Geolocation button ────────────────────────────
document.getElementById('btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([latlng.lat, latlng.lng], 17);
      openAddModal(latlng);
    },
    () => alert('No se pudo obtener tu ubicación. Asegúrate de dar permiso.'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ── Map click → open add modal ────────────────────
map.on('click', e => {
  // Don't open if clicking on a marker/popup
  openAddModal(e.latlng);
});

// ── Search & filter ───────────────────────────────
document.getElementById('search-input').addEventListener('input', () => {
  renderAllMarkers();
  if (!document.getElementById('sidebar').classList.contains('hidden')) {
    renderSidebar();
  }
});

document.getElementById('filter-type').addEventListener('change', () => {
  renderAllMarkers();
  if (!document.getElementById('sidebar').classList.contains('hidden')) {
    renderSidebar();
  }
});

// ── Service worker registration ───────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // SW not critical, silently fail in file:// protocol
    });
  });
}

// ── Boot: render existing saved places ───────────
renderAllMarkers();

// Try to center on user's location on first load
if (places.length === 0 && navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
    () => {} // keep default center (CDMX) on failure
  );
}
