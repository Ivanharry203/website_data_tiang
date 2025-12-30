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
const API_URL = 'https://script.google.com/macros/s/AKfycbzk-DzkizR-iYMFGQITvwOY0fDmGF9C5vcO9-fRh75wxeAOLv1jE_8ZxpvFCt2aF90ksw/exec';

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
  const sp = createEl('span', {class: 'spinner', id: '__spinner__'});
  parent.appendChild(sp);
}
function hideSpinner(){
  const sp = document.getElementById('__spinner__');
  if(sp) sp.remove();
}

function normalizeCoord(lng, lat){
  return `${lng},${lat}`;
}

// parse KML string to array of [lng,lat]
function parseKmlPolygonCoords(kmlText){
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, 'application/xml');
  const parseErr = xml.querySelector('parsererror');
  if(parseErr) throw new Error('File KML tidak bisa diparsing (format tidak valid).');

  const nodes = xml.querySelectorAll('Polygon coordinates, LinearRing coordinates, coordinates, Point coordinates');
  const points = [];
  nodes.forEach(node => {
    const raw = node.textContent.trim();
    const pairs = raw.split(/\s+/).map(s => s.trim()).filter(Boolean);
    pairs.forEach(p => {
      const parts = p.split(',');
      if(parts.length >= 2){
        const lng = Number(parts[0]);
        const lat = Number(parts[1]);
        if(!isNaN(lng) && !isNaN(lat)) points.push([lng, lat]);
      }
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
const btnOpenSheet = $('#btnOpenSheet');
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

btnOpenSheet.addEventListener('click', () => {
  const ssId = '1cmEU2Njd_1q50FVexsljWkkaYdc8fYRDJUOhXbGEeJY';
  btnOpenSheet.setAttribute('href', `https://docs.google.com/spreadsheets/d/${ssId}`);
});

// Upload polygon
btnUpload.addEventListener('click', async () => {
  if (parsedCoords.length === 0) return alert('Tidak ada koordinat.');
  const nama_jalan = namaJalanInput.value.trim();
  if (!nama_jalan) return alert('Nama jalan wajib diisi.');

  btnUpload.disabled = true;

  try {
    // 1️⃣ CEK APAKAH SUDAH ADA
    const cek = await fetch(`${API_URL}?action=check_nama_jalan&nama_jalan=${encodeURIComponent(nama_jalan)}`);
    const cekData = await cek.json();

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
    const resp = await fetch(API_URL, { method: "POST", body: form });
    const data = await resp.json();

    if (!data.success) throw new Error(data.error || "Gagal");

    uploadStatus.textContent = "Upload berhasil";
    uploadStatus.style.color = "green";

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
let namaJalanCache = null;

async function prefetchNamaJalanList(){
  if(namaJalanCache) return namaJalanCache;
  try {
    const resp = await fetch(`${API_URL}?action=list_names`);
    const txt = await resp.text();
    const data = JSON.parse(txt);
    namaJalanCache = data && data.names ? data.names : [];
    return namaJalanCache;
  } catch(e){
    namaJalanCache = [];
    return namaJalanCache;
  }
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

// Proses kecocokan
async function onSelectNamaJalan(nama){
  resultInfo.textContent = 'Memproses';
  showSpinner(resultInfo);

  try {
    const resp = await fetch(`${API_URL}?action=get_polygon&nama_jalan=${encodeURIComponent(nama)}`);
    hideSpinner();
    const txt = await resp.text();
    const data = JSON.parse(txt);

    if(!(data && data.polygon)){
      matchesText.textContent = 'Tidak ada data polygon untuk nama jalan ini.';
      return;
    }

    const polyCoords = data.polygon.trim().split(/\s+/).map(s => {
      const p = s.split(',');
      return [Number(p[0]), Number(p[1])];
    });

    const coordStrings = polyCoords.map(pt => normalizeCoord(pt[0], pt[1]));
    const uniqueCoords = Array.from(new Set(coordStrings));

    showSpinner(matchesText);

    const form = new FormData();
    form.append('action', 'match_coords');
    form.append('coords', JSON.stringify(uniqueCoords.map(s => {
      const [lng, lat] = s.split(',').map(Number);
      return [lng, lat];  
    })));

    const matchResp = await fetch(API_URL, {
      method: 'POST',
      body: form
    });

    hideSpinner();

    const matchTxt = await matchResp.text();
    const matchData = JSON.parse(matchTxt);

    if(!(matchData && Array.isArray(matchData.matches))){
      matchesText.textContent = 'Tidak ada koordinat yang cocok pada data_tiang';
      return;
    }

    if(matchData.matches.length === 0){
      matchesText.textContent = 'Tidak ada koordinat yang cocok pada data_tiang';
      return;
    }

    lastMatchedODP = matchData.matches;  // SIMPAN HASIL
    btnDownloadKml.disabled = false;     // Aktifkan tombol

    const lines = matchData.matches.map((m, idx) => {
      const name = m.name || m.designator || m.telco_pole_tag || '(unknown)';
      const lng = m.longitude ?? m.lng ?? m.long ?? '';
      const lat = m.latitude ?? m.lat ?? '';
      return `${idx+1}. ${name} – ${lng}   ${lat}`;
    });

    matchesText.textContent = lines.join('\n');

  } catch(err){
    hideSpinner();
    resultInfo.textContent = '';
    matchesText.textContent = 'Error: ' + err.message;
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
