(function () {
  const PRESETS = {
    platin: { name: 'Platin', primary: '#64748b', primaryDark: '#334155', secondary: '#94a3b8' },
    altin: { name: 'Altın', primary: '#b45309', primaryDark: '#92400e', secondary: '#f59e0b' },
    modern: { name: 'Modern', primary: '#2563eb', primaryDark: '#1e40af', secondary: '#f59e0b' },
    professional: { name: 'Professional', primary: '#0f172a', primaryDark: '#334155', secondary: '#0ea5e9' },
    kurumsal: { name: 'Kurumsal', primary: '#1d4ed8', primaryDark: '#1e3a8a', secondary: '#22c55e' },
    ocean: { name: 'Ocean', primary: '#0891b2', primaryDark: '#0e7490', secondary: '#2563eb' },
    forest: { name: 'Forest', primary: '#166534', primaryDark: '#14532d', secondary: '#f59e0b' },
    graphite: { name: 'Graphite', primary: '#111827', primaryDark: '#374151', secondary: '#f97316' },
    royal: { name: 'Royal', primary: '#6d28d9', primaryDark: '#4c1d95', secondary: '#f59e0b' },
    sunrise: { name: 'Sunrise', primary: '#ea580c', primaryDark: '#9a3412', secondary: '#2563eb' },

    bursa_gok_mavisi: { name: "Bursa'nın Gök Mavisi", primary: '#007fff', primaryDark: '#005bb5', secondary: '#eab308' },
    edirne_ali: { name: "Edirne'nın Alı", primary: '#c1121f', primaryDark: '#7f0f14', secondary: '#f4c430' },
    iznik_gokcesi: { name: "İznik'ın Gökçesi", primary: '#1b6ca8', primaryDark: '#124a73', secondary: '#f59e0b' },
    konya_yesili: { name: "Konya'nın Yeşili", primary: '#2e7d32', primaryDark: '#1b5e20', secondary: '#f4c430' },
    kayseri_bakiri: { name: "Kayseri'nın Bakırı", primary: '#b87333', primaryDark: '#7a3e12', secondary: '#0891b2' },
    kapadokya_sarisi: { name: "Kapadokya'nın Sarısı", primary: '#f4c430', primaryDark: '#b45309', secondary: '#2563eb' },
    antalya_deniz_mavisi: { name: "Antalya'nın Deniz Mavisi", primary: '#006994', primaryDark: '#004d70', secondary: '#f97316' },
    erzurum_agi: { name: "Erzurum'un Ağı", primary: '#94a3b8', primaryDark: '#64748b', secondary: '#2563eb' },
    ankara_topragi: { name: "Ankara'nın Toprağı", primary: '#8a3324', primaryDark: '#5a1f15', secondary: '#f4c430' },
    diyarbakir_karasi: { name: "Diyarbakır'ın Karası", primary: '#111827', primaryDark: '#0b1220', secondary: '#22c55e' },
    izmir_moru: { name: "İzmir'ın Moru", primary: '#7c3aed', primaryDark: '#5b21b6', secondary: '#22c55e' },
    van_goycesi: { name: "Van'ın Göyçesi", primary: '#0ea5a5', primaryDark: '#0f766e', secondary: '#f59e0b' },
    sivas_gumusu: { name: "Sivas'ın Gümüşü", primary: '#6b7280', primaryDark: '#374151', secondary: '#60a5fa' },
    trabzon_yesili: { name: "Trabzon'un Yeşili", primary: '#2f855a', primaryDark: '#22543d', secondary: '#38bdf8' },
    canakkale_bozu: { name: "Çanakkale'nın Bozu", primary: '#8b7d6b', primaryDark: '#5f5548', secondary: '#2563eb' }
  };

  function clamp(n, a, b) {
    return Math.min(Math.max(n, a), b);
  }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (![r, g, b].every(v => Number.isFinite(v))) return null;
    return { r, g, b };
  }

  function rgbToHex(rgb) {
    const r = clamp(Math.round(rgb.r), 0, 255).toString(16).padStart(2, '0');
    const g = clamp(Math.round(rgb.g), 0, 255).toString(16).padStart(2, '0');
    const b = clamp(Math.round(rgb.b), 0, 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return hexA;
    return rgbToHex({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    });
  }

  function applyForCustomerLike(presetId, targetDocument) {
    const id = presetId ? String(presetId) : '';
    const preset = PRESETS[id];
    if (!preset) return false;
    const doc = targetDocument || document;
    const root = doc.documentElement;
    root.style.setProperty('--primary', preset.primary);
    root.style.setProperty('--primary-dark', preset.primaryDark);
    root.style.setProperty('--secondary', preset.secondary);
    return true;
  }

  function applyForAdmin(presetId, targetDocument) {
    const id = presetId ? String(presetId) : '';
    const preset = PRESETS[id];
    if (!preset) return false;

    const doc = targetDocument || document;
    const root = doc.documentElement;
    root.style.setProperty('--color-primary', preset.primary);
    root.style.setProperty('--color-primary-dark', preset.primaryDark);

    const primaryLight = mix(preset.primary, '#ffffff', 0.35);
    const primaryBg = mix(preset.primary, '#ffffff', 0.9);

    root.style.setProperty('--color-primary-light', primaryLight);
    root.style.setProperty('--color-primary-bg', primaryBg);
    return true;
  }

  async function fetchPublicSettings() {
    const url = `/api/b2b/public/settings?ts=${Date.now()}`;
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json || !json.success) throw new Error('Settings alınamadı');
    return json.data || {};
  }

  function getPortal() {
    const p = String(window.location.pathname || '').toLowerCase();
    if (p.startsWith('/admin/')) return 'admin';
    if (p.startsWith('/sales/')) return 'sales';
    return 'unknown';
  }

  async function applyPortalTheme() {
    try {
      const portal = getPortal();
      const data = await fetchPublicSettings();

      if (portal === 'admin') {
        const id = (data && data.admin_theme_preset) ? String(data.admin_theme_preset) : 'bursa_gok_mavisi';
        applyForAdmin(PRESETS[id] ? id : 'bursa_gok_mavisi');
      } else if (portal === 'sales') {
        const id = (data && data.sales_theme_preset) ? String(data.sales_theme_preset) : 'bursa_gok_mavisi';
        applyForCustomerLike(PRESETS[id] ? id : 'bursa_gok_mavisi');
      }
    } catch (e) {
      // ignore
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyPortalTheme());
  } else {
    applyPortalTheme();
  }

  try {
    window.PortalTheme = {
      presets: PRESETS,
      applyAdmin: (presetId, targetDocument) => applyForAdmin(presetId, targetDocument),
      applyCustomerLike: (presetId, targetDocument) => applyForCustomerLike(presetId, targetDocument)
    };
  } catch (e) {
    // ignore
  }
})();
