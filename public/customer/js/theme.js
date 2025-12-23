(function () {
  const PRESETS = {
    // Backward-compatible ids (older presets)
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

    // City series (requested list)
    bursa_gok_mavisi: { name: "Bursa'nın Gök Mavisi", primary: '#007fff', primaryDark: '#005bb5', secondary: '#eab308' },
    edirne_ali: { name: "Edirne'nın Alı", primary: '#c1121f', primaryDark: '#7f0f14', secondary: '#f4c430' },
    iznik_gokcesi: { name: "İznik'ın Gökçesi", primary: '#1b6ca8', primaryDark: '#124a73', secondary: '#f59e0b' },
    konya_yesili: { name: "Konya'nın Yeşili", primary: '#2e7d32', primaryDark: '#1b5e20', secondary: '#f4c430' },
    rize_ayder_yesili: { name: "Rize'nin Ayder Yeşili", primary: '#1f8f3a', primaryDark: '#0f5f28', secondary: '#a3e635' },
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

  function encodeUserDataToBase64(userData) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(userData))));
    } catch (e) {
      return '';
    }
  }

  function getUser() {
    try {
      const s = localStorage.getItem('b2b_user_data');
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  function getCustomerAuthHeaders() {
    const u = getUser();
    const base64 = localStorage.getItem('b2b_user_data_base64') || (u ? encodeUserDataToBase64(u) : '');
    const h = { 'Content-Type': 'application/json' };
    if (base64) h['x-user-data-base64'] = base64;
    return h;
  }

  function applyPreset(presetId) {
    const id = presetId ? String(presetId) : '';
    const preset = PRESETS[id];
    if (!preset) return false;
    const root = document.documentElement;
    root.style.setProperty('--primary', preset.primary);
    root.style.setProperty('--primary-dark', preset.primaryDark);
    root.style.setProperty('--secondary', preset.secondary);
    return true;
  }

  async function fetchEffectivePresetId() {
    const res = await fetch('/api/b2b/public/settings', {
      method: 'GET',
      headers: getCustomerAuthHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json || !json.success) {
      throw new Error((json && json.error) ? json.error : 'Settings alınamadı');
    }
    const raw = (json.data && json.data.customer_theme_preset) ? String(json.data.customer_theme_preset) : '';
    const id = raw && PRESETS[raw] ? raw : 'bursa_gok_mavisi';
    return id;
  }

  function setFaviconUrl(url) {
    try {
      const href = String(url || '').trim();
      if (!href) {
        const links = Array.from(document.querySelectorAll('link[rel~="icon"]'));
        for (const l of links) {
          try { l.parentNode && l.parentNode.removeChild(l); } catch (e) {}
        }
        return true;
      }

      let link = document.querySelector('link[rel~="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = href;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function applyEffectiveFavicon() {
    try {
      const res = await fetch('/api/b2b/public/settings', {
        method: 'GET',
        headers: getCustomerAuthHeaders()
      });
      const json = await res.json();
      if (!res.ok || !json || !json.success) return null;
      const url = (json.data && json.data.customer_favicon_url) ? String(json.data.customer_favicon_url) : '';
      const ok = setFaviconUrl(url);
      return ok ? url : null;
    } catch (e) {
      return null;
    }
  }

  async function applyEffectiveTitle() {
    try {
      const res = await fetch('/api/b2b/public/settings', {
        method: 'GET',
        headers: getCustomerAuthHeaders()
      });
      const json = await res.json();
      if (!res.ok || !json || !json.success) return null;
      const title = (json.data && json.data.customer_page_title) ? String(json.data.customer_page_title).trim() : '';
      if (title) document.title = title;
      return title || null;
    } catch (e) {
      return null;
    }
  }

  async function applyEffectiveTheme() {
    try {
      const presetId = await fetchEffectivePresetId();
      applyPreset(presetId);
      window.B2BTheme._appliedPresetId = presetId;
      return presetId;
    } catch (e) {
      // ignore
      return null;
    }
  }

  function getPresetList() {
    return Object.keys(PRESETS).map(id => ({ id, name: PRESETS[id]?.name || id }));
  }

  window.B2BTheme = {
    presets: PRESETS,
    getPresetList,
    applyPreset,
    applyEffectiveTheme,
    applyEffectiveFavicon,
    applyEffectiveTitle,
    fetchEffectivePresetId,
    _appliedPresetId: null
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyEffectiveTheme();
      applyEffectiveFavicon();
      applyEffectiveTitle();
    });
  } else {
    applyEffectiveTheme();
    applyEffectiveFavicon();
    applyEffectiveTitle();
  }
})();
