// ================= FIREBASE CDN (WAJIB) =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ================= FIREBASE CONFIG (PUNYAMU) =================
const firebaseConfig = {
  apiKey: "AIzaSyDrbrdbqOBKBbRy5aVSrg-Roa8PvoEVu0c",
  authDomain: "maganguntidar2025.firebaseapp.com",
  projectId: "maganguntidar2025",
  storageBucket: "maganguntidar2025.firebasestorage.app",
  messagingSenderId: "40595922858",
  appId: "1:40595922858:web:c0712708d3c047db7015d3"
};

// ================= INIT FIREBASE =================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ================= FUNGSI UNTUK TAMPILKAN ALERT CUSTOM DI DALAM IFRAME =================
function showCustomAlert(message, type = 'error') {
  console.log('Menampilkan alert di iframe:', message);
  
  // Hapus alert yang sudah ada
  const existingAlert = document.querySelector('.custom-alert');
  if (existingAlert) {
    existingAlert.remove();
  }
  
  // Buat elemen alert
  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert ${type}`;
  
  // Styling alert yang lebih baik
  alertDiv.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 15px 25px;
    border-radius: 10px;
    background-color: ${type === 'error' ? '#ffebee' : '#e8f5e9'};
    color: ${type === 'error' ? '#c62828' : '#2e7d32'};
    border: 2px solid ${type === 'error' ? '#ff5252' : '#4caf50'};
    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    min-width: 300px;
    max-width: 90%;
    animation: alertFadeIn 0.4s ease-out;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Tambahkan icon
  const icon = type === 'error' ? '✗' : '✓';
  alertDiv.innerHTML = `
    <span style="margin-right: 12px; font-size: 18px; font-weight: bold;">${icon}</span>
    <span style="flex: 1;">${message}</span>
  `;
  
  // Tambahkan tombol close
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: ${type === 'error' ? '#c62828' : '#2e7d32'};
    font-size: 24px;
    font-weight: bold;
    cursor: pointer;
    padding: 0;
    margin-left: 15px;
    line-height: 1;
    transition: opacity 0.2s;
  `;
  closeButton.onclick = () => alertDiv.remove();
  closeButton.onmouseover = () => closeButton.style.opacity = '0.7';
  closeButton.onmouseout = () => closeButton.style.opacity = '1';
  
  alertDiv.appendChild(closeButton);
  document.body.appendChild(alertDiv);
  
  // Tambahkan style untuk animasi
  if (!document.querySelector('#alert-styles')) {
    const style = document.createElement('style');
    style.id = 'alert-styles';
    style.textContent = `
      @keyframes alertFadeIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-30px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      @keyframes alertFadeOut {
        from {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        to {
          opacity: 0;
          transform: translateX(-50%) translateY(-30px);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Auto remove setelah 5 detik
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.style.animation = 'alertFadeOut 0.3s ease-out';
      setTimeout(() => {
        if (alertDiv.parentNode) alertDiv.remove();
      }, 300);
    }
  }, 5000);
}

// ================= LOGIN HANDLER =================
document.getElementById("btnLogin").onclick = async () => {
  console.log('Tombol login diklik');
  
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const robotCheckbox = document.getElementById("robotCheckbox");

  console.log('Input values:', { email, passwordLength: password.length, robotChecked: robotCheckbox.checked });

  // Validasi form
  if (!email || !password) {
    console.log('Validasi gagal: email atau password kosong');
    showCustomAlert("Email dan password wajib diisi", 'error');
    return;
  }

  if (!robotCheckbox.checked) {
    console.log('Validasi gagal: robot checkbox tidak dicentang');
    showCustomAlert("Harap centang 'Saya bukan robot'", 'error');
    return;
  }

  // Validasi format email sederhana
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showCustomAlert("Format email tidak valid. Contoh: user@example.com", 'error');
    return;
  }

  try {
    console.log('Memulai proses login Firebase...');
    // 🔐 VALIDASI EMAIL & PASSWORD (INTI LOGIN)
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log('Login berhasil, user:', cred.user.email);

    // 🟡 TOKEN = OPSIONAL (BEST EFFORT)
    try {
      const token = await cred.user.getIdToken(true);
      localStorage.setItem("tiang_token", token);
      console.log('Token berhasil disimpan');
    } catch (e) {
      console.warn("Token gagal diambil, dilewati:", e.message);
      localStorage.setItem("tiang_token", "LOGIN_OK");
    }

    // ✅ Tampilkan alert sukses sebelum redirect
    showCustomAlert("Login berhasil! Mengarahkan ke dashboard...", 'success');
    
    console.log('Akan redirect dalam 1.5 detik...');
    // Tunggu 1.5 detik sebelum redirect
    setTimeout(() => {
      console.log('Melakukan redirect ke mark_peta.html');
      window.location.href = "./index.html";
    }, 1500);

  } catch (err) {
    console.error("AUTH ERROR DETAILS:", {
      code: err.code,
      message: err.message,
      name: err.name
    });
    
    // Custom message berdasarkan error code
    let errorMessage = "Login gagal. Silakan coba lagi.";
    
    switch (err.code) {
      case 'auth/invalid-email':
        errorMessage = "Format email tidak valid. Pastikan email benar.";
        break;
      case 'auth/user-disabled':
        errorMessage = "Akun ini telah dinonaktifkan.";
        break;
      case 'auth/user-not-found':
        errorMessage = "Email tidak ditemukan.";
        break;
      case 'auth/wrong-password':
        errorMessage = "Password salah.";
        break;
      case 'auth/too-many-requests':
        errorMessage = "Terlalu banyak percobaan login. Coba lagi nanti.";
        break;
      case 'auth/network-request-failed':
        errorMessage = "Gagal terhubung ke jaringan. Periksa koneksi internet.";
        break;
      case 'auth/internal-error':
        errorMessage = "Terjadi kesalahan internal. Silakan coba lagi.";
        break;
      default:
        errorMessage = `Login gagal: ${err.message}`;
    }
    
    console.log('Menampilkan alert error:', errorMessage);
    // Tampilkan alert error
    showCustomAlert(errorMessage, 'error');
  }
};

// ================= DEBUFF: Tambahkan event listener untuk testing =================
console.log('Login script loaded successfully');

// Tambahkan juga event listener untuk form submit jika ada
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded in iframe');
  
  // Test langsung untuk memastikan alert bekerja
  // Uncomment untuk testing:
  // setTimeout(() => {
  //   showCustomAlert("Test alert dari iframe", 'error');
  // }, 1000);
  
  // Tambahkan keypress listener untuk Enter key
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnLogin').click();
      }
    });
  }
  
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnLogin').click();
      }
    });
  }
  
  // Tambahkan validasi email real-time
  if (emailInput) {
    emailInput.addEventListener('blur', function() {
      const email = this.value.trim();
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          this.style.borderColor = '#ff5252';
          this.style.backgroundColor = '#fff5f5';
        } else {
          this.style.borderColor = '#4caf50';
          this.style.backgroundColor = '#f5fff5';
        }
      }
    });
  }
});