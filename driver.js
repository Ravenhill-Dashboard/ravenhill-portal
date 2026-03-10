// Standalone Driver App State (Firebase/Firestore)
const DriverState = {
  currentReg: localStorage.getItem('driverReg') || null,
  inspections: [],
  currentUser: null,

  getAssignedItems() {
    const normalizedReg = (this.currentReg || '').toLowerCase().trim();
    if (!normalizedReg) return [];

    return this.inspections.filter(i => {
      // Driver sees both In Transit and Assigned Pick-up
      if (i.status !== 'In Transit' && i.status !== 'Assigned Pick-up') return false;
      const assigned = (i.assignedTransport || '').toLowerCase().trim();
      return assigned === normalizedReg;
    });
  }
};

let manifestListener = null;

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('driver-login-form');
  const regInput = document.getElementById('reg-input');
  const loginError = document.getElementById('login-error');

  // Load saved reg if exists
  if (DriverState.currentReg) {
    regInput.value = DriverState.currentReg;
  }

  // Auth State Listener
  auth.onAuthStateChanged(user => {
    if (user) {
      DriverState.currentUser = user;
      if (DriverState.currentReg) {
        showManifest();
      } else {
        showLogin();
      }
    } else {
      DriverState.currentUser = null;
      showLogin();
      stopManifestSync();
    }
  });

  // Format registration to uppercase dynamically
  regInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const reg = regInput.value.trim();

    loginError.style.display = 'none';

    if (!reg) {
      loginError.textContent = "Please enter your Vehicle Registration.";
      loginError.style.display = 'block';
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, password);
      DriverState.currentReg = reg;
      localStorage.setItem('driverReg', reg);
      showManifest();
    } catch (error) {
      loginError.textContent = error.message;
      loginError.style.display = 'block';
    }
  });
});

function showLogin() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('manifest-view').style.display = 'none';
  document.getElementById('delivery-view').style.display = 'none';
}

function startManifestSync() {
  stopManifestSync();
  manifestListener = db.collection('inspections')
    .onSnapshot(snapshot => {
      DriverState.inspections = snapshot.docs.map(doc => doc.data());
      if (document.getElementById('manifest-view').style.display === 'block') {
        renderManifestList();
      }
    });
}

function stopManifestSync() {
  if (manifestListener) manifestListener();
  manifestListener = null;
}

function showManifest() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('delivery-view').style.display = 'none';
  document.getElementById('manifest-view').style.display = 'block';

  document.getElementById('manifest-title').textContent = `Manifest: ${DriverState.currentReg}`;

  startManifestSync();
  renderManifestList();
}

function renderManifestList() {
  const items = DriverState.getAssignedItems();
  const list = document.getElementById('manifest-list');

  if (items.length === 0) {
    list.innerHTML = `
      <div class="form-container" style="text-align: center; padding: 2rem 1rem;">
        <i class="ph ph-package" style="font-size: 3rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
        <h3 style="color: var(--text-secondary); margin-bottom: 0.5rem;">Manifest Empty</h3>
        <p style="color: var(--text-tertiary);">No assets strictly assigned to truck <strong>${DriverState.currentReg}</strong> are currently In Transit or awaiting pick-up.</p>
      </div>
    `;
    return;
  }

  const pickups = items.filter(i => i.status === 'Assigned Pick-up');
  const deliveries = items.filter(i => i.status === 'In Transit');

  const renderCard = (item) => {
    const isPickUp = item.status === 'Assigned Pick-up';
    const actionFunc = isPickUp ? `openPickUpReport('${item.id}')` : `openDeliveryReport('${item.id}')`;
    const labelColor = isPickUp ? 'var(--status-transit-text)' : 'var(--status-delivered-text)';
    const labelBg = isPickUp ? 'var(--status-transit-bg)' : 'var(--status-delivered-bg)';

    // Bold larger text with Type - Make & Model and Identifier
    const makeModelStr = item.make ? `${item.make} ${item.model || ''}` : 'N/A';
    const title = `${item.vehicleType} - ${makeModelStr} - ${item.identifier}`;

    return `
      <div class="form-container" style="cursor: pointer; position: relative; min-height: 180px; display: flex; flex-direction: column;" onclick="${actionFunc}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; gap: 1rem;">
          <div style="font-size: 1.25rem; font-weight: 800; line-height: 1.2;">${title}</div>
          <span style="font-size: 0.7rem; font-weight: 700; color: ${labelColor}; background: ${labelBg}; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap;">${isPickUp ? 'PICK-UP' : 'DELIVERY'}</span>
        </div>
        
        <div style="color: var(--text-tertiary); font-size: 0.85rem; margin-bottom: 1rem; font-weight: 600;">ID: ${item.id}</div>
        
        <div style="margin-top: auto;">
          ${isPickUp ? `
            <div style="margin-bottom: 0.4rem;">
              <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 700;">Booking Date & Time</div>
              <div style="font-weight: 600; color: var(--text-primary);">${item.bookedCollectionTime ? new Date(item.bookedCollectionTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</div>
            </div>
            <div style="margin-bottom: 0.4rem;">
              <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 700;">Booking Contact</div>
              <div style="font-weight: 600; color: var(--text-primary);">${item.bookingContact || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 700;">Pick Up Address</div>
              <div style="font-size: 0.9rem; color: var(--text-secondary);">${item.pickupAddress || 'No Address'}</div>
            </div>
          ` : `
            <div style="margin-bottom: 0.4rem;">
              <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 700;">Customer/Receiver</div>
              <div style="font-weight: 600; color: var(--text-primary);">${item.receiverName || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; font-weight: 700;">Delivery Address</div>
              <div style="font-size: 0.9rem; color: var(--text-secondary);">${item.deliveryAddress || 'No Address'}</div>
            </div>
          `}
        </div>
      </div>
    `;
  };

  list.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
      <div id="deliveries-column">
        <h4 style="margin-bottom: 1rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="ph ph-truck"></i> Deliveries (${deliveries.length})
        </h4>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${deliveries.length > 0 ? deliveries.map(renderCard).join('') : '<p style="color: var(--text-tertiary); font-size: 0.9rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">No active deliveries</p>'}
        </div>
      </div>
      <div id="pickups-column">
        <h4 style="margin-bottom: 1rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="ph ph-hand-grabbing"></i> Pickups (${pickups.length})
        </h4>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${pickups.length > 0 ? pickups.map(renderCard).join('') : '<p style="color: var(--text-tertiary); font-size: 0.9rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px dashed var(--border-color);">No active pickups</p>'}
        </div>
      </div>
    </div>
  `;
}

function openDeliveryReport(id) {
  document.getElementById('manifest-view').style.display = 'none';
  const deliveryView = document.getElementById('delivery-view');
  deliveryView.style.display = 'block';

  const item = DriverState.inspections.find(i => i.id === id);
  if (!item) return;

  const hasBeenPickedUp = item.history && item.history.some(h => h.status === 'Collected');

  deliveryView.innerHTML = `
    <div class="form-container">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-icon" onclick="showManifest()"><i class="ph ph-arrow-left"></i></button>
          <h2 style="margin: 0;">Deliver ${item.identifier}</h2>
        </div>
        ${hasBeenPickedUp ? `
          <button class="btn btn-holding" style="background: var(--status-holding-bg); color: var(--status-holding-text); border: 1px solid var(--status-holding-text); font-size: 0.8rem;" onclick="markAtFacility('${id}')">
            <i class="ph ph-package"></i> Book into Facility
          </button>
        ` : ''}
      </div>
      <form onsubmit="submitDelivery(event, '${id}')" id="delivery-form-${id}" data-id="${id}">
        <div class="form-group">
          <label class="form-label">Any new damage during transit?</label>
          <textarea class="form-control" name="newTransitDamage" placeholder="Note any issues. If none, leave blank."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Receiver Name</label>
          <input type="text" class="form-control" name="receiverName" id="receiverNameInput" required value="" oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase()); this.setCustomValidity(''); this.style.border='';">
        </div>
        <div class="form-group">
          <label class="form-label">Receiver Signature</label>
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white; overflow: hidden; touch-action: none;">
            <canvas id="receiver-signature-pad" width="400" height="150" style="width: 100%; height: 150px; display: block;"></canvas>
          </div>
          <button type="button" class="btn" style="background: var(--bg-tertiary); font-size: 0.75rem; margin-top: 0.5rem;" onclick="clearSignature('receiver-signature-pad')">Clear Signature</button>
        </div>
        <div class="form-group" style="margin-top: 2rem; border-top: 1px dashed var(--border-color); padding-top: 1.5rem;">
          <label class="form-label">Driver Name</label>
          <input type="text" class="form-control" name="driverName" id="driverNameInput" required value="" oninput="this.value = this.value.replace(/\\b\\w/g, c => c.toUpperCase()); this.setCustomValidity(''); this.style.border='';">
        </div>
        <div class="form-group">
          <label class="form-label">Driver Signature</label>
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: white; overflow: hidden; touch-action: none;">
            <canvas id="driver-signature-pad" width="400" height="150" style="width: 100%; height: 150px; display: block;"></canvas>
          </div>
          <button type="button" class="btn" style="background: var(--bg-tertiary); font-size: 0.75rem; margin-top: 0.5rem;" onclick="clearSignature('driver-signature-pad')">Clear Signature</button>
        </div>
        <input type="hidden" name="receiverSignatureImg" id="receiver-signature-data">
        <input type="hidden" name="driverSignatureImg" id="driver-signature-data">
        <button type="submit" class="btn btn-primary" style="width: 100%; background-color: var(--status-delivered-text); margin-top: 1.5rem;"><i class="ph ph-check-circle"></i> Complete Delivery Handover</button>
      </form>
    </div>
  `;

  // Initialize signature pads
  setTimeout(() => {
    initSignaturePad('receiver-signature-pad');
    initSignaturePad('driver-signature-pad');
  }, 50);
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
    e.preventDefault(); // Prevent scrolling on touch devices

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
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);

  // Mark empty initially
  canvas.dataset.hasSignature = "false";
}

window.clearSignature = function (canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.hasSignature = "false";
};

window.handlePhotoUpload = function (input) {
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    const reader = new FileReader();
    const span = input.parentElement.querySelector('.upload-text');

    if (span) {
      span.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Compressing...';
    }

    reader.onload = async function (e) {
      try {
        const compressedBase64 = await compressImage(e.target.result, 1200, 0.7);

        if (span) {
          span.innerHTML = `<i class="ph ph-check-circle"></i> Uploaded ✓`;
          input.parentElement.style.background = 'rgba(22,163,74,0.08)';
          input.parentElement.style.borderColor = '#16a34a';
          span.style.color = '#16a34a';
        }
        input.dataset.base64 = compressedBase64;

        // BACKGROUND AUTO-SAVE: If we have an ID, save this photo immediately to Firestore
        const recordId = input.closest('form')?.dataset.id;
        if (recordId) {
          const fieldName = input.name;
          await db.collection('inspections').doc(recordId).update({
            [fieldName]: compressedBase64,
            updatedAt: new Date().toISOString()
          });
          console.log(`Auto-saved ${fieldName} for ${recordId}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
        if (span) span.innerHTML = '<i class="ph ph-warning"></i> Error';
      }
    };
    reader.readAsDataURL(file);
  }
};

function compressImage(base64, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
  });
}

window.markAtFacility = async function (id) {
  const item = DriverState.inspections.find(i => i.id === id);
  if (item) {
    const hasBeenPickedUp = item.history && item.history.some(h => h.status === 'Collected');
    if (!hasBeenPickedUp) {
      alert("This item cannot be booked into a facility because it did not originate from a pick-up.");
      return;
    }

    const timestamp = new Date().toISOString();
    const updateData = {
      status: 'At Facility',
      assignedTransport: null,
      updatedAt: timestamp,
      statusChangedAt: timestamp
    };

    if (!item.history) item.history = [];
    const newHistory = [...item.history];
    newHistory.push({ status: 'In Facility', timestamp: timestamp });
    updateData.history = newHistory;

    await db.collection('inspections').doc(id).update(updateData);

    alert('Asset marked as At Facility and removed from manifest.');
    showManifest();
  }
};

window.openPickUpReport = function (id) {
  document.getElementById('manifest-view').style.display = 'none';
  const deliveryView = document.getElementById('delivery-view');
  deliveryView.style.display = 'block';

  const item = DriverState.inspections.find(i => i.id === id);
  if (!item) return;

  const labels = ['Chassis Number, Compliance Plate / VIN', 'Front Passenger Side Corner', 'Front', 'Front Driver Side Corner', 'Driver Side', 'Rear Driver Side Corner', 'Rear', 'Rear Passenger Side Corner', 'Passenger Side'];

  deliveryView.innerHTML = `
    <div class="form-container">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-icon" onclick="showManifest()"><i class="ph ph-arrow-left"></i></button>
          <h2 style="margin: 0;">Pick Up ${item.identifier}</h2>
        </div>
      </div>
      
      <form onsubmit="submitPickUp(event, '${id}')" data-id="${id}">
        <div class="form-section">
          <h3 class="form-section-title"><i class="ph ph-warning-circle"></i> Damage Report</h3>
          <div class="form-group">
            <label class="form-label">Are there any visible scratches, dents or marks?</label>
            <div style="display: flex; gap: 1.5rem;">
              <label><input type="radio" name="hasDamage" value="Yes" required> Yes</label>
              <label><input type="radio" name="hasDamage" value="No"> No</label>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Existing damage notes</label>
            <textarea class="form-control" name="damageNotes">${(item.damageNotes && item.damageNotes !== 'None') ? item.damageNotes : ''}</textarea>
          </div>
        </div>

        <div class="form-section">
          <h3 class="form-section-title"><i class="ph ph-camera"></i> Mandatory Photos</h3>
          <div style="display: grid; gap: 0.75rem;">
            ${labels.map((label, i) => `
              <div style="border: 1px dashed var(--border-color); border-radius: 8px; padding: 0.75rem; background: var(--bg-primary);">
                <div style="font-size: 0.85rem; margin-bottom: 0.4rem;">${label}</div>
                <label class="btn btn-icon" style="background: var(--bg-tertiary); width: 100%; border-radius: 4px; padding: 0.5rem; cursor: pointer; display: inline-block; border: 1px solid transparent; transition: all 0.2s;">
                  <input type="file" accept="image/*" style="display: none;" onchange="window.handlePhotoUpload(this)" name="photo_${i}" required>
                  <span class="upload-text" style="color: var(--text-secondary);"><i class="ph ph-upload-simple"></i> Upload</span>
                </label>
              </div>
            `).join('')}
          </div>
        </div>

        ${item.vehicleType === 'Vehicle' ? `
          <div class="form-section">
            <h3 class="form-section-title"><i class="ph ph-car"></i> Vehicle Details</h3>
            <div class="form-group">
              <label class="form-label">Odometer Reading (km)</label>
              <input type="number" class="form-control" name="odometer" required>
            </div>
            <div class="form-group">
              <label class="form-label">Keys Received</label>
              <input type="number" class="form-control" name="keys" required>
            </div>
          </div>
        ` : ''}

        ${item.vehicleType === 'Caravan' ? `
          <div class="form-section">
            <h3 class="form-section-title"><i class="ph ph-clipboard-text"></i> Caravan Checklist</h3>
            <div class="form-group">
              <label class="form-label">Caravan Length (m)</label>
              <input type="number" step="0.1" class="form-control" name="caravanLength" required>
            </div>
            <div style="display: grid; gap: 0.5rem;">
              ${[
        'Every window checked', 'Antenna is down', 'Roof hatches closed', 'Cupboards closed & taped',
        'Oven/cook top taped', 'Coffee table taped', 'Laundry/washer taped', 'Sliding doors taped',
        'Shower head removed', 'Shower door taped', 'Bed slide taped', 'Gas bottles secured',
        'External hatches locked', 'Awnings locked & zip tied'
      ].map((label, i) => `
                <label style="display: flex; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" name="caravanCheck_${i}"> ${label}
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="form-section">
          <h3 class="form-section-title"><i class="ph ph-signature"></i> Driver Sign Off</h3>
          <div class="form-group">
            <label class="form-label">Your Full Name</label>
            <input type="text" class="form-control" name="inspectorName" required>
          </div>
          <div class="form-group">
            <label class="form-label">Signature (Type name)</label>
            <input type="text" class="form-control" name="inspectorSignature" style="font-family: 'Brush Script MT', cursive; font-size: 1.25rem;" required>
          </div>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;"><i class="ph ph-check-circle"></i> Complete Pick Up</button>
      </form>
    </div>
  `;
};

window.submitPickUp = async function (e, id) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  const fileInputs = e.target.querySelectorAll('input[type="file"]');
  fileInputs.forEach(input => {
    if (input.dataset.base64) {
      data[input.name] = input.dataset.base64;
    }
  });

  const checkboxes = e.target.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    data[cb.name] = cb.checked ? 'on' : 'false';
  });

  const item = DriverState.inspections.find(i => i.id === id);
  if (item) {
    const timestamp = new Date().toISOString();
    const updateData = {
      ...data,
      status: 'In Transit',
      updatedAt: timestamp,
      statusChangedAt: timestamp
    };

    // Remove any raw File objects from photos that might have been picked up by FormData
    Object.keys(updateData).forEach(key => {
      if (key.startsWith('photo_') && typeof updateData[key] !== 'string') {
        delete updateData[key];
      }
    });

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Saving...';
    }

    try {
      if (!item.history) item.history = [];
      const newHistory = [...item.history];
      newHistory.push({ status: 'Collected', timestamp: timestamp });
      newHistory.push({ status: `In Transit (Truck: ${DriverState.currentReg})`, timestamp: timestamp });
      updateData.history = newHistory;

      await db.collection('inspections').doc(id).update(updateData);

      alert('Pick Up completed! Item is now In Transit.');
      document.getElementById('delivery-view').innerHTML = ''; // Clear stale form
      showManifest();
    } catch (err) {
      console.error(err);
      alert('Failed to save pickup. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-check-circle"></i> Complete Pick Up';
      }
    }
  }
};

window.submitDelivery = async function (e, id) {
  e.preventDefault();

  const receiverCanvas = document.getElementById('receiver-signature-pad');
  const driverCanvas = document.getElementById('driver-signature-pad');
  const form = e.target;
  const receiverInput = form.elements['receiverName'];
  const driverInput = form.elements['driverName'];

  // Reset custom validity messages
  receiverInput.setCustomValidity('');
  driverInput.setCustomValidity('');

  // We need a hidden input for the required signature validation popups
  let receiverSigInput = document.getElementById('receiver-signature-validation');
  if (!receiverSigInput) {
    receiverSigInput = document.createElement('input');
    receiverSigInput.type = 'text';
    receiverSigInput.id = 'receiver-signature-validation';
    receiverSigInput.style.opacity = 0;
    receiverSigInput.style.position = 'absolute';
    receiverSigInput.style.height = '0';
    receiverSigInput.style.width = '0';
    receiverSigInput.style.pointerEvents = 'none';
    receiverCanvas.parentElement.appendChild(receiverSigInput);
  }

  let driverSigInput = document.getElementById('driver-signature-validation');
  if (!driverSigInput) {
    driverSigInput = document.createElement('input');
    driverSigInput.type = 'text';
    driverSigInput.id = 'driver-signature-validation';
    driverSigInput.style.opacity = 0;
    driverSigInput.style.position = 'absolute';
    driverSigInput.style.height = '0';
    driverSigInput.style.width = '0';
    driverSigInput.style.pointerEvents = 'none';
    driverCanvas.parentElement.appendChild(driverSigInput);
  }

  receiverSigInput.setCustomValidity('');
  driverSigInput.setCustomValidity('');

  // Reset visual errors
  receiverInput.style.border = '';
  driverInput.style.border = '';
  receiverCanvas.parentElement.style.border = '1px solid var(--border-color)';
  driverCanvas.parentElement.style.border = '1px solid var(--border-color)';

  let hasErrors = false;

  const formData = new FormData(form);
  const receiverName = formData.get('receiverName') || '';
  const driverName = formData.get('driverName') || '';

  if (receiverName.trim().split(/\s+/).length < 2) {
    receiverInput.style.border = '2px solid var(--status-created-bg)';
    receiverInput.setCustomValidity("Please enter both First and Last Name for the Receiver.");
    hasErrors = true;
  }

  if (driverName.trim().split(/\s+/).length < 2) {
    driverInput.style.border = '2px solid var(--status-created-bg)';
    driverInput.setCustomValidity("Please enter both First and Last Name for the Driver.");
    hasErrors = true;
  }

  if (receiverCanvas.dataset.hasSignature === "false") {
    receiverCanvas.parentElement.style.border = '2px solid var(--status-created-bg)';
    receiverSigInput.setCustomValidity("Receiver signature is required.");
    hasErrors = true;
  }

  if (driverCanvas.dataset.hasSignature === "false") {
    driverCanvas.parentElement.style.border = '2px solid var(--status-created-bg)';
    driverSigInput.setCustomValidity("Driver signature is required.");
    hasErrors = true;
  }

  if (hasErrors) {
    form.reportValidity();
    return;
  }

  document.getElementById('receiver-signature-data').value = receiverCanvas.toDataURL('image/png');
  document.getElementById('driver-signature-data').value = driverCanvas.toDataURL('image/png');

  const data = Object.fromEntries(formData.entries());

  const item = DriverState.inspections.find(i => i.id === id);
  if (item) {
    const timestamp = new Date().toISOString();
    const updateData = {
      ...data,
      status: 'Delivered',
      updatedAt: timestamp
    };

    // Remove raw Files
    Object.keys(updateData).forEach(key => {
      if (key.startsWith('photo_') && typeof updateData[key] !== 'string') {
        delete updateData[key];
      }
    });

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Delivering...';
    }

    try {
      if (!item.history) item.history = [];
      const newHistory = [...item.history];
      newHistory.push({ status: 'Delivered', timestamp: timestamp });
      updateData.history = newHistory;

      await db.collection('inspections').doc(id).update(updateData);

      alert('Delivery completed successfully! Item cleared from manifest.');
      document.getElementById('delivery-view').innerHTML = ''; // Clear stale form
      showManifest(); // refresh manifest
    } catch (err) {
      console.error(err);
      alert('Failed to complete delivery. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-check-circle"></i> Complete Delivery Handover';
      }
    }
  }
};

window.logoutDriver = async function () {
  try {
    await auth.signOut();
    DriverState.currentReg = null;
    localStorage.removeItem('driverReg');
    document.getElementById('manifest-view').style.display = 'none';
    document.getElementById('delivery-view').style.display = 'none';
    document.getElementById('login-view').style.display = 'block';
  } catch (error) {
    console.error("Logout Error:", error);
  }
};
