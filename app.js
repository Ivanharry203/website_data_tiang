// ------------------ LOGIN CHECK ------------------
let firebaseToken = null;

(async function checkLogin() {
  try {
    firebaseToken = localStorage.getItem("tiang_token");

    // Jika belum login → lempar ke login.html
    if (!firebaseToken) {
      window.location.replace("./login.html");
      return;
    }
  } catch (err) {
    console.warn("Token check dilewati:", err.message);
    // Jika error, tetap lanjut (tidak memblokir)
  }
})();


// app.js (module) - Final + Fitur Download KML
const API_URL = 'https://script.google.com/macros/s/AKfycbzh0meD8dTGpGnAM11aeRPzUezVVXv2jvxHjPAUu1jNk5g0nfUTOu8BWbZqMyGaKIzPAA/exec';

// ----- Helper utilities 
const $ = (sel, root = document) => root.querySelector(sel);
const createEl = (tag, attrs = {}) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => { 
    if(k === 'text') el.textContent = v; 
    else el.setAttribute(k, v); 
  });
  return el;
};

let lastMatchedODP = [];

function debounce(fn, wait=300){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function showSpinner(parent){
  const sp = createEl('span', {class: 'spinner'});
  parent.appendChild(sp);
  return sp;
}
// Timer progres: pengguna melihat proses masih berjalan (bukan macet),
// sekaligus tidak menampilkan "Memproses" tanpa batas waktu.
function startProgress(el, label = 'Memproses'){
  const startedAt = Date.now();
  let current = label;

  const render = () => {
    const secs = Math.round((Date.now() - startedAt) / 1000);
    el.textContent = `${current}… ${secs} detik`;
    showSpinner(el);
  };

  render();
  const timer = setInterval(render, 1000);

  return {
    setLabel(next){ current = next; render(); },
    elapsed(){ return Math.round((Date.now() - startedAt) / 1000); },
    stop(text = ''){ clearInterval(timer); el.textContent = text; }
  };
}

function normalizeCoord(lng, lat){
  return `${lng},${lat}`;
}

// Semua panggilan API lewat sini supaya error dari Apps Script (HTML/404)
// tidak muncul sebagai "Unexpected token '<'" yang membingungkan.
async function apiJson(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Server tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik. Silakan coba lagi.`);
    }
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.');
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();

  if (resp.status === 404 || /Halaman Tidak Ditemukan|Page Not Found/i.test(text)) {
    throw new Error('URL server API tidak ditemukan (404). Deployment Apps Script mungkin sudah dihapus/berubah. Hubungi admin untuk memperbarui URL API.');
  }

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Respons server tidak valid (HTTP ${resp.status}). Pastikan deployment Apps Script aktif dan aksesnya "Anyone".`);
  }

  if (!resp.ok) throw new Error(data.error || `Server error (HTTP ${resp.status}).`);
  return data;
}

// parse KML string to array of [lng,lat]
function parseKmlPolygonCoords(kmlText){
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'application/xml');
  const parseErr = xml.getElementsByTagName('parsererror')[0];
  if(parseErr) throw new Error('File KML tidak bisa diparsing (format tidak valid).');

  // Hanya ambil koordinat batas polygon. File KML biasanya juga berisi
  // ratusan Point/LineString milik tiang; jika ikut diambil, data_koordinat
  // bisa melebihi batas 50.000 karakter per sel Google Sheets.
  const nodes = xml.querySelectorAll('Polygon coordinates, LinearRing coordinates');
  if(nodes.length === 0){
    throw new Error('Tidak ditemukan koordinat Polygon dalam file KML. Pastikan file berisi area/polygon, bukan hanya titik (Point).');
  }

  const points = [];
  nodes.forEach(node => {
    const raw = node.textContent.trim();
    if(!raw) return;
    raw.split(/\s+/).forEach(pair => {
      const parts = pair.split(',');
      const lngRaw = (parts[0] || '').trim();
      const latRaw = (parts[1] || '').trim();
      if(!lngRaw || !latRaw) return;
      const lng = Number(lngRaw);
      const lat = Number(latRaw);
      if(Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
    });
  });

  if(points.length === 0) throw new Error('Tidak ditemukan koordinat Polygon dalam file KML.');
  return points;
}

// ----- DOM refs -----
const navButtons = document.querySelectorAll('.nav-btn');
const cardUpload = $('#card-upload');
const cardView = $('#card-view');

const kmlInput = $('#kmlInput');
const namaJalanInput = $('#namaJalan');
const btnUpload = $('#btnUpload');
const coordsText = $('#coordsText');
const uploadStatus = $('#uploadStatus');

const searchInput = $('#searchInput');
const suggestionsEl = $('#suggestions');
const resultInfo = $('#resultInfo');
const matchesText = $('#matchesText');

const btnDownloadKml = $('#btnDownloadKml'); // Tombol baru untuk download KML

let parsedCoords = [];
let polygonFileName = '';

// ---- Navigation ----
navButtons.forEach(btn => btn.addEventListener('click', (e) => {
  const target = e.currentTarget.dataset.target;
  document.querySelectorAll('.card').forEach(c => c.classList.add('hidden'));
  if(target === 'upload') cardUpload.classList.remove('hidden');
  if(target === 'view') {
    cardView.classList.remove('hidden');
    prefetchNamaJalanList();
  }
}));

document.querySelector('[data-target="upload"]').click();

// ---- Upload flow ----
kmlInput.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if(!f) return;
  polygonFileName = f.name;
  if(!/\.kml$/i.test(f.name)) {
    coordsText.textContent = 'Tipe file bukan KML. Silakan pilih file .kml';
    btnUpload.disabled = true;
    return;
  }
  try {
    const text = await f.text();
    parsedCoords = parseKmlPolygonCoords(text);
    const lines = parsedCoords.map(pt => `${pt[0]} , ${pt[1]}`);
    coordsText.textContent = lines.join('\n');
    btnUpload.disabled = false;
  } catch(err){
    parsedCoords = [];
    coordsText.textContent = `Error: ${err.message}`;
    btnUpload.disabled = true;
  }
});

// Upload polygon
btnUpload.addEventListener('click', async () => {
  if (parsedCoords.length === 0) return alert('Tidak ada koordinat.');
  const nama_jalan = namaJalanInput.value.trim();
  if (!nama_jalan) return alert('Nama jalan wajib diisi.');

  btnUpload.disabled = true;
  uploadStatus.style.display = "block";
  uploadStatus.style.color = "";
  uploadStatus.textContent = "";

  try {
    // 1️⃣ CEK APAKAH SUDAH ADA
    const cekData = await apiJson(`${API_URL}?action=check_nama_jalan&nama_jalan=${encodeURIComponent(nama_jalan)}`);

    let action = "upload_polygon";

    // 2️⃣ JIKA ADA → KONFIRMASI
    if (cekData.exists) {
      const ok = confirm("Apakah ingin menghapus data lama?");
      if (!ok) {
        btnUpload.disabled = false;
        return;
      }
      action = "replace_polygon";
    }

    // 3️⃣ KIRIM DATA
    const form = new FormData();
    form.append("action", action);
    form.append("nama_file", polygonFileName);
    form.append("nama_jalan", nama_jalan);
    form.append(
      "data_koordinat",
      parsedCoords.map(p => `${p[0]},${p[1]}`).join(" ")
    );

    uploadStatus.textContent = "Mengirim...";
    const data = await apiJson(API_URL, { method: "POST", body: form });

    if (!data.success) throw new Error(data.error || "Gagal");

    uploadStatus.textContent = "Upload berhasil";
    uploadStatus.style.color = "green";

    // Data spreadsheet berubah → cache tab Lihat Data tidak valid lagi.
    namaJalanCache = null;
    polygonCache.clear();
    matchCache.clear();

    // RESET
    namaJalanInput.value = "";
    kmlInput.value = "";
    coordsText.textContent = "Belum ada file.";
    parsedCoords = [];

  } catch (err) {
    uploadStatus.textContent = "Error: " + err.message;
    uploadStatus.style.color = "red";
  } finally {
    btnUpload.disabled = false;
  }
});

// ---- View flow ----
const LIST_TIMEOUT_MS = 30000;
const POLYGON_TIMEOUT_MS = 60000;
const MATCH_TIMEOUT_MS = 90000;

let namaJalanCache = null;
let namaJalanPromise = null;
const polygonCache = new Map();
const matchCache = new Map();

async function prefetchNamaJalanList(){
  if(namaJalanCache) return namaJalanCache;
  if(namaJalanPromise) return namaJalanPromise;

  namaJalanPromise = (async () => {
    try {
      const data = await apiJson(`${API_URL}?action=list_names`, undefined, LIST_TIMEOUT_MS);
      namaJalanCache = data && data.names ? data.names : [];
      return namaJalanCache;
    } catch(e){
      return []; // jangan simpan kegagalan, biar dicoba lagi saat mengetik berikutnya
    } finally {
      namaJalanPromise = null;
    }
  })();

  return namaJalanPromise;
}

function showSuggestions(list){
  suggestionsEl.innerHTML = '';
  if(!list.length){
    suggestionsEl.classList.add('hidden');
    return;
  }
  list.forEach(s => {
    const item = createEl('div', {class: 'suggestion-item'});
    item.textContent = s;
    item.addEventListener('click', () => {
      searchInput.value = s;
      suggestionsEl.classList.add('hidden');
      onSelectNamaJalan(s);
    });
    suggestionsEl.appendChild(item);
  });
  suggestionsEl.classList.remove('hidden');
}

const onType = debounce(async (val) => {
  if(!val) { suggestionsEl.classList.add('hidden'); return; }

  // Daftar nama jalan butuh beberapa detik di server; beri tahu pengguna
  // supaya kotak saran tidak terlihat kosong/macet.
  if(!namaJalanCache){
    suggestionsEl.innerHTML = '<div class="suggestion-item">Memuat daftar nama jalan…</div>';
    suggestionsEl.classList.remove('hidden');
  }

  const names = await prefetchNamaJalanList();
  const lowered = val.toLowerCase();
  const matches = names.filter(n => n.toLowerCase().includes(lowered)).slice(0, 40);
  if(matches.length === 0){
    suggestionsEl.innerHTML = '<div class="suggestion-item">Data tidak ditemukan</div>';
    suggestionsEl.classList.remove('hidden');
  } else {
    showSuggestions(matches);
  }
}, 250);

searchInput.addEventListener('input', (e) => {
  onType(e.target.value.trim());
});

function renderMatches(matches){
  lastMatchedODP = matches;
  btnDownloadKml.disabled = matches.length === 0;

  if(matches.length === 0){
    matchesText.textContent = 'Tidak ada koordinat yang cocok pada data_tiang';
    return;
  }

  const lines = matches.map((m, idx) => {
    const name = m.name || m.designator || m.telco_pole_tag || '(unknown)';
    const lng = m.longitude ?? m.lng ?? m.long ?? '';
    const lat = m.latitude ?? m.lat ?? '';
    return `${idx+1}. ${name} – ${lng}   ${lat}`;
  });

  matchesText.textContent = lines.join('\n');
}

// Proses kecocokan
let viewRequestSeq = 0;
let activeProgress = null;

async function onSelectNamaJalan(nama){
  // Abaikan hasil dari pencarian sebelumnya; hanya pencarian terakhir yang ditampilkan.
  const seq = ++viewRequestSeq;
  const isLatest = () => seq === viewRequestSeq;

  if(activeProgress){ activeProgress.stop(); activeProgress = null; }

  lastMatchedODP = [];
  btnDownloadKml.disabled = true;
  matchesText.textContent = '';

  // Hasil untuk nama ini sudah pernah diambil → tampilkan langsung.
  if(matchCache.has(nama)){
    renderMatches(matchCache.get(nama));
    resultInfo.textContent = `Hasil "${nama}" dimuat dari cache.`;
    return;
  }

  const polygon = polygonCache.get(nama) || '';
  const progress = startProgress(
    resultInfo,
    polygon ? 'Menyiapkan polygon (cache)' : 'Mengambil data polygon'
  );
  activeProgress = progress;

  try {
    let polygonData = polygon;

    if(!polygonData){
      const data = await apiJson(
        `${API_URL}?action=get_polygon&nama_jalan=${encodeURIComponent(nama)}`,
        undefined,
        POLYGON_TIMEOUT_MS
      );
      if(!isLatest()) return;
      polygonData = data && data.polygon ? String(data.polygon) : '';
      if(polygonData) polygonCache.set(nama, polygonData);
    }

    if(!polygonData){
      progress.stop();
      if(activeProgress === progress) activeProgress = null;
      matchesText.textContent = 'Tidak ada data polygon untuk nama jalan ini.';
      return;
    }

    // Terima format "lng,lat" maupun "lng, lat"
    const coordPattern = /-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g;
    const polyCoords = (polygonData.match(coordPattern) || [])
      .map(s => s.split(',').map(Number));

    if(polyCoords.length === 0){
      progress.stop();
      if(activeProgress === progress) activeProgress = null;
      matchesText.textContent = 'Data polygon tidak valid (koordinat tidak terbaca).';
      return;
    }

    const uniqueCoords = Array.from(new Set(polyCoords.map(pt => normalizeCoord(pt[0], pt[1]))));

    progress.setLabel(`Mencocokkan ${uniqueCoords.length} titik dengan data tiang`);

    const form = new FormData();
    form.append('action', 'match_coords');
    form.append('coords', JSON.stringify(uniqueCoords.map(s => {
      const [lng, lat] = s.split(',').map(Number);
      return [lng, lat];
    })));

    const matchData = await apiJson(
      API_URL,
      { method: 'POST', body: form },
      MATCH_TIMEOUT_MS
    );
    if(!isLatest()) return;

    const matches = Array.isArray(matchData && matchData.matches) ? matchData.matches : [];
    matchCache.set(nama, matches);

    const seconds = progress.elapsed();
    progress.stop(`Selesai dalam ${seconds} detik.`);
    if(activeProgress === progress) activeProgress = null;

    renderMatches(matches);

  } catch(err){
    if(!isLatest()) return;

    progress.stop(`Gagal: ${err.message}`);
    if(activeProgress === progress) activeProgress = null;

    if(!matchesText.textContent){
      matchesText.textContent = 'Proses gagal. Periksa pesan di atas lalu coba lagi.';
    }
  }
}

searchInput.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter'){
    ev.preventDefault();
    const val = searchInput.value.trim();
    if(val) onSelectNamaJalan(val);
  }
});


// ------------------------------------------------------
// --------------- FITUR DOWNLOAD KML -------------------
// ------------------------------------------------------

function generateKmlFromMatches(matches) {

  const header = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Hasil Pemetaan ODP</name>
    <description>File KML hasil pencarian polygon</description>
  `;

  const footer = `
  </Document>
  </kml>`;

  const placemarks = matches.map(m => {

    const nama = m.name || m.designator || m.telco_pole_tag || '(unknown)';
    const lng = m.longitude ?? m.lng ?? m.long;
    const lat = m.latitude ?? m.lat;

    const desa = m.desa || 'Desa Belum Tersedia';
    const kec  = m.kecamatan || 'Kecamatan Belum Tersedia';
    const kab  = m.kabupaten || 'Kabupaten Belum Tersedia';

    return `
    <Placemark>
      <name>${nama}</name>
      <description><![CDATA[
        Nama ODP: ${nama}<br/>
        Desa: ${desa}<br/>
        Kecamatan: ${kec}<br/>
        Kabupaten: ${kab}
      ]]></description>
      <Point>
        <coordinates>${lng},${lat}</coordinates>
      </Point>
    </Placemark>
    `;
  }).join('\n');

  return header + placemarks + footer;
}

btnDownloadKml.addEventListener('click', () => {

  if(!lastMatchedODP.length){
    alert('Tidak ada data ODP untuk dibuat KML.');
    return;
  }

  const kmlContent = generateKmlFromMatches(lastMatchedODP);

  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;

  const jalan = searchInput.value.trim() || 'hasil_polygon';
  const safeName = jalan.replace(/\s+/g, '_');

  link.download = `${safeName}.kml`;
  link.click();

  URL.revokeObjectURL(url);
});
