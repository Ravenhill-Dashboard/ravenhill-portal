/**
 * Application State & Data Management (Firebase/Firestore)
 */
const ALL_STATUSES = ['Created', 'Collected', 'At Facility', 'In Transit', 'Delivered'];

const AppState = {
  theme: localStorage.getItem('theme') || 'light',
  currentRoute: 'dashboard',
  currentUser: null,

  // Core data structure (now synced with Firestore)
  inspections: [],
  transports: [],

  // Dashboard column visibility — persisted locally
  dashboardColumns: JSON.parse(localStorage.getItem('dashboardColumns')) || [...ALL_STATUSES],

  savePreferences() {
    localStorage.setItem('theme', this.theme);
    localStorage.setItem('dashboardColumns', JSON.stringify(this.dashboardColumns));
  },

  async addInspection(data) {
    const timestamp = new Date().toISOString();
    const id = 'RT-' + Math.floor(10000 + Math.random() * 90000);
    const newInspection = {
      id: id,
      status: 'Created',
      createdAt: timestamp,
      history: [{ status: 'Created', timestamp: timestamp }],
      ...data
    };

    await db.collection('inspections').doc(id).set(newInspection);
    return newInspection;
  },

  async updateInspectionStatus(id, newStatus, transportReg = null) {
    const docRef = db.collection('inspections').doc(id);
    const doc = await docRef.get();

    if (doc.exists) {
      const inspection = doc.data();
      const timestamp = new Date().toISOString();
      const updateData = {
        status: newStatus,
        updatedAt: timestamp,
        statusChangedAt: timestamp
      };

      if (transportReg) {
        updateData.assignedTransport = transportReg;
      }

      if (!inspection.history) {
        inspection.history = [{ status: 'Created', timestamp: inspection.createdAt }];
      }

      let historyText = newStatus;
      if (newStatus === 'In Transit' && transportReg) {
        historyText += ` (Truck: ${transportReg})`;
      }

      // We use arrayUnion for firestore but since we hold local state and overwrite on set, 
      // let's just push to the local copy and update the whole array for simplicity in this MVP
      const newHistory = [...(inspection.history || [])];
      newHistory.push({ status: historyText, timestamp: timestamp });
      updateData.history = newHistory;

      await docRef.update(updateData);
    }
  },

  getRecentInspections() {
    // Filter for last 48 hours only if Delivered
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.inspections.filter(i => {
      if (i.status !== 'Delivered') return true;
      return new Date(i.createdAt) > fortyEightHoursAgo;
    });
  },

  async addTransport(data) {
    const id = 'TRK-' + Math.floor(1000 + Math.random() * 9000);
    const newTransport = {
      id: id,
      createdAt: new Date().toISOString(),
      ...data
    };
    await db.collection('transports').doc(id).set(newTransport);
    return newTransport;
  },

  async removeTransport(id) {
    await db.collection('transports').doc(id).delete();
  }
};

/**
 * DOM Elements & Initialization
 */
const elements = {
  themeToggle: document.querySelector('.theme-toggle'),
  navLinks: document.querySelectorAll('.nav-link'),
  contentArea: document.getElementById('content-area'),
  pageTitle: document.getElementById('page-title'),
  loginForm: document.getElementById('login-form'),
  loginOverlay: document.getElementById('login-overlay'),
  loginError: document.getElementById('login-error'),
  userNameDisplay: document.querySelector('.user-profile .name'),
  userRoleDisplay: document.querySelector('.user-profile .role'),
  userAvatar: document.querySelector('.user-profile .avatar')
};

function init() {
  // 1. Auth State Listener
  auth.onAuthStateChanged(user => {
    if (user) {
      AppState.currentUser = user;
      document.body.setAttribute('data-auth', 'visible');
      elements.userNameDisplay.textContent = user.email.split('@')[0].replace('.', ' ').toUpperCase();
      elements.userRoleDisplay.textContent = 'Authorized Staff';
      elements.userAvatar.textContent = user.email.substring(0, 2).toUpperCase();

      // Start Real-time Listeners
      startRealTimeSync();

      // Navigate to dashboard if on initial load
      if (AppState.currentRoute === 'dashboard') {
        renderView('dashboard');
      }
    } else {
      AppState.currentUser = null;
      document.body.setAttribute('data-auth', 'hidden');
      stopRealTimeSync();
    }
  });

  // 2. Login Form Listener
  if (elements.loginForm) {
    elements.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      elements.loginError.style.display = 'none';

      try {
        await auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
        elements.loginError.textContent = error.message;
        elements.loginError.style.display = 'block';
      }
    });
  }

  // 3. Theme setup
  if (AppState.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    elements.themeToggle.innerHTML = '<i class="ph ph-sun"></i>';
  }

  // Event Listeners
  elements.themeToggle.addEventListener('click', toggleTheme);

  elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = e.currentTarget.dataset.route;
      navigate(route);
    });
  });

  // Initial render
  renderView('dashboard');

  // Restore filter button active state if not all columns are selected
  const filterBtn = document.getElementById('column-filter-btn');
  if (filterBtn && AppState.dashboardColumns.length < ALL_STATUSES.length) {
    filterBtn.style.background = 'var(--accent-primary)';
    filterBtn.style.color = '#fff';
  }

  // Seed some mock data if empty for demo purposes
  if (AppState.inspections.length === 0) {
    seedMockData();
  }
}

function toggleTheme() {
  AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', AppState.theme);
  elements.themeToggle.innerHTML = AppState.theme === 'light' ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
  AppState.savePreferences();
}

/**
 * Routing & View Rendering
 */
function navigate(route, params = null) {
  AppState.currentRoute = route;

  // Update active nav state and document route
  document.documentElement.setAttribute('data-route', route);
  elements.navLinks.forEach(link => {
    if (link.dataset.route === route) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  renderView(route, params);
}

function renderView(route, params = null) {
  if (route === 'dashboard') {
    elements.pageTitle.textContent = 'Active Dashboard';
    elements.contentArea.innerHTML = generateDashboardHTML();
  } else if (route === 'create') {
    elements.pageTitle.textContent = 'New Record';
    elements.contentArea.innerHTML = generateCreateFormHTML();
    setupFormListeners();
    if (window.toggleAssetTypeFields) window.toggleAssetTypeFields();
    if (window.initAddressAutocomplete) window.initAddressAutocomplete();
  } else if (route === 'edit') {
    elements.pageTitle.textContent = 'Edit Record';
    elements.contentArea.innerHTML = generateEditFormHTML(params.id);
    setupEditFormListeners(params.id);
    if (window.toggleAssetTypeFields) window.toggleAssetTypeFields();
    if (window.initAddressAutocomplete) window.initAddressAutocomplete();
  } else if (route === 'search') {
    elements.pageTitle.textContent = 'Database Search';
    elements.contentArea.innerHTML = generateSearchHTML();
    setupSearchListeners();
  } else if (route === 'transports') {
    elements.pageTitle.textContent = 'Manage Transport';
    elements.contentArea.innerHTML = generateTransportsHTML();
    setupTransportListeners();
  } else if (route === 'item-detail') {
    elements.pageTitle.textContent = 'Inspection Details Report';
    elements.contentArea.innerHTML = generateItemDetailHTML(params.id);
  } else if (route === 'delivery-report') {
    elements.pageTitle.textContent = 'Delivery Report';
    elements.contentArea.innerHTML = generateDeliveryReportHTML(params.id);
  } else if (route === 'status-list') {
    const status = params && params.status ? params.status : 'Created';
    elements.pageTitle.textContent = status === 'Delivered' ? 'Delivered (Last 24hrs)' : status;
    elements.contentArea.innerHTML = generateStatusListHTML(status);
  }
}

/**
 * Utility Functions
 */
function timeAgo(dateString) {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);

  if (seconds < 60) return `${seconds} Secs`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Mins`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hrs`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} Days`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} Wks`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} Mths`;
  const years = Math.floor(days / 365);
  return `${years} Yrs`;
}

// The 9 mandatory photo slot labels (index matches photo_N key)
const REQUIRED_PHOTO_LABELS = [
  'Chassis Number / VIN',
  'Front Passenger Side Corner',
  'Front',
  'Front Driver Side Corner',
  'Driver Side',
  'Rear Driver Side Corner',
  'Rear',
  'Rear Passenger Side Corner',
  'Passenger Side',
];

function getMissingPhotos(item) {
  return REQUIRED_PHOTO_LABELS.filter((_, i) => !(typeof item[`photo_${i}`] === 'string' && item[`photo_${i}`].length > 0));
}

function getCompletenessBadge(item) {
  const missing = [];

  if (item.status === 'Collected') {
    // Collected: needs damage report + all 9 photos to be marked complete
    if (!item.hasDamage || (item.hasDamage !== 'Yes' && item.hasDamage !== 'No')) missing.push('Damage Report');
    const missingPhotos = getMissingPhotos(item);
    if (missingPhotos.length > 0) missing.push(`Photos (${missingPhotos.length} missing)`);
  } else if (item.status === 'At Facility' || item.status === 'In Transit') {
    // At Facility / In Transit: all fields should be complete
    if (!item.hasDamage || (item.hasDamage !== 'Yes' && item.hasDamage !== 'No')) missing.push('Damage Report');
    const missingPhotos = getMissingPhotos(item);
    if (missingPhotos.length > 0) missing.push(`Photos (${missingPhotos.length} missing)`);
    if (!item.inspectorName || !item.inspectorSignature) missing.push('Inspector Sign-off');
    if (item.vehicleType === 'Vehicle') {
      if (!item.odometer) missing.push('Odometer');
      if (!item.keys) missing.push('Keys');
    }
    if (item.vehicleType === 'Caravan') {
      if (!item.caravanLength) missing.push('Caravan Length');
      const totalChecks = 14;
      const unchecked = Array.from({ length: totalChecks }, (_, i) => i)
        .filter(i => !item[`caravanCheck_${i}`] || item[`caravanCheck_${i}`] === 'false').length;
      if (unchecked > 0) missing.push(`Caravan Checklist (${unchecked} item${unchecked !== 1 ? 's' : ''} not ticked)`);
    }
  } else if (item.status === 'Created') {
    // Created: minimal — just needs an identifier
    if (!item.identifier) missing.push('Chassis/Reg/VIN');
  } else {
    return ''; // Delivered / Voided — no badge needed
  }

  const tooltip = missing.length > 0
    ? `Incomplete. Missing: ${missing.join(', ')}`
    : 'Record is fully complete';

  if (missing.length > 0) {
    return `<i class="ph ph-check-circle" style="color: var(--text-tertiary); font-size: 1.1rem;" title="${tooltip}"></i>`;
  }
  return `<i class="ph-fill ph-check-circle" style="color: #16a34a; font-size: 1.1rem;" title="${tooltip}"></i>`;
}

/**
 * View Generations (HTML Strings)
 */
function generateDashboardHTML() {
  const recentInspections = AppState.getRecentInspections(); // last 48hrs
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Delivered column shows only last 24hrs
  const recentDelivered = AppState.inspections.filter(i =>
    i.status === 'Delivered' && (now - new Date(i.updatedAt || i.createdAt).getTime()) < oneDayMs
  );

  // Respect user-selected column visibility
  const selectedCols = AppState.dashboardColumns.length > 0 ? AppState.dashboardColumns : [...ALL_STATUSES];
  const statuses = ['Created', 'Collected', 'At Facility', 'In Transit'].filter(s => selectedCols.includes(s));
  const showDelivered = selectedCols.includes('Delivered');
  const totalCols = statuses.length + (showDelivered ? 1 : 0);

  const statusColor = {
    'Created': 'var(--status-created-text)',
    'Collected': 'var(--status-collected-text)',
    'At Facility': 'var(--status-holding-text)',
    'In Transit': 'var(--status-transit-text)',
    'Assigned Pick-up': 'var(--status-transit-text)',
    'Delivered': 'var(--status-delivered-text)',
  };

  const statusCSS = status => status.toLowerCase().replace(/ /g, '-');

  const formatSuburbState = (fullAddress) => {
    if (!fullAddress || fullAddress === 'N/A') return 'N/A';
    // 1. Remove Country
    let cleaned = fullAddress.replace(/,\s*Australia$/i, '').trim();
    // 2. Remove Postcode (4 digits at end)
    cleaned = cleaned.replace(/\s\d{4}$/, '').trim();

    const parts = cleaned.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length >= 2) {
      let last = parts[parts.length - 1];
      let secondLast = parts[parts.length - 2];
      // If last part is a state code (e.g. "VIC"), prefix with the suburb
      if (last.length <= 3 && /^[A-Z]{2,3}$/.test(last)) {
        return `${secondLast} ${last}`;
      }
      return last;
    }
    return cleaned;
  };

  const buildCard = item => {
    const isCreated = item.status === 'Created';

    // Determine Top Right Meta
    let topRightMeta = '';
    if (isCreated && item.bookedCollectionTime) {
      topRightMeta = `<i class="ph ph-calendar"></i> ${new Date(item.bookedCollectionTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
    } else if (isCreated) {
      topRightMeta = `<i class="ph ph-calendar-slash" style="opacity:0.45;"></i> <span style="opacity:0.5;">No booking set</span>`;
    } else if ((item.status === 'In Transit' || item.status === 'Assigned Pick-up') && item.assignedTransport) {
      topRightMeta = `<i class="ph ph-truck"></i> ${item.assignedTransport}`;
    } else {
      topRightMeta = `<i class="ph ph-clock"></i> ${timeAgo(item.statusChangedAt || item.updatedAt || item.createdAt)}`;
    }

    // Determine Bottom Meta Rows
    let bottomMeta = '';
    if (isCreated || item.status === 'Assigned Pick-up') {
      bottomMeta = `
        <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block; max-width: 100%;">
          <i class="ph ph-map-pin"></i> Pick Up: ${formatSuburbState(item.pickupAddress)} | ${item.bookingContact || 'No Contact'}
        </div>
        <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block; margin-top: 2px; max-width: 100%;">
          <i class="ph ph-truck"></i> Dest: ${formatSuburbState(item.deliveryAddress)} | ${item.receiver || 'No Customer'}
        </div>`;
    } else {
      bottomMeta = `
        <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block; max-width: 100%;">
          <i class="ph ph-map-pin"></i> ${formatSuburbState(item.deliveryAddress)} | ${item.receiver || 'N/A'}
        </div>`;
    }

    return `
      <div class="inspection-card" onclick="navigate('item-detail', {id: '${item.id}'})">
        <div class="card-header">
          <div style="display: flex; gap: 0.5rem; align-items: center; min-width: 0; flex-shrink: 1;">
            <span class="status-badge status-${statusCSS(item.status)}">${item.status}</span>
            ${(isCreated || item.status === 'In Transit') ? '' : getCompletenessBadge(item)}
          </div>
          <span class="card-meta" style="margin-top: 0; white-space: nowrap; flex-shrink: 0;">
            ${topRightMeta}
          </span>
        </div>
        <div class="card-title" style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 100%;">${item.vehicleType}${item.make ? ' - ' + item.make + ' ' + (item.model || '') : ''} - ${item.identifier}</div>
        <div class="card-meta" style="flex-direction: column; align-items: flex-start; gap: 0.2rem; overflow: hidden; display: flex; max-width: 100%;">
          ${bottomMeta}
        </div>
      </div>`;
  };

  // Dynamic grid layout — adjusts to number of visible columns
  const colTemplate = `repeat(${totalCols}, 1fr)`;
  let html = `<div class="kanban-board" style="grid-template-columns: ${colTemplate};">`;

  statuses.forEach(status => {
    let items = recentInspections.filter(i => {
      if (status === 'In Transit') {
        return i.status === 'In Transit' || i.status === 'Assigned Pick-up';
      }
      return i.status === status;
    });

    if (status === 'Created') {
      items.sort((a, b) => {
        const timeA = a.bookedCollectionTime ? new Date(a.bookedCollectionTime).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.bookedCollectionTime ? new Date(b.bookedCollectionTime).getTime() : new Date(b.createdAt).getTime();
        return timeA - timeB; // Ascending: earliest first
      });
    }

    html += `
      <div class="kanban-column">
        <div class="kanban-header" style="border-bottom-color: ${statusColor[status]};">
          <span style="font-weight: 700; color: var(--text-primary);">${status}</span>
          <span class="kanban-count">${items.length}</span>
        </div>
        <div class="kanban-items">
          ${items.length === 0 ? '<div style="color: var(--text-tertiary); font-size: 0.8rem; text-align: center; padding: 0.75rem;">No items</div>' : ''}
          ${items.map(buildCard).join('')}
        </div>
      </div>`;
  });

  // Delivered column — last 24hrs only (only if selected)
  if (showDelivered) {
    html += `
      <div class="kanban-column" style="opacity: 0.85;">
        <div class="kanban-header" style="border-bottom-color: var(--status-delivered-text);">
          <span style="font-weight: 700; color: var(--text-primary);">Delivered <span style="font-weight: 400; font-size: 0.85em; color: var(--text-tertiary);">(Last 24hrs)</span></span>
          <span class="kanban-count">${recentDelivered.length}</span>
        </div>
        <div class="kanban-items">
          ${recentDelivered.length === 0 ? '<div style="color: var(--text-tertiary); font-size: 0.8rem; text-align: center; padding: 0.75rem;">Last 24 hrs</div>' : ''}
          ${recentDelivered.map(buildCard).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

// =============================================
// Dashboard Column Filter Panel Functions
// =============================================
const STATUS_COLORS = {
  'Created': 'var(--status-created-text)',
  'Collected': 'var(--status-collected-text)',
  'At Facility': 'var(--status-holding-text)',
  'In Transit': 'var(--status-transit-text)',
  'Delivered': 'var(--status-delivered-text)',
};

let inspectionsListener = null;
let transportsListener = null;

function startRealTimeSync() {
  // Sync Inspections
  inspectionsListener = db.collection('inspections')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      AppState.inspections = snapshot.docs.map(doc => doc.data());
      if (AppState.currentRoute === 'dashboard' || AppState.currentRoute === 'status-list') {
        renderView(AppState.currentRoute, AppState.currentRoute === 'status-list' ? { status: elements.pageTitle.textContent } : null);
      }
    });

  // Sync Transports
  transportsListener = db.collection('transports')
    .onSnapshot(snapshot => {
      AppState.transports = snapshot.docs.map(doc => doc.data());
      if (AppState.currentRoute === 'transports') {
        renderView('transports');
      }
    });
}

function stopRealTimeSync() {
  if (inspectionsListener) inspectionsListener();
  if (transportsListener) transportsListener();
  inspectionsListener = null;
  transportsListener = null;
}

window.logout = async function () {
  try {
    await auth.signOut();
    AppState.inspections = [];
    AppState.transports = [];
    navigate('dashboard'); // This will trigger the auth listener to hide the app
  } catch (error) {
    console.error("Logout Error:", error);
  }
};

function toggleColumnFilterPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById('column-filter-panel');
  const btn = document.getElementById('column-filter-btn');
  const isOpen = panel.style.display !== 'none';

  if (isOpen) {
    panel.style.display = 'none';
    return;
  }

  // Populate checkboxes
  const checksContainer = document.getElementById('column-filter-checks');
  checksContainer.innerHTML = ALL_STATUSES.map(status => {
    const isChecked = AppState.dashboardColumns.includes(status);
    const dotColor = STATUS_COLORS[status] || 'var(--text-secondary)';
    return `
      <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; font-size:0.82rem; color:var(--text-primary); user-select:none;">
        <input type="checkbox" value="${status}" ${isChecked ? 'checked' : ''}
          style="width:15px; height:15px; accent-color:${dotColor}; cursor:pointer;">
        <span style="width:8px; height:8px; border-radius:50%; background:${dotColor}; display:inline-block; flex-shrink:0;"></span>
        <span>${status === 'Delivered' ? 'Delivered (24h)' : status}</span>
      </label>`;
  }).join('');

  // Highlight active filter button
  btn.style.background = 'var(--accent-primary)';
  btn.style.color = '#fff';
  panel.style.display = 'block';

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closePanel(ev) {
      if (!panel.contains(ev.target) && ev.target !== btn) {
        panel.style.display = 'none';
        btn.style.background = '';
        btn.style.color = '';
        document.removeEventListener('click', closePanel);
      }
    });
  }, 10);
}

function applyColumnFilter() {
  const checkboxes = document.querySelectorAll('#column-filter-checks input[type=checkbox]');
  const selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });

  // Ensure at least one column
  if (selected.length === 0) {
    alert('Please select at least one column.');
    return;
  }

  AppState.dashboardColumns = selected;
  AppState.savePreferences();

  // Close panel and reset button style
  const panel = document.getElementById('column-filter-panel');
  const btn = document.getElementById('column-filter-btn');
  panel.style.display = 'none';
  // Show active indicator if not all columns selected
  const allSelected = selected.length === ALL_STATUSES.length;
  btn.style.background = allSelected ? '' : 'var(--accent-primary)';
  btn.style.color = allSelected ? '' : '#fff';

  // Re-render dashboard if currently visible
  const contentArea = document.getElementById('content-area');
  const pageTitle = document.getElementById('page-title');
  if (pageTitle && pageTitle.textContent.includes('Dashboard')) {
    contentArea.innerHTML = generateDashboardHTML();
  }
}

// =============================================
// Manage Records — Sidebar Navigation Helpers
// =============================================
function navigateStatus(status) {
  // Deactivate all main nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  // Activate all sub-links and then only the one matching the selected status
  document.querySelectorAll('.nav-sublink').forEach(l => l.classList.remove('active'));
  const targetLink = document.querySelector(`.nav-sublink[data-status="${status}"]`);
  if (targetLink) targetLink.classList.add('active');
  navigate('status-list', { status });
}

function toggleManageRecords(headerEl) {
  const subnav = document.getElementById('manage-records-subnav');
  const caret = headerEl.querySelector('.nav-caret');
  const isOpen = subnav.style.display !== 'none';
  subnav.style.display = isOpen ? 'none' : 'flex';
  if (caret) caret.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

function generateStatusListHTML(status) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const statusCSS = s => s.toLowerCase().replace(/ /g, '-');

  const STATUS_COLOR_MAP = {
    'Created': 'var(--status-created-text)',
    'Collected': 'var(--status-collected-text)',
    'At Facility': 'var(--status-holding-text)',
    'In Transit': 'var(--status-transit-text)',
    'Delivered': 'var(--status-delivered-text)',
  };

  // Filter items — Delivered shows only last 24hrs
  let items;
  if (status === 'Delivered') {
    items = AppState.inspections.filter(i =>
      i.status === 'Delivered' && (now - new Date(i.updatedAt || i.createdAt).getTime()) < oneDayMs
    );
  } else {
    items = AppState.inspections.filter(i => i.status === status);
  }

  // Sort Created by booked collection time
  if (status === 'Created') {
    items.sort((a, b) => {
      const tA = a.bookedCollectionTime ? new Date(a.bookedCollectionTime).getTime() : new Date(a.createdAt).getTime();
      const tB = b.bookedCollectionTime ? new Date(b.bookedCollectionTime).getTime() : new Date(b.createdAt).getTime();
      return tA - tB;
    });
  }

  const accentColor = STATUS_COLOR_MAP[status] || 'var(--accent-primary)';

  const cardHTML = items.map(item => {
    const isCreated = item.status === 'Created';

    // Format addresses to Suburb State
    const formatSuburbState = (fullAddress) => {
      if (!fullAddress || fullAddress === 'N/A') return 'N/A';
      let cleaned = fullAddress.replace(/,\s*Australia$/i, '').trim().replace(/\s\d{4}$/, '').trim();
      const parts = cleaned.split(',').map(p => p.trim()).filter(p => p !== '');
      if (parts.length >= 2) {
        let last = parts[parts.length - 1];
        let secondLast = parts[parts.length - 2];
        if (last.length <= 3 && /^[A-Z]{2,3}$/.test(last)) return `${secondLast} ${last}`;
        return last;
      }
      return cleaned;
    };

    let topRightMeta = '';
    if (isCreated && item.bookedCollectionTime) {
      topRightMeta = `<i class="ph ph-calendar"></i> ${new Date(item.bookedCollectionTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
    } else if (isCreated) {
      topRightMeta = `<i class="ph ph-calendar-slash" style="opacity:0.45;"></i> <span style="opacity:0.5;">No booking set</span>`;
    } else if (item.status === 'In Transit' && item.assignedTransport) {
      topRightMeta = `<i class="ph ph-truck"></i> ${item.assignedTransport}`;
    } else {
      topRightMeta = `<i class="ph ph-clock"></i> ${timeAgo(item.statusChangedAt || item.updatedAt || item.createdAt)}`;
    }

    let bottomMeta = '';
    if (isCreated) {
      bottomMeta = `
        <div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%;">
          <i class="ph ph-map-pin"></i> Pick Up: ${formatSuburbState(item.pickupAddress)} | ${item.bookingContact || 'No Contact'}
        </div>
        <div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%;margin-top:2px;">
          <i class="ph ph-truck"></i> Dest: ${formatSuburbState(item.deliveryAddress)} | ${item.receiver || 'No Customer'}
        </div>`;
    } else {
      bottomMeta = `
        <div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%;">
          <i class="ph ph-map-pin"></i> ${formatSuburbState(item.deliveryAddress)} | ${item.receiver || 'N/A'}
        </div>`;
    }

    return `
      <div class="inspection-card status-list-card" onclick="navigate('item-detail', {id: '${item.id}'})">
        <div class="card-header">
          <div style="display:flex;gap:0.5rem;align-items:center;min-width:0;flex-shrink:1;">
            <span class="status-badge status-${statusCSS(item.status)}">${item.status}</span>
            ${(isCreated || item.status === 'In Transit') ? '' : getCompletenessBadge(item)}
          </div>
          <span class="card-meta" style="margin-top:0;white-space:nowrap;flex-shrink:0;">${topRightMeta}</span>
        </div>
        <div class="card-title" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%;">
          ${item.vehicleType}${item.make ? ' - ' + item.make + ' ' + (item.model || '') : ''} - ${item.identifier}
        </div>
        <div class="card-meta" style="flex-direction:column;align-items:flex-start;gap:0.2rem;overflow:hidden;display:flex;max-width:100%;">
          ${bottomMeta}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="status-list-container">
      <div class="status-list-header" style="border-left-color: ${accentColor};">
        <div>
          <span class="status-badge status-${statusCSS(status)}" style="font-size:0.9rem;padding:0.3rem 1rem;">${status}</span>
          ${status === 'Delivered' ? '<span style="color:var(--text-tertiary);font-size:0.8rem;margin-left:0.5rem;">(Last 24 hours only)</span>' : ''}
        </div>
        <span style="font-size:0.85rem;color:var(--text-tertiary);">${items.length} record${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.length === 0
      ? `<div class="status-list-empty"><i class="ph ph-folder-open" style="font-size:2.5rem;opacity:0.3;"></i><p>No ${status} records found${status === 'Delivered' ? ' in the last 24 hours' : ''}.</p></div>`
      : `<div class="status-list-grid">${cardHTML}</div>`
    }
    </div>`;
}

function generateCreateFormHTML() {
  return `
      <div class="form-container">
        <form id="inspection-form">
          <div class="form-section">
            <h2 class="form-section-title"><i class="ph ph-identification-card"></i> Identifiable Information</h2>
            
            <div class="form-group">
              <label class="form-label">Asset Type <span style="color:#e53e3e;">*</span></label>
              <select class="form-control" name="vehicleType" id="asset-type-select" required onchange="window.toggleAssetTypeFields()">
                <option value="">Select Type...</option>
                <option value="Caravan">Caravan</option>
                <option value="Vehicle">Vehicle</option>
                <option value="Boat">Boat</option>
                <option value="Trailer">Trailer</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Booked Collection Time</label>
                <input type="datetime-local" class="form-control" name="bookedCollectionTime">
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Booking Contact</label>
                <input type="text" class="form-control" name="bookingContact" placeholder="e.g. John Smith 0412345678">
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Pick Up Address</label>
              <input type="text" class="form-control address-autocomplete" autocomplete="off" name="pickupAddress" placeholder="123 Origin St, Suburb VIC 3000">
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Make <span style="color:#e53e3e;">*</span></label>
                <input type="text" class="form-control" name="make" required placeholder="e.g. Jayco" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Model <span style="color:#e53e3e;">*</span></label>
                <input type="text" class="form-control" name="model" required placeholder="e.g. Journey" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Chassis, Registration or VIN <span style="color:#e53e3e;">*</span></label>
              <input type="text" class="form-control" name="identifier" required placeholder="e.g. 123456789" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()">
            </div>

            <div class="form-group">
              <label class="form-label">Receiver Name (Customer) <span style="color:#e53e3e;">*</span></label>
              <input type="text" class="form-control" name="receiver" required placeholder="John Doe" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
            </div>

            <div class="form-group">
              <label class="form-label">Delivery Address <span style="color:#e53e3e;">*</span></label>
              <input type="text" class="form-control address-autocomplete" autocomplete="off" name="deliveryAddress" required placeholder="123 Example Street, Campbellfield VIC 3061">
            </div>


          </div>
          
          <div class="form-section">
            <h2 class="form-section-title"><i class="ph ph-warning-circle"></i> Condition & Damage Report</h2>
            <div class="form-group" style="margin-bottom: 1.5rem;">
               <label class="form-label" style="display: block; margin-bottom: 0.5rem;">Are there any visible scratches, dents or marks on the exterior of the vehicle or trailer?</label>
               <div style="display: flex; gap: 1.5rem;">
                 <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                   <input type="radio" name="hasDamage" value="Yes"> Yes
                 </label>
                 <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                   <input type="radio" name="hasDamage" value="No"> No
                 </label>
               </div>
            </div>

            <div class="form-group">
              <label class="form-label">If yes, note the existing damage</label>
              <textarea class="form-control" name="damageNotes" placeholder="Dents on nearside panel, scratch on rear bumper..."></textarea>
            </div>
          </div>
          
          <div class="form-section">
            <h2 class="form-section-title"><i class="ph ph-camera"></i> Mandatory Pre-Delivery Photographs</h2>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">Please upload the required photographs below.</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
              ${['Chassis Number, Compliance Plate / VIN', 'Front Passenger Side Corner', 'Front', 'Front Driver Side Corner', 'Driver Side', 'Rear Driver Side Corner', 'Rear', 'Rear Passenger Side Corner', 'Passenger Side'].map((label, i) => `
                <div style="border: 1px dashed var(--border-color); border-radius: 8px; padding: 1rem; text-align: center; background: var(--bg-primary);">
                  <div style="font-weight: 500; font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-primary);">${label}</div>
                  <label class="btn btn-icon" style="background: var(--bg-tertiary); width: 100%; border-radius: 4px; padding: 0.5rem; cursor: pointer; display: inline-block;">
                    <input type="file" accept="image/*" style="display: none;" onchange="window.handlePhotoUpload(this)" name="photo_${i}">
                    <span class="upload-text"><i class="ph ph-upload-simple"></i> Upload</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>

          <div id="caravan-checklist-section" class="form-section" style="display: none; background-color: rgba(var(--accent-primary-rgb), 0.05); border: 1px solid var(--accent-primary); border-radius: 12px; padding: 1.5rem;">
            <h2 class="form-section-title" style="color: var(--accent-primary);"><i class="ph ph-clipboard-text"></i> Caravan Transport Checklist</h2>
            
            <div style="display: grid; gap: 0.75rem; margin-bottom: 1.5rem;">
              ${[
      'Every window checked',
      'Antenna is down and facing correct direction',
      'Roof hatches closed incl. shower',
      'All cupboards securely closed and taped (if required)',
      'Oven / cook top taped down',
      'Coffee table taped (if required)',
      'Laundry top and washing machine cupboard taped (if required)',
      'Sliding doors closed at top and bottom and taped',
      'Shower head removed',
      'Shower door closed and taped',
      'Pull out bed slide, check distance and tape closed slide with mattress',
      'Gas bottle hoses screwed into bottle',
      'External hatches, toolboxes and lockers closed and secured',
      'Awnings in closed and locked position and zip tied in place'
    ].map((item, i) => `
                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                  <input type="checkbox" name="caravanCheck_${i}" style="margin-top: 0.25rem;">
                  <span style="font-size: 0.95rem;">${item}</span>
                </label>
              `).join('')}
            </div>

            <div class="form-group">
              <label class="form-label">Length of caravan from tow coupling to rear of van (m)</label>
              <input type="number" class="form-control" name="caravanLength" step="0.1" placeholder="e.g. 7.5">
            </div>

            <div class="form-group">
              <label class="form-label">Additional Caravan Information / Notes</label>
              <textarea class="form-control" name="caravanNotes" placeholder="Any specific instructions or variations from the standard checklist..."></textarea>
            </div>
          </div>

          <div id="vehicle-specific-section" class="form-section" style="display: none; background-color: rgba(37, 99, 235, 0.04); border: 1px solid var(--status-transit-text); border-radius: 12px; padding: 1.5rem;">
            <h2 class="form-section-title" style="color: var(--status-transit-text);"><i class="ph ph-car"></i> Vehicle Details</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Odometer Reading (km)</label>
                <input type="number" class="form-control" name="odometer" id="input-odometer" placeholder="e.g. 120500">
              </div>
              <div class="form-group">
                <label class="form-label">Keys Received</label>
                <input type="number" class="form-control" name="keys" id="input-keys" placeholder="e.g. 2">
              </div>
            </div>
          </div>
          
          <div class="form-section">
             <h2 class="form-section-title"><i class="ph ph-signature"></i> Final Sign Off</h2>
             <div class="form-group">
               <label class="form-label">Inspector Full Name</label>
               <input type="text" class="form-control" name="inspectorName" placeholder="e.g. Jane Smith">
             </div>
             <div class="form-group">
               <label class="form-label">Inspector Signature (Type name to e-sign)</label>
               <input type="text" class="form-control" name="inspectorSignature" style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;">
             </div>
          </div>
          
          <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
            <button type="button" class="btn" style="background: var(--bg-tertiary);" onclick="navigate('dashboard')">Cancel</button>
            <button type="submit" class="btn btn-primary"><i class="ph ph-check-circle"></i> Create Record</button>
          </div>
        </form>
      </div>
    `;
}

// Global script to handle dynamic toggle (innerHTML script tags don't execute automatically)
window.toggleAssetTypeFields = function () {
  const selectNode = document.getElementById('asset-type-select');
  if (!selectNode) return;

  const type = selectNode.value;

  const caravanSection = document.getElementById('caravan-checklist-section');
  if (caravanSection) {
    caravanSection.style.display = (type === 'Caravan') ? 'block' : 'none';
  }

  const vehicleSection = document.getElementById('vehicle-specific-section');
  const odoInput = document.getElementById('input-odometer');
  const keysInput = document.getElementById('input-keys');

  if (vehicleSection) {
    if (type === 'Vehicle') {
      vehicleSection.style.display = 'flex';
    } else {
      vehicleSection.style.display = 'none';
    }
  }
};

window.handlePhotoUpload = function (input) {
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
      const base64 = e.target.result;

      const originalName = input.dataset.name || input.name;
      if (!input.dataset.name) input.dataset.name = originalName;

      let hiddenInput = input.parentElement.querySelector(`input[type="hidden"][name="${originalName}"]`);
      if (!hiddenInput) {
        input.removeAttribute('name'); // ensure the raw File object isn't grabbed
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = originalName;
        input.parentElement.appendChild(hiddenInput);
      }
      hiddenInput.value = base64;

      const label = input.closest('.btn');
      const span = label.querySelector('.upload-text');
      if (span) {
        span.innerHTML = '<i class="ph ph-check-circle" style="color: var(--status-delivered-text)"></i> Uploaded';
        span.style.color = 'var(--status-delivered-text)';
      }
    };

    reader.readAsDataURL(file);
  }
};

function setupFormListeners() {
  const form = document.getElementById('inspection-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      // Strip un-touched <input type="file"> slots which remain as File objects
      Object.keys(data).forEach(key => {
        if (key.startsWith('photo_')) {
          if (typeof data[key] !== 'string') {
            delete data[key];
          }
        }
      });

      try {
        await AppState.addInspection(data);
        alert('Record created successfully! Status set to Created.');
        navigate('dashboard');
      } catch (err) {
        console.error('Error saving record:', err);
        alert('Failed to save record to database. Please check console for details.');
      }
    });
  }
}

function generateEditFormHTML(id) {
  const item = AppState.inspections.find(i => i.id === id);
  if (!item) return `<div class="form-container" style="text-align: center;">Item not found</div>`;

  return `
      <div class="form-container">
      <form id="edit-inspection-form">
        <div class="form-section">
          <h2 class="form-section-title"><i class="ph ph-identification-card"></i> Identifiable Information</h2>

          <div class="form-group">
            <label class="form-label">Asset Type</label>
            <select class="form-control" name="vehicleType" id="asset-type-select" required onchange="window.toggleAssetTypeFields()">
              <option value="Caravan" ${item.vehicleType === 'Caravan' ? 'selected' : ''}>Caravan</option>
              <option value="Vehicle" ${item.vehicleType === 'Vehicle' ? 'selected' : ''}>Vehicle</option>
              <option value="Boat" ${item.vehicleType === 'Boat' ? 'selected' : ''}>Boat</option>
              <option value="Trailer" ${item.vehicleType === 'Trailer' ? 'selected' : ''}>Trailer</option>
              <option value="Other" ${item.vehicleType === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Booked Collection Time</label>
              <input type="datetime-local" class="form-control" name="bookedCollectionTime" value="${item.bookedCollectionTime || ''}">
            </div>
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Booking Contact</label>
              <input type="text" class="form-control" name="bookingContact" value="${item.bookingContact || ''}" placeholder="e.g. John Smith 0412345678">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Pick Up Address</label>
            <input type="text" class="form-control address-autocomplete" autocomplete="off" name="pickupAddress" value="${item.pickupAddress || ''}" placeholder="123 Origin St, Suburb VIC 3000">
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Make</label>
              <input type="text" class="form-control" name="make" required value="${item.make || ''}" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
            </div>
            <div class="form-group" style="margin: 0;">
              <label class="form-label">Model</label>
              <input type="text" class="form-control" name="model" required value="${item.model || ''}" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Chassis, Registration or VIN</label>
            <input type="text" class="form-control" name="identifier" required value="${item.identifier || ''}" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()">
          </div>

          <div class="form-group">
            <label class="form-label">Receiver Name (Customer)</label>
            <input type="text" class="form-control" name="receiver" required value="${item.receiver || ''}" oninput="this.value = this.value.replace(/(?:^|\\s)\\S/g, a => a.toUpperCase())">
          </div>

          <div class="form-group">
            <label class="form-label">Delivery Address</label>
            <input type="text" class="form-control address-autocomplete" autocomplete="off" name="deliveryAddress" required placeholder="123 Example Street, Campbellfield VIC 3061" value="${item.deliveryAddress || ''}">
          </div>

        </div>

        <div class="form-section">
          <h2 class="form-section-title"><i class="ph ph-warning-circle"></i> Condition & Damage Report</h2>
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label" style="display: block; margin-bottom: 0.5rem;">Are there any visible scratches, dents or marks on the exterior of the vehicle or trailer?</label>
            <div style="display: flex; gap: 1.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="radio" name="hasDamage" value="Yes" ${item.hasDamage === 'Yes' ? 'checked' : ''}> Yes
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="radio" name="hasDamage" value="No" ${item.hasDamage === 'No' ? 'checked' : ''}> No
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">If yes, note the existing damage</label>
            <textarea class="form-control" name="damageNotes">${item.damageNotes || ''}</textarea>
          </div>
        </div>

        <div class="form-section">
          <h2 class="form-section-title"><i class="ph ph-camera"></i> Mandatory Pre-Delivery Photographs</h2>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">Update the uploaded photographs below.</p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
            ${['Chassis Number, Compliance Plate / VIN', 'Front Passenger Side Corner', 'Front', 'Front Driver Side Corner', 'Driver Side', 'Rear Driver Side Corner', 'Rear', 'Rear Passenger Side Corner', 'Passenger Side'].map((label, i) => {
    const hasExisting = typeof item[`photo_${i}`] === 'string' && item[`photo_${i}`].length > 0;
    const btnStyle = hasExisting
      ? 'background: rgba(22,163,74,0.08); border: 1px solid #16a34a;'
      : 'background: var(--bg-tertiary);';
    const spanStyle = hasExisting ? `color: #16a34a;` : `color: var(--text-secondary);`;
    const icon = hasExisting ? 'ph-check-circle' : 'ph-upload-simple';
    const label_text = hasExisting ? 'Uploaded ✓' : 'Upload';
    return `
                <div style="border: 1px dashed var(--border-color); border-radius: 8px; padding: 1rem; text-align: center; background: var(--bg-primary);">
                  <div style="font-weight: 500; font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-primary);">${label}</div>
                  <label class="btn btn-icon" style="${btnStyle} width: 100%; border-radius: 4px; padding: 0.5rem; cursor: pointer; display: inline-block;">
                    <input type="file" accept="image/*" style="display: none;" onchange="window.handlePhotoUpload(this)" name="photo_${i}">
                    <span class="upload-text" style="${spanStyle}"><i class="ph ${icon}"></i> ${label_text}</span>
                  </label>
                </div>`;
  }).join('')}
          </div>
        </div>

        <div id="caravan-checklist-section" class="form-section" style="display: ${item.vehicleType === 'Caravan' ? 'block' : 'none'}; background-color: rgba(var(--accent-primary-rgb), 0.05); border: 1px solid var(--accent-primary); border-radius: 12px; padding: 1.5rem;">
          <h2 class="form-section-title" style="color: var(--accent-primary);"><i class="ph ph-clipboard-text"></i> Caravan Transport Checklist</h2>

          <div style="display: grid; gap: 0.75rem; margin-bottom: 1.5rem;">
            ${[
      'Every window checked',
      'Antenna is down and facing correct direction',
      'Roof hatches closed incl. shower',
      'All cupboards securely closed and taped (if required)',
      'Oven / cook top taped down',
      'Coffee table taped (if required)',
      'Laundry top and washing machine cupboard taped (if required)',
      'Sliding doors closed at top and bottom and taped',
      'Shower head removed',
      'Shower door closed and taped',
      'Pull out bed slide, check distance and tape closed slide with mattress',
      'Gas bottle hoses screwed into bottle',
      'External hatches, toolboxes and lockers closed and secured',
      'Awnings in closed and locked position and zip tied in place'
    ].map((label, i) => `
                <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer;">
                  <input type="checkbox" name="caravanCheck_${i}" style="margin-top: 0.25rem;" ${item['caravanCheck_' + i] === 'on' ? 'checked' : ''}>
                  <span style="font-size: 0.95rem;">${label}</span>
                </label>
              `).join('')}
          </div>

          <div class="form-group">
            <label class="form-label">Length of caravan from tow coupling to rear of van (m)</label>
            <input type="number" class="form-control" name="caravanLength" step="0.1" value="${item.caravanLength || ''}">
          </div>

          <div class="form-group">
            <label class="form-label">Additional Caravan Information / Notes</label>
            <textarea class="form-control" name="caravanNotes">${item.caravanNotes || ''}</textarea>
          </div>
        </div>

        <div id="vehicle-specific-section" class="form-section" style="display: ${item.vehicleType === 'Vehicle' ? 'block' : 'none'}; background-color: rgba(37, 99, 235, 0.04); border: 1px solid var(--status-transit-text); border-radius: 12px; padding: 1.5rem;">
          <h2 class="form-section-title" style="color: var(--status-transit-text);"><i class="ph ph-car"></i> Vehicle Details</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Odometer Reading (km)</label>
              <input type="number" class="form-control" name="odometer" id="input-odometer" value="${item.odometer || ''}" placeholder="e.g. 120500">
            </div>
            <div class="form-group">
              <label class="form-label">Keys Received</label>
              <input type="number" class="form-control" name="keys" id="input-keys" value="${item.keys || ''}" placeholder="e.g. 2">
            </div>
          </div>
        </div>

        <div class="form-section">
          <h2 class="form-section-title"><i class="ph ph-signature"></i> Final Sign Off</h2>
          <div class="form-group">
            <label class="form-label">Inspector Full Name</label>
            <input type="text" class="form-control" name="inspectorName" value="${item.inspectorName || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Inspector Signature (Type name to e-sign)</label>
            <input type="text" class="form-control" name="inspectorSignature" style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;" value="${item.inspectorSignature || ''}">
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
          <button type="button" class="btn" style="background: var(--bg-tertiary);" onclick="navigate('item-detail', {id: '${item.id}'})">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="ph ph-check-circle"></i> Save Edits</button>
        </div>
      </form>
      </div >
        `;
}

function setupEditFormListeners(id) {
  const form = document.getElementById('edit-inspection-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      // CRITICAL: FormData captures un-touched <input type="file"> slots as
      // empty File objects (name:'', size:0). These must NOT overwrite the
      // existing saved base64 photo strings in AppState. Strip any photo_N
      // entry that is not a genuine non-empty string (real base64 data).
      Object.keys(data).forEach(key => {
        if (key.startsWith('photo_')) {
          if (typeof data[key] !== 'string' || data[key].length === 0) {
            delete data[key];
          }
        }
      });

      try {
        data.updatedAt = new Date().toISOString();
        await db.collection('inspections').doc(id).update(data);
        alert('Record updated successfully!');
        navigate('item-detail', { id: id });
      } catch (err) {
        console.error('Error updating record:', err);
        alert('Failed to update record in database. Check console.');
      }
    });
  }
}

function generateSearchHTML() {
  return `
        <div class="form-container" style="max-width: 100%; margin-bottom: 2rem;">
      <h2 class="form-section-title" style="margin-bottom: 1.5rem;"><i class="ph ph-magnifying-glass"></i> Advanced Database Search</h2>
      
      <!-- Full Width Keyword Search -->
      <div class="form-group">
        <label class="form-label">Keyword (ID, VIN, Notes)</label>
        <input type="text" id="search-keyword" class="form-control check-enter" placeholder="Search text...">
      </div>
      
      <!-- Inline Filters Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 1rem;">
        <div class="form-group" style="margin: 0;">
          <label class="form-label">Start Date</label>
          <input type="date" id="search-start-date" class="form-control check-enter">
        </div>
        <div class="form-group" style="margin: 0;">
          <label class="form-label">End Date</label>
          <input type="date" id="search-end-date" class="form-control check-enter">
        </div>
      </div>
      
      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
        <button class="btn btn-primary" onclick="performSearch()" style="padding: 0.75rem 2rem;"><i class="ph ph-magnifying-glass"></i> Apply Filters</button>
      </div>
    </div>
        <div id="search-results" class="kanban-items" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); display: grid; gap: 1.25rem;">
          <!-- Search results injected here -->
          <p style="color: var(--text-tertiary); grid-column: 1 / -1;">Use the filters above and click apply to find records...</p>
        </div>
      `;
}

// Utility for getWeek
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function formatShortAddress(fullAddress) {
  if (!fullAddress) return 'N/A';
  const parts = fullAddress.split(',');
  if (parts.length < 2) return fullAddress;
  let locality = parts[parts.length - 1].trim();
  locality = locality.replace(/\s+\d{4}$/, '');
  const localityParts = locality.split(/\s+/);
  if (localityParts.length >= 2) {
    const state = localityParts.pop();
    const suburb = localityParts.join(' ');
    return `${suburb}, ${state} `;
  }
  return locality;
}

function performSearch() {
  const kw = document.getElementById('search-keyword').value.toLowerCase().trim();
  const startDateInput = document.getElementById('search-start-date').value;
  const endDateInput = document.getElementById('search-end-date').value;

  const resultsContainer = document.getElementById('search-results');

  const results = AppState.inspections.filter(item => {
    const dateObj = new Date(item.createdAt);
    // Remove time portion for accurate date comparisons
    dateObj.setHours(0, 0, 0, 0);

    // Keyword match
    if (kw) {
      const searchableString = [item.id, item.identifier, item.vehicleType, item.status, item.damageNotes].join(' ').toLowerCase();
      const keywords = kw.split(' ').filter(k => k.length > 0);
      if (!keywords.every(k => searchableString.includes(k))) return false;
    }

    // Start Date match
    if (startDateInput) {
      const startDate = new Date(startDateInput);
      startDate.setHours(0, 0, 0, 0);
      if (dateObj < startDate) return false;
    }

    // End Date match
    if (endDateInput) {
      const endDate = new Date(endDateInput);
      endDate.setHours(0, 0, 0, 0);
      if (dateObj > endDate) return false;
    }

    return true;
  });

  if (results.length === 0) {
    resultsContainer.innerHTML = '<p style="color: var(--text-tertiary)">No results found.</p>';
    return;
  }

  resultsContainer.innerHTML = results.map(item => `
        <div class="inspection-card" onclick="navigate('item-detail', {id: '${item.id}'})">
      <div class="card-header">
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="status-badge status-${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span>
          ${getCompletenessBadge(item)}
        </div>
        <span class="card-meta" style="margin-top: 0;">
          ${item.status === 'In Transit' && item.assignedTransport
      ? `<i class="ph ph-truck"></i> ${item.assignedTransport}`
      : `<i class="ph ph-clock"></i> In status: ${timeAgo(item.updatedAt || item.createdAt)}`}
        </span>
      </div>
      <div class="card-title">${item.vehicleType} - ${item.make ? item.make + ' ' + (item.model || '') + ' - ' : ''}${item.identifier}</div>
      <div class="card-meta" style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block;">
        <i class="ph ph-map-pin"></i> ${formatShortAddress(item.deliveryAddress)} | ${item.receiver || 'N/A'}
      </div>
    </div >
        `).join('');
}

function setupSearchListeners() {
  const inputs = document.querySelectorAll('.check-enter');
  inputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performSearch();
    });
  });
}

window.performSearch = performSearch;

function generateItemDetailHTML(id) {
  const item = AppState.inspections.find(i => i.id === id);
  if (!item) return `<div class="form-container" style="text-align: center;">Item not found</div>`;

  let actionsHTML = '';
  if (['Created', 'Collected', 'At Facility'].includes(item.status)) {
    actionsHTML += `<button class="btn" style="background: var(--bg-tertiary);" onclick="navigate('edit', {id: '${id}'})"><i class="ph ph-pencil-simple"></i> Edit Record</button>`;
  }

  if (item.status === 'Created') {
    actionsHTML += `
        <button class="btn btn-collected" style="background: var(--status-collected-bg); color: var(--status-collected-text); border: 1px solid var(--status-collected-text);" onclick="updateStatus('${id}', 'Collected')"><i class="ph ph-hand-grabbing"></i> Collected</button>
        `;
  } else if (item.status === 'Collected') {
    actionsHTML += `
        <button class="btn btn-transit" style="background: var(--status-transit-bg); color: var(--status-transit-text); border: 1px solid var(--status-transit-text);" onclick="promptAssignTransport('${id}')"><i class="ph ph-truck"></i> Assign to Transit</button>
        <button class="btn btn-holding" style="background: var(--status-holding-bg); color: var(--status-holding-text); border: 1px solid var(--status-holding-text);" onclick="updateStatus('${id}', 'At Facility')"><i class="ph ph-package"></i> Move to At Facility</button>
        `;
  } else if (item.status === 'At Facility') {
    actionsHTML += `
        <button class="btn btn-transit" style="background: var(--status-transit-bg); color: var(--status-transit-text); border: 1px solid var(--status-transit-text);" onclick="promptAssignTransport('${id}')"><i class="ph ph-truck"></i> Assign to Transit</button>
        `;
  } else if (item.status === 'Assigned Pick-up') {
    actionsHTML += `
        <button class="btn" style="background: var(--status-created-bg); color: var(--status-created-text); border: 1px solid var(--status-created-text);" onclick="revertToCreated('${id}')"><i class="ph ph-arrow-u-up-left"></i> Revert to Created</button>
      `;
  } else if (item.status === 'In Transit') {
    actionsHTML += `
        <button class="btn btn-holding" style="background: var(--status-holding-bg); color: var(--status-holding-text); border: 1px solid var(--status-holding-text);" onclick="updateStatus('${id}', 'At Facility')"><i class="ph ph-arrow-u-up-left"></i> Revert to At Facility</button>
        <button class="btn btn-delivered" style="background: var(--status-delivered-bg); color: var(--status-delivered-text); border: 1px solid var(--status-delivered-text);" onclick="navigate('delivery-report', {id: '${id}'})"><i class="ph ph-check-circle"></i> Complete Delivery Report</button>
      `;
  }

  return `
        <div class="form-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
          <h2 style="font-size: 1.5rem;"><i class="ph ph-file-text"></i> ${item.vehicleType} History Report</h2>
          <span class="status-badge status-${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span>
        </div>
        
        <div class="form-section print-identifiable">
          <p><strong>Record ID:</strong> ${item.id}</p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 1rem;">
            <p><strong>Type:</strong> ${item.vehicleType}</p>
            <p><strong>Make & Model:</strong> ${item.make || 'N/A'} ${item.model || ''}</p>
            <p><strong>Identifier (VIN/Reg):</strong> ${item.identifier}</p>
            <p><strong>Customer/Receiver:</strong> ${item.receiver || 'N/A'}</p>
            <p><strong>Booking Contact:</strong> ${item.bookingContact || 'N/A'}</p>
            ${item.bookedCollectionTime ? `<p><strong>Booked Collection:</strong> ${new Date(item.bookedCollectionTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>` : ''}
            <p style="grid-column: 1 / -1; margin-bottom: 0;"><strong>Pick Up Address:</strong> ${item.pickupAddress || 'N/A'}</p>
            <p style="grid-column: 1 / -1; margin-bottom: 0;"><strong>Delivery Address:</strong> ${item.deliveryAddress || 'N/A'}</p>
            ${item.vehicleType === 'Vehicle' ? `
              <p><strong>Odometer Reading:</strong> ${item.odometer || 'N/A'} km</p>
              <p><strong>Keys Received:</strong> ${item.keys || 'N/A'}</p>
            ` : ''}
          </div>
          ${item.updatedAt ? `<p class="hide-on-screen" style="margin-top: 0.5rem;"><strong>Last Status Update:</strong> ${new Date(item.updatedAt).toLocaleString()}</p>` : ''}
          ${item.status === 'Created' ? `
            <div style="margin-top: 1.5rem; display: flex; justify-content: flex-start;" class="no-print">
              <button class="btn btn-transit" style="background: var(--status-transit-bg); color: var(--status-transit-text); border: 1px solid var(--status-transit-text);" onclick="promptAssignPickUp('${id}')"><i class="ph ph-truck"></i> Assign for Pick-Up</button>
            </div>
          ` : ''}
        </div>
        <div class="print-signoff hide-on-screen">
          <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed var(--border-color);">
            <p><strong>Inspector Sign Off:</strong> ${item.inspectorName || 'N/A'}</p>
            <p><strong>Signature:</strong> <span style="font-family: 'Brush Script MT', cursive; font-size: 1.5rem;">${item.inspectorSignature || ''}</span></p>
          </div>
        </div>
        
        <div class="form-section print-inspection hide-on-screen">
          <p><strong>Exterior Damage Reported:</strong> ${item.hasDamage === 'Yes' ? '<span style="color: var(--status-created-bg); font-weight: bold;">YES</span>' : 'No'}</p>
          ${item.hasDamage === 'Yes' ? `<p style="padding: 1rem; background: var(--bg-primary); border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color);">${item.damageNotes || 'No specific notes provided.'}</p>` : ''}
        </div>
        
        ${item.vehicleType === 'Caravan' ? `
        <div class="form-section print-checklist hide-on-screen">
          <p><strong>Caravan Safety Checklist & Specifications:</strong></p>
          <div style="background: var(--bg-primary); border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color); padding: 1rem;">
             <p><strong>Caravan Length:</strong> ${item.caravanLength || 'N/A'} m</p>
             <p style="margin-bottom: 1rem;"><strong>Notes:</strong> ${item.caravanNotes || 'None'}</p>
             <div style="display: grid; gap: 0.5rem;">
               ${[
        'Every window checked',
        'Antenna is down and facing correct direction',
        'Roof hatches closed incl. shower',
        'All cupboards securely closed and taped',
        'Oven / cook top taped down',
        'Coffee table taped',
        'Laundry top and washing machine cupboard taped',
        'Sliding doors closed at top and bottom and taped',
        'Shower head removed',
        'Shower door closed and taped',
        'Pull out bed slide taped closed',
        'Gas bottle hoses screwed into bottle',
        'External hatches, toolboxes and lockers closed and secured',
        'Awnings in closed and locked position and zip tied'
      ].map((label, i) => `
                 <p><i class="ph ${item[`caravanCheck_${i}`] === 'on' ? 'ph-check-square' : 'ph-square'}" style="color: ${item[`caravanCheck_${i}`] === 'on' ? 'var(--status-delivered-text)' : 'var(--text-tertiary)'};"></i> ${label}</p>
               `).join('')}
             </div>
          </div>
        </div>
        ` : ''
    }

      <div class="form-section print-photos hide-on-screen">
        <p><strong>Pre-Delivery Photographs:</strong></p>
        <div class="print-photo-grid">
          ${[
      'Chassis Number, Compliance Plate / VIN', 'Front Passenger Side Corner', 'Front',
      'Front Driver Side Corner', 'Driver Side', 'Rear Driver Side Corner',
      'Rear', 'Rear Passenger Side Corner', 'Passenger Side'
    ].map((label, i) => {
      if (item[`photo_${i}`]) {
        return `
                   <div class="print-photo-item">
                     <img src="${item[`photo_${i}`]}" alt="${label}" style="width: 100%; height: 250px; object-fit: contain; display: block; margin-bottom: 0.5rem; background: #fff; padding: 0.25rem; border: 1px solid var(--border-color);">
                     <p style="font-size: 0.75rem; margin: 0; font-weight: 500;">${label}</p>
                   </div>
                 `;
      }
      return '';
    }).join('')}
          ${(![0, 1, 2, 3, 4, 5, 6, 7, 8].some(i => item[`photo_${i}`])) ? '<p style="color: var(--text-tertiary); grid-column: 1 / -1; padding: 1rem; text-align: center; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">No photographs were uploaded for this record.</p>' : ''}
        </div>
      </div>

        ${item.status === 'Delivered' ? `
        <div class="form-section print-delivery hide-on-screen">
          <p><strong>Delivery Details:</strong></p>
          <div style="background: var(--bg-primary); border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color); padding: 1rem;">
             <p><strong>New Transit Damage:</strong> ${item.newTransitDamage || 'None reported'}</p>
             <p style="margin-top: 0.5rem;"><strong>Receiver Name:</strong> ${item.receiverName || 'N/A'}</p>
             ${item.receiverSignatureImg ? `
             <div style="margin-top: 0.5rem;">
               <p style="margin-bottom: 0.25rem;"><strong>Receiver Signature:</strong></p>
               <img src="${item.receiverSignatureImg}" style="height: 60px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white;">
             </div>` : `
             <p style="margin-top: 0.5rem;"><strong>Receiver Signature:</strong> <span style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;">${item.receiverSignature || item.signature || 'N/A'}</span></p>
             `}
             <p style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-color);"><strong>Driver Name:</strong> ${item.driverName || 'N/A'}</p>
             ${item.driverSignatureImg ? `
             <div style="margin-top: 0.5rem;">
               <p style="margin-bottom: 0.25rem;"><strong>Driver Signature:</strong></p>
               <img src="${item.driverSignatureImg}" style="height: 60px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white;">
             </div>` : `
             <p style="margin-top: 0.5rem;"><strong>Driver Signature:</strong> <span style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;">${item.driverSignature || 'N/A'}</span></p>
             `}
          </div>
        </div>` : ''
    }

        <div class="form-section print-history">
          <p><strong>Status History:</strong></p>
          <div style="background: var(--bg-primary); border-radius: var(--radius-sm); margin-top: 0.5rem; overflow: hidden; border: 1px solid var(--border-color);">
             <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
                <thead style="background: var(--bg-secondary);">
                   <tr>
                     <th style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color);">Date & Time</th>
                     <th style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color);">Status</th>
                   </tr>
                </thead>
                <tbody>
                   ${(item.history || [{ status: item.status, timestamp: item.createdAt }]).map(h => `
                     <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 0.75rem 1rem;">${new Date(h.timestamp).toLocaleString()}</td>
                        <td style="padding: 0.75rem 1rem;"><span class="status-badge status-${h.status.toLowerCase().replace(' ', '-')}">${h.status}</span></td>
                     </tr>
                   `).join('')}
                </tbody>
             </table>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 2rem;" class="no-print">
           <button class="btn no-print" style="background: var(--bg-tertiary);" onclick="navigate('dashboard')">Back</button>
           <div style="display: flex; gap: 1rem;">
             ${['Created', 'Collected', 'At Facility'].includes(item.status) ? `<button class="btn btn-icon no-print" onclick="promptVoidRecord('${id}')" title="Void Record" style="color: var(--status-voided-text); background: var(--status-voided-bg); border: 1px solid var(--status-voided-text);"><i class="ph ph-trash" style="font-size: 1.25rem;"></i></button>` : ''}
             <button class="btn btn-icon no-print" onclick="openPrintModal('${id}')" title="Print PDF Report"><i class="ph ph-printer" style="font-size: 1.25rem;"></i></button>
             <span class="no-print">${actionsHTML}</span>
           </div>
        </div>
      </div>
        `;
}

function openPrintModal(id) {
  const modalHTML = `
        <div class="modal-overlay" id="print-modal">
          <div class="modal-content">
            <div class="modal-header">
              <i class="ph ph-printer"></i> Select Sections to Print
            </div>
            <form id="print-options-form">
              <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="identifiable" checked> Identifiable Information</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="inspection" checked> Condition & Damage Report</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="photos" checked> Pre-Delivery Photos</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="checklist" checked> Asset Specific Checklist / information</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="signoff" checked> Sign Off</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="delivery" checked> Delivery Report</label>
                <label style="display: flex; align-items: center; gap: 0.5rem;"><input type="checkbox" name="history" checked> Status History</label>
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 1rem;">
                <button type="button" class="btn btn-icon" style="background: var(--bg-tertiary);" onclick="document.getElementById('modal-container').innerHTML = ''"><i class="ph ph-x"></i> Cancel</button>
                <button type="button" class="btn btn-primary" onclick="executePrint()"><i class="ph ph-printer"></i> Generate Report</button>
              </div>
            </form>
          </div>
    </div>
        `;
  document.getElementById('modal-container').innerHTML = modalHTML;
}

function executePrint() {
  const form = document.getElementById('print-options-form');
  const formData = new FormData(form);

  // Reset all hide classes first
  document.body.classList.remove('hide-identifiable', 'hide-inspection', 'hide-photos', 'hide-checklist', 'hide-signoff', 'hide-delivery', 'hide-history');

  if (!formData.has('identifiable')) document.body.classList.add('hide-identifiable');
  if (!formData.has('inspection')) document.body.classList.add('hide-inspection');
  if (!formData.has('photos')) document.body.classList.add('hide-photos');
  if (!formData.has('checklist')) document.body.classList.add('hide-checklist');
  if (!formData.has('signoff')) document.body.classList.add('hide-signoff');
  if (!formData.has('delivery')) document.body.classList.add('hide-delivery');
  if (!formData.has('history')) document.body.classList.add('hide-history');

  document.getElementById('modal-container').innerHTML = ''; // close modal

  // small delay for UI draw then print
  setTimeout(() => window.print(), 100);
}

window.openPrintModal = openPrintModal;
window.executePrint = executePrint;

function promptVoidRecord(id) {
  const modalHTML = `
        <div class="modal-overlay" id="void-modal">
          <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center; color: var(--status-created-text);">
              <i class="ph ph-warning-circle" style="font-size: 2rem;"></i>
            </div>
            <h3 style="margin-top: 1rem; margin-bottom: 0.5rem;">Void Record</h3>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Are you sure you want to void this record? This action will remove it from the active dashboard.</p>
            <div style="display: flex; justify-content: center; gap: 1rem;">
              <button class="btn" style="background: var(--bg-tertiary);" onclick="document.getElementById('modal-container').innerHTML = ''">Cancel</button>
              <button class="btn" style="background: var(--status-created-bg); color: var(--status-created-text); border: 1px solid var(--status-created-text);" onclick="executeVoid('${id}')">Yes, Void Record</button>
            </div>
          </div>
    </div>
        `;
  document.getElementById('modal-container').innerHTML = modalHTML;
}

function executeVoid(id) {
  document.getElementById('modal-container').innerHTML = ''; // close modal
  AppState.updateInspectionStatus(id, 'Voided');
  navigate('dashboard');
}

window.promptVoidRecord = promptVoidRecord;
window.executeVoid = executeVoid;

function closeBlockingModal() {
  const mc = document.getElementById('modal-container');
  if (mc) mc.innerHTML = '';
}

function updateStatus(id, newStatus) {
  const item = AppState.inspections.find(i => i.id === id);
  if (!item) return;

  // ── Stage 2: Moving from Collected → At Facility ───────────────────────────
  // Requires: Condition & Damage Report answered, at least 1 photo uploaded
  if (newStatus === 'At Facility' && item.status === 'Collected') {
    const missing = [];

    // 1. Damage report must be answered (hasDamage = 'Yes' or 'No')
    if (!item.hasDamage || (item.hasDamage !== 'Yes' && item.hasDamage !== 'No')) {
      missing.push('Condition & Damage Report — select Yes or No for visible damage in Edit Record');
    }

    // 2. ALL 9 mandatory photos must be uploaded
    const missingPhotos = getMissingPhotos(item);
    if (missingPhotos.length > 0) {
      const count = missingPhotos.length;
      missing.push(`Mandatory Pre-Delivery Photographs — ${count} of 9 photo${count !== 1 ? 's are' : ' is'} still missing: ${missingPhotos.join(', ')}`);
    }

    if (missing.length > 0) {
      const mc = document.getElementById('modal-container');
      mc.innerHTML = `
        <div class="modal-overlay" id="blocking-modal-overlay" onclick="closeBlockingModal()">
          <div class="modal-content" onclick="event.stopPropagation()" style="max-width:500px; width:90%;">
            <div class="modal-header" style="margin-bottom:1rem;">
              <i class="ph ph-warning-circle" style="font-size:1.5rem; color:#e53e3e;"></i>
              Cannot Move to At Facility
            </div>
            <p style="margin:0 0 1rem; font-size:0.85rem; color:var(--text-secondary);">The following must be completed before this record can progress:</p>
            <ul style="margin:0 0 1.5rem; padding:0; list-style:none; display:flex; flex-direction:column; gap:0.5rem;">
              ${missing.map(m => `
                <li style="display:flex; align-items:flex-start; gap:0.65rem; background:var(--bg-tertiary); border-radius:var(--radius-md); padding:0.65rem 0.75rem; font-size:0.83rem; color:var(--text-primary);">
                  <i class="ph ph-x-circle" style="color:#e53e3e; font-size:1.05rem; flex-shrink:0; margin-top:1px;"></i>
                  <span>${m}</span>
                </li>`).join('')}
            </ul>
            <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
              <button class="btn" onclick="closeBlockingModal()">Close</button>
              <button class="btn btn-primary" onclick="closeBlockingModal(); navigate('edit', {id:'${id}'})">
                <i class="ph ph-pencil-simple"></i> Edit Record
              </button>
            </div>
          </div>
        </div>`;
      return;
    }
  }

  AppState.updateInspectionStatus(id, newStatus);
  navigate('dashboard');
}

function generateDeliveryReportHTML(id) {
  const item = AppState.inspections.find(i => i.id === id);
  return `
        <div class="form-container">
        <h2 style="margin-bottom: 1.5rem;">Delivery Report for ${item.id}</h2>
        <form onsubmit="finishDelivery(event, '${id}')">
          <div class="form-section">
            <div class="form-group">
              <label class="form-label">Any new damage during transit?</label>
              <textarea class="form-control" name="newTransitDamage" placeholder="Note any issues. If none, leave blank."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Receiver Name</label>
              <input type="text" class="form-control" name="receiverName" required oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase())">
            </div>
            <div class="form-group">
              <label class="form-label">Receiver Signature (Type name to e-sign)</label>
              <input type="text" class="form-control" name="receiverSignature" style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;" required oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase())">
            </div>
            <div class="form-group">
              <label class="form-label">Driver Name</label>
              <input type="text" class="form-control" name="driverName" required oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase())">
            </div>
            <div class="form-group">
              <label class="form-label">Driver Signature (Type name to e-sign)</label>
              <input type="text" class="form-control" name="driverSignature" style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;" required oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase())">
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button type="button" class="btn" style="background: var(--bg-tertiary);" onclick="navigate('item-detail', {id: '${id}'})">Cancel</button>
            <button type="submit" class="btn btn-primary" style="background-color: var(--status-delivered-text);"><i class="ph ph-check-circle"></i> Confirm Delivery</button>
          </div>
        </form>
      </div >
        `;
}

function generateTransportsHTML() {
  const transports = AppState.transports;
  return `
        <div class="form-container" style="max-width: 100%; margin-bottom: 2rem;">
      <h2 class="form-section-title"><i class="ph ph-plus-circle"></i> Register New Transport</h2>
      <form id="transport-form">
        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label class="form-label">Truck Registration</label>
          <input type="text" id="transport-reg" class="form-control" placeholder="e.g. XV99SS" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()" required>
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn-primary"><i class="ph ph-plus"></i> Add Transport</button>
        </div>
      </form>
    </div >

        <div class="form-container" style="max-width: 100%;">
          <h2 class="form-section-title"><i class="ph ph-list-dashes"></i> Active Fleet</h2>
          ${transports.length === 0 ? '<p style="color: var(--text-tertiary);">No active transports registered.</p>' : `
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color);">
              <th style="padding: 1rem 0;">Registration</th>
              <th style="padding: 1rem 0; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${transports.map(t => `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem 0; font-weight: 500;">${t.reg}</td>
                <td style="padding: 1rem 0; text-align: right;">
                  <button class="btn btn-icon" style="color: var(--status-created-bg);" onclick="removeTransport('${t.id}')">
                    <i class="ph ph-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
        </div>
      `;
}

function setupTransportListeners() {
  const form = document.getElementById('transport-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const reg = document.getElementById('transport-reg').value.toUpperCase();

      AppState.addTransport({ reg });
      navigate('transports'); // re-render
    });
  }
}

window.removeTransport = function (id) {
  AppState.removeTransport(id);
  navigate('transports');
};

window.revertToCreated = function (id) {
  const item = AppState.inspections.find(i => i.id === id);
  if (item) {
    item.assignedTransport = null;
    AppState.updateInspectionStatus(id, 'Created');
    navigate('dashboard');
  }
};

window.finishDelivery = function (e, id) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  const receiverName = formData.get('receiverName') || '';
  const driverName = formData.get('driverName') || '';

  if (receiverName.trim().split(/\s+/).length < 2) {
    alert("Please enter both First and Last Name for the Receiver.");
    return;
  }
  if (driverName.trim().split(/\s+/).length < 2) {
    alert("Please enter both First and Last Name for the Driver.");
    return;
  }

  // Merge new delivery data onto existing item
  const item = AppState.inspections.find(i => i.id === id);
  if (item) {
    const data = Object.fromEntries(formData.entries());
    Object.assign(item, data);
  }

  AppState.updateInspectionStatus(id, 'Delivered');
  alert('Delivery completed successfully!');
  navigate('dashboard');
};

window.promptAssignTransport = function (id) {
  const item = AppState.inspections.find(i => i.id === id);
  if (!item) return;

  // ── Stage 3: At Facility → Assign to Transit ──────────────────────────────
  // Requires: damage report, all 9 photos, inspector sign-off,
  //           + vehicle-specific (odometer, keys) or caravan-specific (length, checklist)
  const missing = [];

  // 1. Damage report
  if (!item.hasDamage || (item.hasDamage !== 'Yes' && item.hasDamage !== 'No')) {
    missing.push('Condition & Damage Report — select Yes or No for visible damage');
  }

  // 2. All 9 mandatory photos
  const missingPhotos = getMissingPhotos(item);
  if (missingPhotos.length > 0) {
    const count = missingPhotos.length;
    missing.push(`Mandatory Pre-Delivery Photographs — ${count} of 9 photo${count !== 1 ? 's are' : ' is'} still missing: ${missingPhotos.join(', ')}`);
  }

  // 3. Inspector sign-off (both name and signature required)
  if (!item.inspectorName || !item.inspectorSignature) {
    const signParts = [];
    if (!item.inspectorName) signParts.push('Inspector Full Name');
    if (!item.inspectorSignature) signParts.push('Inspector Signature');
    missing.push(`Final Sign Off — missing: ${signParts.join(' and ')}`);
  }

  // 4. Vehicle-specific fields
  if (item.vehicleType === 'Vehicle') {
    if (!item.odometer) missing.push('Vehicle Details — Odometer Reading (km) required');
    if (!item.keys) missing.push('Vehicle Details — Keys Received count required');
  }

  // 5. Caravan-specific fields
  if (item.vehicleType === 'Caravan') {
    if (!item.caravanLength) missing.push('Caravan Transport Checklist — Caravan Length (m) required');
    // Check all 14 caravan checklist items
    const caravanCheckLabels = [
      'Every window checked',
      'Antenna is down and facing correct direction',
      'Roof hatches closed incl. shower',
      'All cupboards securely closed and taped (if required)',
      'Oven / cook top taped down',
      'Coffee table taped (if required)',
      'Laundry top and washing machine cupboard taped (if required)',
      'Sliding doors closed at top and bottom and taped',
      'Shower head removed',
      'Shower door closed and taped',
      'Pull out bed slide, check distance and tape closed slide with mattress',
      'Gas bottle hoses screwed into bottle',
      'External hatches, toolboxes and lockers closed and secured',
      'Awnings in closed and locked position and zip tied in place',
    ];
    const uncheckedItems = caravanCheckLabels.filter((_, i) => !item[`caravanCheck_${i}`] || item[`caravanCheck_${i}`] === 'false');
    if (uncheckedItems.length > 0) {
      missing.push(`Caravan Transport Checklist — ${uncheckedItems.length} item${uncheckedItems.length !== 1 ? 's' : ''} not ticked: ${uncheckedItems.join(', ')}`);
    }
  }

  if (missing.length > 0) {
    const mc = document.getElementById('modal-container');
    mc.innerHTML = `
      <div class="modal-overlay" id="blocking-modal-overlay" onclick="closeBlockingModal()">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width:540px; width:90%; max-height:80vh; overflow-y:auto;">
          <div class="modal-header" style="margin-bottom:1rem;">
            <i class="ph ph-warning-circle" style="font-size:1.5rem; color:#e53e3e;"></i>
            Cannot Assign to Transit
          </div>
          <p style="margin:0 0 1rem; font-size:0.85rem; color:var(--text-secondary);">The following must be completed in <strong>Edit Record</strong> before this asset can be assigned to transit:</p>
          <ul style="margin:0 0 1.5rem; padding:0; list-style:none; display:flex; flex-direction:column; gap:0.5rem;">
            ${missing.map(m => `
              <li style="display:flex; align-items:flex-start; gap:0.65rem; background:var(--bg-tertiary); border-radius:var(--radius-md); padding:0.65rem 0.75rem; font-size:0.83rem; color:var(--text-primary);">
                <i class="ph ph-x-circle" style="color:#e53e3e; font-size:1.05rem; flex-shrink:0; margin-top:1px;"></i>
                <span>${m}</span>
              </li>`).join('')}
          </ul>
          <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
            <button class="btn" onclick="closeBlockingModal()">Close</button>
            <button class="btn btn-primary" onclick="closeBlockingModal(); navigate('edit', {id:'${id}'})">
              <i class="ph ph-pencil-simple"></i> Edit Record
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  const transports = AppState.transports;
  if (transports.length === 0) {
    alert('You must register at least one Transport Truck first in the Manage Transport tab.');
    return;
  }

  const modalHtml = `
        <div class="modal-overlay">
          <div class="modal-content">
            <div class="modal-header">
              <i class="ph ph-truck"></i> Select Transport Vehicle
            </div>
            <div style="margin-bottom: 1.5rem;">
              <label class="form-label">Assign this asset to:</label>
              <select id="modal-transport-select" class="form-control" style="width: 100%;">
                <option value="">-- Choose Vehicle --</option>
                ${transports.map(t => `<option value="${t.reg}">${t.reg}</option>`).join('')}
              </select>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 1rem;">
              <button type="button" class="btn btn-icon" style="background: var(--bg-tertiary);" onclick="document.getElementById('modal-container').innerHTML = ''"><i class="ph ph-x"></i> Cancel</button>
              <button type="button" class="btn btn-primary" onclick="saveTransportAssignment('${id}')"><i class="ph ph-truck"></i> Assign</button>
            </div>
          </div>
    </div >
        `;
  document.getElementById('modal-container').innerHTML = modalHtml;
};

window.saveTransportAssignment = function (id) {
  const select = document.getElementById('modal-transport-select');
  const reg = select.value;
  if (reg) {
    document.getElementById('modal-container').innerHTML = '';
    AppState.updateInspectionStatus(id, 'In Transit', reg);
    navigate('dashboard');
  }
};

window.promptAssignPickUp = function (id) {
  const item = AppState.inspections.find(i => i.id === id);
  if (!item) return;

  const missing = [];
  if (!item.pickupAddress || item.pickupAddress === 'N/A') missing.push('Pick Up Address required');
  if (!item.bookingContact || item.bookingContact === 'N/A') missing.push('Booking Contact required');

  if (missing.length > 0) {
    const mc = document.getElementById('modal-container');
    mc.innerHTML = `
      <div class="modal-overlay" id="blocking-modal-overlay" onclick="closeBlockingModal()">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width:540px; width:90%;">
          <div class="modal-header" style="margin-bottom:1rem;">
            <i class="ph ph-warning-circle" style="font-size:1.5rem; color:#e53e3e;"></i>
            Cannot Assign for Pick-Up
          </div>
          <p style="margin:0 0 1rem; font-size:0.85rem; color:var(--text-secondary);">The following must be completed in <strong>Edit Record</strong> before this asset can be assigned for pick-up:</p>
          <ul style="margin:0 0 1.5rem; padding:0; list-style:none; display:flex; flex-direction:column; gap:0.5rem;">
            ${missing.map(m => `
              <li style="display:flex; align-items:flex-start; gap:0.65rem; background:var(--bg-tertiary); border-radius:var(--radius-md); padding:0.65rem 0.75rem; font-size:0.83rem; color:var(--text-primary);">
                <i class="ph ph-x-circle" style="color:#e53e3e; font-size:1.05rem; flex-shrink:0; margin-top:1px;"></i>
                <span>${m}</span>
              </li>`).join('')}
          </ul>
          <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
            <button class="btn" onclick="closeBlockingModal()">Close</button>
            <button class="btn btn-primary" onclick="closeBlockingModal(); navigate('edit', {id:'${id}'})">
              <i class="ph ph-pencil-simple"></i> Edit Record
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  const mc = document.getElementById('modal-container');
  const transportOptions = AppState.transports.map(t => `<option value="${t.reg}">${t.reg}</option>`).join('');

  mc.innerHTML = `
    <div class="modal-overlay" id="assign-pickup-modal" onclick="this.remove()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <i class="ph ph-truck"></i> Assign for Pick-Up
        </div>
        <div class="form-group">
          <label class="form-label">Select Transport Vehicle</label>
          <select id="assign-pickup-select" class="form-control">
            <option value="">-- Choose Vehicle --</option>
            ${transportOptions}
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
          <button class="btn" style="background: var(--bg-tertiary);" onclick="document.getElementById('assign-pickup-modal').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="savePickUpAssignment('${id}')">Confirm Assignment</button>
        </div>
      </div>
    </div>
  `;
};

window.savePickUpAssignment = function (id) {
  const select = document.getElementById('assign-pickup-select');
  const reg = select.value;
  if (reg) {
    document.getElementById('assign-pickup-modal').remove();
    AppState.updateInspectionStatus(id, 'Assigned Pick-up', reg);
    navigate('dashboard');
  }
};

window.initAddressAutocomplete = function () {
  const inputs = document.querySelectorAll('.address-autocomplete');
  if (!inputs.length) return;

  // Create a dropdown container
  let dropdown = document.getElementById('address-autocomplete-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'address-autocomplete-dropdown';
    dropdown.style.cssText = 'position: absolute; background: var(--bg-primary); border: 1px solid var(--border-color); border-top: none; width: calc(100% - 2px); max-height: 200px; overflow-y: auto; z-index: 1000; display: none; border-radius: 0 0 var(--radius-sm) var(--radius-sm); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);';
  }

  inputs.forEach(input => {
    // We need to wrap the input in a relative container if it isn't already
    const parent = input.parentElement;
    parent.style.position = 'relative';

    let timeoutId = null;

    input.addEventListener('focus', () => {
      parent.appendChild(dropdown);
    });

    input.addEventListener('input', function () {
      clearTimeout(timeoutId);
      const query = this.value;

      if (query.length < 5) {
        dropdown.style.display = 'none';
        return;
      }

      timeoutId = setTimeout(() => {
        // Nominatim free API search
        // Using q allows freeform queries. We append addressdetails=1.
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=au&addressdetails=1&limit=8`)
          .then(res => res.json())
          .then(data => {
            dropdown.innerHTML = '';
            if (data.length > 0) {
              data.forEach(place => {
                const div = document.createElement('div');
                div.style.cssText = 'padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 0.9rem;';
                div.textContent = place.display_name;

                div.addEventListener('mouseover', () => div.style.background = 'var(--bg-secondary)');
                div.addEventListener('mouseout', () => div.style.background = 'transparent');

                div.addEventListener('click', () => {
                  const addr = place.address;

                  const stateMap = {
                    'New South Wales': 'NSW', 'Victoria': 'VIC', 'Queensland': 'QLD',
                    'Western Australia': 'WA', 'South Australia': 'SA', 'Tasmania': 'TAS',
                    'Australian Capital Territory': 'ACT', 'Northern Territory': 'NT'
                  };

                  let streetNumber = addr.house_number || '';
                  const road = addr.road || '';
                  const suburb = addr.suburb || addr.city_district || addr.town || addr.village || addr.city || '';
                  const rawState = addr.state || '';
                  const state = stateMap[rawState] || rawState;
                  const postcode = addr.postcode || '';

                  if (!streetNumber && road) {
                    const match = place.display_name.match(/^(\d+[a-zA-Z]?(-[a-zA-Z0-9]+)?)\s*,?\s*([^,]+)/);
                    if (match) {
                      streetNumber = match[1];
                    }
                  }

                  let cleanString = '';
                  if (streetNumber && road) cleanString += `${streetNumber} ${road}, `;
                  else if (road) cleanString += `${road}, `;

                  cleanString += `${suburb} ${state} ${postcode}`.trim();

                  input.value = cleanString || place.display_name;
                  dropdown.style.display = 'none';
                });
                dropdown.appendChild(div);
              });
              dropdown.style.display = 'block';
            } else {
              dropdown.style.display = 'none';
            }
          })
          .catch(err => {
            console.error('Geocoder failed:', err);
            dropdown.style.display = 'none';
          });
      }, 400); // 400ms debounce
    });
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.classList.contains('address-autocomplete') && e.target.parentElement !== dropdown) {
      dropdown.style.display = 'none';
    }
  });
};

window.updateStatus = updateStatus;
window.navigate = navigate;

// UI Handlers Export to Window
window.toggleColumnFilterPanel = toggleColumnFilterPanel;
window.applyColumnFilter = applyColumnFilter;
window.toggleManageRecords = toggleManageRecords;
window.navigateStatus = navigateStatus;
window.toggleTheme = toggleTheme;

// Helper to load some data
function seedMockData() {
  const now = new Date();
  const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72 hours ago

  // Seed recent items
  AppState.addInspection({ vehicleType: 'Caravan', identifier: 'Jayco Silverline', damageNotes: 'None' });
  AppState.updateInspectionStatus(AppState.inspections[0].id, 'In Transit');

  setTimeout(() => {
    AppState.addInspection({ vehicleType: 'Boat', identifier: 'Quintrex 420', damageNotes: 'Scrape on hull' });
    AppState.updateInspectionStatus(AppState.inspections[0].id, 'At Facility');
  }, 100);

  setTimeout(() => {
    AppState.addInspection({ vehicleType: 'Vehicle', identifier: 'Toyota Hilux - ABC123', damageNotes: 'Minor dent front left' });
  }, 200);

  setTimeout(() => {
    // Seed old items
    const oldDelivered = AppState.addInspection({ vehicleType: 'Vehicle', identifier: 'Old Delivered Test', damageNotes: 'None' });
    const oldCreated = AppState.addInspection({ vehicleType: 'Caravan', identifier: 'Old Created Test', damageNotes: 'None' });

    // Override their createdAt locally bypassing the addInspection wrapper slightly
    AppState.inspections.find(i => i.id === oldDelivered.id).createdAt = oldDate;
    AppState.inspections.find(i => i.id === oldCreated.id).createdAt = oldDate;

    AppState.updateInspectionStatus(oldDelivered.id, 'Delivered');
    AppState.savePreferences();
  }, 300);
}

function initSignaturePad(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Set white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    const pos = getMousePos(e);
    lastX = pos.x;
    lastY = pos.y;
    canvas.dataset.hasSignature = "true";
    canvas.parentElement.style.border = '';

    // Clear custom validity on the hidden input if it exists
    const hiddenInput = document.getElementById(canvasId.replace('-pad', '-validation'));
    if (hiddenInput) {
      hiddenInput.setCustomValidity('');
    }
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getMousePos(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDrawing);

  // Initialize flag
  canvas.dataset.hasSignature = "false";
}

function clearSignature(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.hasSignature = "false";
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
