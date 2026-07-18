/* =============================================
   THE PINK CHRONICLES — script.js
   Supabase-powered admin dashboard
   ============================================= */

/* ---------- Supabase client ---------- */
const SUPABASE_URL = "https://dvvftwxttdffsrhevxwv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zEkGaekQbViTETnWU_GdTQ_3xgPq...";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- App state ---------- */
let episodesCache = [];
let membersCache = [];
let notifications = [];
let unreadNotifCount = 0;
let selectedFile = null;
let selectedFileType = null; // 'video' | 'audio'
let confirmCallback = null;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Defensive fixes for a couple of markup quirks:
  // - #notifPanel and #loginError have no default-hidden style in the CSS,
  //   so we force them closed on load and only reveal them via JS.
  document.getElementById('notifPanel').classList.add('hidden');
  document.getElementById('loginError').style.display = 'none';

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await enterDashboard();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      document.getElementById('dashboard').classList.add('hidden');
      document.getElementById('loginScreen').classList.remove('hidden');
    }
  });

  setupRealtime();
}

async function enterDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const nameEl = document.querySelector('.sidebar-user-name');
    if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;
  }

  await loadAllData();
}

/* ============================================================
   AUTH
   ============================================================ */
function togglePassword() {
  const input = document.getElementById('loginPassword');
  const icon = document.getElementById('pwEyeIcon');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  icon.classList.toggle('fa-eye', showing);
  icon.classList.toggle('fa-eye-slash', !showing);
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorBox = document.getElementById('loginError');
  const errorMsg = document.getElementById('loginErrorMsg');
  errorBox.style.display = 'none';

  if (!email || !password) {
    errorMsg.textContent = 'Please enter both email and password.';
    errorBox.style.display = 'flex';
    return;
  }

  const btn = document.querySelector('.btn-login');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SIGNING IN…';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.innerHTML = originalHtml;

  if (error) {
    errorMsg.textContent = error.message || 'Incorrect email or password.';
    errorBox.style.display = 'flex';
    return;
  }

  await enterDashboard();
}

async function handleLogout() {
  await sb.auth.signOut();
  location.reload();
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function switchTab(tabName, btnEl) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btnEl.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  const titles = {
    overview: 'Overview', upload: 'Upload Media', episodes: 'Episodes',
    community: 'Community', settings: 'Settings'
  };
  document.getElementById('topbarTitle').textContent = titles[tabName] || tabName;

  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderNotifList();
}

function clearNotifs() {
  notifications.forEach(n => n.read = true);
  unreadNotifCount = 0;
  updateNotifBadge();
  renderNotifList();
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (unreadNotifCount > 0) {
    badge.textContent = unreadNotifCount > 9 ? '9+' : unreadNotifCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function pushNotification(icon, text) {
  notifications.unshift({ icon, text, read: false, time: new Date() });
  notifications = notifications.slice(0, 20);
  unreadNotifCount++;
  updateNotifBadge();
}

function renderNotifList() {
  const list = document.getElementById('notifList');
  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item">
      <i class="fa-solid ${n.icon}"></i>
      <div>
        <div>${escapeHtml(n.text)}</div>
        <div style="font-size:.68rem;color:var(--gray);margin-top:2px;">${timeAgo(n.time)}</div>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${escapeHtml(message)}</span>`;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function showConfirm(title, msg, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
  document.getElementById('confirmOkBtn').onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  };
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

/* ============================================================
   DATA LOADING
   ============================================================ */
async function loadAllData() {
  await Promise.all([loadEpisodes(), loadMembers(), loadSettings()]);
  renderOverviewStats();
  renderRecentUploads();
  renderRecentMembers();
}

async function loadEpisodes() {
  const { data, error } = await sb.from('episodes').select('*').order('created_at', { ascending: false });
  if (error) { showToast('Failed to load episodes: ' + error.message, 'error'); return; }
  episodesCache = data || [];
  renderEpisodes(episodesCache);
}

async function loadMembers() {
  const { data, error } = await sb.from('members').select('*').order('joined_at', { ascending: false });
  if (error) { showToast('Failed to load members: ' + error.message, 'error'); return; }
  membersCache = data || [];
  renderMembers(membersCache);
}

async function loadSettings() {
  const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
  if (error || !data) return;

  setVal('settingName', data.podcast_name);
  setVal('settingHost', data.host_name);
  setVal('settingTagline', data.tagline);
  setVal('settingUrl', data.website_url);

  const socialInputs = document.querySelectorAll('#tab-settings .social-field input');
  socialInputs.forEach(input => {
    const ph = (input.placeholder || '').toLowerCase();
    if (ph.includes('instagram')) input.value = data.instagram_url || '';
    else if (ph.includes('tiktok')) input.value = data.tiktok_url || '';
    else if (ph.includes('spotify')) input.value = data.spotify_url || '';
    else if (ph.includes('youtube')) input.value = data.youtube_url || '';
  });
}

/* ============================================================
   OVERVIEW
   ============================================================ */
function renderOverviewStats() {
  document.getElementById('statEpisodes').textContent = episodesCache.length;
  document.getElementById('statMembers').textContent = membersCache.filter(m => m.status !== 'inactive').length;
  document.getElementById('statVideos').textContent = episodesCache.filter(e => e.type === 'video').length;
  document.getElementById('statAudios').textContent = episodesCache.filter(e => e.type === 'audio').length;
}

function renderRecentUploads() {
  const wrap = document.getElementById('recentUploads');
  const recent = episodesCache.slice(0, 5);
  if (!recent.length) {
    wrap.innerHTML = '<p class="empty-state"><i class="fa-regular fa-folder-open"></i><br>No uploads yet. Go to <strong>Upload Media</strong> to get started.</p>';
    return;
  }
  wrap.innerHTML = recent.map(ep => `
    <div class="ep-admin-card">
      <div class="ep-admin-num">EP<br>${ep.number ?? '—'}</div>
      <div class="ep-admin-info">
        <div class="ep-admin-title">${escapeHtml(ep.title)}</div>
        <div class="ep-admin-meta">
          <span><i class="fa-regular fa-calendar"></i>${formatDate(ep.air_date || ep.created_at)}</span>
          <span class="ep-admin-type-badge ${ep.type}"><i class="fa-solid fa-${ep.type === 'video' ? 'video' : 'music'}"></i>${ep.type}</span>
          ${ep.topic ? `<span class="ep-admin-topic-badge">${escapeHtml(ep.topic)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderRecentMembers() {
  const wrap = document.getElementById('recentMembers');
  const recent = membersCache.slice(0, 5);
  if (!recent.length) {
    wrap.innerHTML = '<p class="empty-state"><i class="fa-regular fa-users"></i><br>No community members yet.</p>';
    return;
  }
  wrap.innerHTML = recent.map(m => `
    <div class="ep-admin-card">
      <div class="member-avatar" style="width:48px;height:48px;"><i class="fa-solid fa-user"></i></div>
      <div class="ep-admin-info">
        <div class="ep-admin-title">${escapeHtml(m.name)}</div>
        <div class="ep-admin-meta">
          <span><i class="fa-regular fa-envelope"></i>${escapeHtml(m.email)}</span>
          <span><i class="fa-regular fa-calendar"></i>${formatDate(m.joined_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

/* ============================================================
   UPLOAD MEDIA
   ============================================================ */
function handleMediaUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  if (!isVideo && !isAudio) {
    showToast('Please choose a video or audio file.', 'error');
    event.target.value = '';
    return;
  }

  selectedFile = file;
  selectedFileType = isVideo ? 'video' : 'audio';

  document.getElementById('selectedFileName').textContent = file.name;
  const typeTag = document.getElementById('selectedFileType');
  typeTag.textContent = selectedFileType.toUpperCase();
  typeTag.className = `file-type-tag file-type-tag--${selectedFileType}`;
  document.getElementById('selectedFileChip').classList.remove('hidden');
  document.getElementById('uploadMetaCard').classList.remove('hidden');
}

function clearSelectedFile() {
  selectedFile = null;
  selectedFileType = null;
  document.getElementById('mediaFile').value = '';
  document.getElementById('selectedFileChip').classList.add('hidden');
}

function cancelUpload() {
  clearSelectedFile();
  document.getElementById('uploadMetaCard').classList.add('hidden');
  ['metaEpNum', 'metaTopic', 'metaTitle', 'metaDesc', 'metaDuration', 'metaDate'].forEach(id => setVal(id, ''));
}

async function saveUpload() {
  if (!selectedFile) { showToast('Please choose a file first.', 'error'); return; }

  const title = document.getElementById('metaTitle').value.trim();
  if (!title) { showToast('Please enter an episode title.', 'error'); return; }

  const number = document.getElementById('metaEpNum').value || null;
  const topic = document.getElementById('metaTopic').value || null;
  const description = document.getElementById('metaDesc').value.trim() || null;
  const duration = document.getElementById('metaDuration').value.trim() || null;
  const airDate = document.getElementById('metaDate').value || null;

  const progressWrap = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressBarFill');
  const progressLabel = document.getElementById('uploadProgressLabel');
  progressWrap.classList.remove('hidden');
  progressLabel.textContent = 'Uploading file…';
  progressFill.style.width = '0%';

  // Supabase's JS storage client doesn't expose real upload progress,
  // so this animates toward ~88% while the upload is in flight and
  // snaps to 100% once it actually finishes.
  let fakePct = 0;
  const progressTimer = setInterval(() => {
    fakePct = Math.min(fakePct + Math.random() * 12, 88);
    progressFill.style.width = fakePct + '%';
  }, 250);

  try {
    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `${selectedFileType}s/${Date.now()}_${safeName}`;

    const { error: uploadError } = await sb.storage.from('media').upload(path, selectedFile, {
      cacheControl: '3600',
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('media').getPublicUrl(path);

    progressLabel.textContent = 'Saving episode details…';

    const { error: insertError } = await sb.from('episodes').insert({
      number: number ? parseInt(number, 10) : null,
      topic, title, description, duration,
      air_date: airDate,
      type: selectedFileType,
      media_url: urlData.publicUrl,
      file_name: selectedFile.name
    });
    if (insertError) throw insertError;

    clearInterval(progressTimer);
    progressFill.style.width = '100%';
    setTimeout(() => progressWrap.classList.add('hidden'), 500);

    showToast('Episode uploaded successfully!', 'success');
    pushNotification('fa-cloud-arrow-up', `New episode uploaded: "${title}"`);

    clearSelectedFile();
    document.getElementById('uploadMetaCard').classList.add('hidden');
    ['metaEpNum', 'metaTopic', 'metaTitle', 'metaDesc', 'metaDuration', 'metaDate'].forEach(id => setVal(id, ''));

    await loadEpisodes();
    renderOverviewStats();
    renderRecentUploads();
  } catch (err) {
    clearInterval(progressTimer);
    progressWrap.classList.add('hidden');
    showToast('Upload failed: ' + err.message, 'error');
  }
}

/* ============================================================
   EPISODES
   ============================================================ */
function renderEpisodes(list) {
  const wrap = document.getElementById('episodesList');
  if (!list.length) {
    wrap.innerHTML = '<p class="empty-state"><i class="fa-solid fa-podcast"></i><br>No episodes yet. Upload your first episode!</p>';
    return;
  }
  wrap.innerHTML = list.map(ep => `
    <div class="ep-admin-card">
      <div class="ep-admin-num">EP<br>${ep.number ?? '—'}</div>
      <div class="ep-admin-info">
        <div class="ep-admin-title">${escapeHtml(ep.title)}</div>
        <div class="ep-admin-meta">
          ${ep.duration ? `<span><i class="fa-regular fa-clock"></i>${escapeHtml(ep.duration)}</span>` : ''}
          <span><i class="fa-regular fa-calendar"></i>${formatDate(ep.air_date || ep.created_at)}</span>
          <span class="ep-admin-type-badge ${ep.type}"><i class="fa-solid fa-${ep.type === 'video' ? 'video' : 'music'}"></i>${ep.type}</span>
          ${ep.topic ? `<span class="ep-admin-topic-badge">${escapeHtml(ep.topic)}</span>` : ''}
        </div>
      </div>
      <div class="ep-admin-actions">
        <button type="button" class="btn-icon" title="Preview" onclick="previewEpisode(${ep.id})"><i class="fa-solid fa-play"></i></button>
        <button type="button" class="btn-icon" title="Edit" onclick="openEditEpisode(${ep.id})"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="btn-icon btn-icon-danger" title="Delete" onclick="deleteEpisode(${ep.id})"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function filterEpisodes() {
  const q = document.getElementById('episodeSearch').value.trim().toLowerCase();
  const topic = document.getElementById('episodeFilter').value;
  const filtered = episodesCache.filter(ep => {
    const matchesQ = !q || ep.title?.toLowerCase().includes(q) || ep.description?.toLowerCase().includes(q);
    const matchesTopic = !topic || ep.topic === topic;
    return matchesQ && matchesTopic;
  });
  renderEpisodes(filtered);
}

function previewEpisode(id) {
  const ep = episodesCache.find(e => e.id === id);
  if (!ep) return;
  const url = ep.media_url || ep.youtube_url;
  if (!url) { showToast('No media file attached to this episode.', 'error'); return; }
  window.open(url, '_blank', 'noopener');
}

function openEditEpisode(id) {
  const ep = episodesCache.find(e => e.id === id);
  if (!ep) return;
  document.getElementById('editEpId').value = ep.id;
  setVal('editEpNum', ep.number);
  setVal('editEpTopic', ep.topic || '');
  setVal('editEpTitle', ep.title);
  setVal('editEpDesc', ep.description);
  setVal('editEpDuration', ep.duration);
  setVal('editEpDate', ep.air_date);
  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
}

async function saveEditEpisode() {
  const id = document.getElementById('editEpId').value;
  const title = document.getElementById('editEpTitle').value.trim();
  if (!title) { showToast('Title cannot be empty.', 'error'); return; }

  const updates = {
    number: document.getElementById('editEpNum').value ? parseInt(document.getElementById('editEpNum').value, 10) : null,
    topic: document.getElementById('editEpTopic').value || null,
    title,
    description: document.getElementById('editEpDesc').value.trim() || null,
    duration: document.getElementById('editEpDuration').value.trim() || null,
    air_date: document.getElementById('editEpDate').value || null
  };

  const { error } = await sb.from('episodes').update(updates).eq('id', id);
  if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }

  showToast('Episode updated.', 'success');
  closeEditModal();
  await loadEpisodes();
  renderOverviewStats();
  renderRecentUploads();
}

function deleteEpisode(id) {
  const ep = episodesCache.find(e => e.id === id);
  showConfirm(
    'Delete this episode?',
    `"${ep?.title || 'This episode'}" will be permanently removed. This cannot be undone.`,
    async () => {
      const { error } = await sb.from('episodes').delete().eq('id', id);
      if (error) { showToast('Failed to delete: ' + error.message, 'error'); return; }
      showToast('Episode deleted.', 'success');
      await loadEpisodes();
      renderOverviewStats();
      renderRecentUploads();
    }
  );
}

/* ============================================================
   COMMUNITY
   ============================================================ */
async function addMember() {
  const name = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  const age = document.getElementById('memberAge').value;
  const role = document.getElementById('memberRole').value;

  if (!name || !email) { showToast('Please enter a name and email.', 'error'); return; }

  const { error } = await sb.from('members').insert({
    name, email, age: age || null, role, status: 'active'
  });

  if (error) {
    showToast(error.code === '23505' ? 'A member with this email already exists.' : 'Failed to add member: ' + error.message, 'error');
    return;
  }

  showToast('Member added.', 'success');
  ['memberName', 'memberEmail', 'memberAge'].forEach(id => setVal(id, ''));
  document.getElementById('memberRole').value = 'Member';

  await loadMembers();
  renderOverviewStats();
  renderRecentMembers();
}

function renderMembers(list) {
  const body = document.getElementById('memberTableBody');
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-people-group"></i><br>No members yet.</td></tr>';
    return;
  }
  body.innerHTML = list.map(m => `
    <tr>
      <td>
        <div class="member-name-cell">
          <div class="member-avatar"><i class="fa-solid fa-user"></i></div>
          <span class="member-name-text">${escapeHtml(m.name)}</span>
        </div>
      </td>
      <td>${escapeHtml(m.email)}</td>
      <td>${m.age ? escapeHtml(m.age) : '—'}</td>
      <td>
        <select class="admin-select" style="min-width:130px;padding:6px 28px 6px 10px;font-size:.75rem;" onchange="updateMemberRole(${m.id}, this.value)">
          ${['Member', 'Moderator', 'Guest Speaker'].map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </td>
      <td>${formatDate(m.joined_at)}</td>
      <td>
        <span class="status-badge ${m.status === 'inactive' ? 'inactive' : 'active'}" style="cursor:pointer;" onclick="toggleMemberStatus(${m.id}, '${m.status}')">
          ${m.status === 'inactive' ? 'Inactive' : 'Active'}
        </span>
      </td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-icon btn-icon-danger" title="Remove member" onclick="deleteMember(${m.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterMembers() {
  const q = document.getElementById('memberSearch').value.trim().toLowerCase();
  const filtered = membersCache.filter(m =>
    !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  );
  renderMembers(filtered);
}

async function updateMemberRole(id, role) {
  const { error } = await sb.from('members').update({ role }).eq('id', id);
  if (error) { showToast('Failed to update role: ' + error.message, 'error'); return; }
  const m = membersCache.find(x => x.id === id);
  if (m) m.role = role;
  showToast('Role updated.', 'success');
}

async function toggleMemberStatus(id, currentStatus) {
  const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
  const { error } = await sb.from('members').update({ status: newStatus }).eq('id', id);
  if (error) { showToast('Failed to update status: ' + error.message, 'error'); return; }
  await loadMembers();
  renderOverviewStats();
}

function deleteMember(id) {
  const m = membersCache.find(x => x.id === id);
  showConfirm(
    'Remove this member?',
    `${m?.name || 'This member'} will be removed from the community. This cannot be undone.`,
    async () => {
      const { error } = await sb.from('members').delete().eq('id', id);
      if (error) { showToast('Failed to remove member: ' + error.message, 'error'); return; }
      showToast('Member removed.', 'success');
      await loadMembers();
      renderOverviewStats();
      renderRecentMembers();
    }
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */
async function saveSettings() {
  const updates = {
    podcast_name: document.getElementById('settingName').value.trim(),
    host_name: document.getElementById('settingHost').value.trim(),
    tagline: document.getElementById('settingTagline').value.trim(),
    website_url: document.getElementById('settingUrl').value.trim(),
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('settings').update(updates).eq('id', 1);
  if (error) { showToast('Failed to save settings: ' + error.message, 'error'); return; }
  showToast('Settings saved.', 'success');
}

async function saveSocials() {
  const inputs = document.querySelectorAll('#tab-settings .social-field input');
  const updates = { updated_at: new Date().toISOString() };
  inputs.forEach(input => {
    const ph = (input.placeholder || '').toLowerCase();
    if (ph.includes('instagram')) updates.instagram_url = input.value.trim() || null;
    else if (ph.includes('tiktok')) updates.tiktok_url = input.value.trim() || null;
    else if (ph.includes('spotify')) updates.spotify_url = input.value.trim() || null;
    else if (ph.includes('youtube')) updates.youtube_url = input.value.trim() || null;
  });

  const { error } = await sb.from('settings').update(updates).eq('id', 1);
  if (error) { showToast('Failed to save social links: ' + error.message, 'error'); return; }
  showToast('Social links saved.', 'success');
}

async function changePassword() {
  const currentPw = document.getElementById('currentPw').value;
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;

  if (!currentPw || !newPw || !confirmPw) { showToast('Please fill in all password fields.', 'error'); return; }
  if (newPw !== confirmPw) { showToast('New passwords do not match.', 'error'); return; }
  if (newPw.length < 6) { showToast('New password must be at least 6 characters.', 'error'); return; }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) { showToast('Session expired. Please sign in again.', 'error'); return; }

  // Re-verify the current password before allowing a change
  const { error: verifyError } = await sb.auth.signInWithPassword({ email: user.email, password: currentPw });
  if (verifyError) { showToast('Current password is incorrect.', 'error'); return; }

  const { error } = await sb.auth.updateUser({ password: newPw });
  if (error) { showToast('Failed to update password: ' + error.message, 'error'); return; }

  showToast('Password updated successfully.', 'success');
  ['currentPw', 'newPw', 'confirmPw'].forEach(id => setVal(id, ''));
}

/* ============================================================
   REALTIME — notify the admin when a visitor joins the community
   ============================================================ */
function setupRealtime() {
  sb.channel('public:members')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, payload => {
      const m = payload.new;
      if (membersCache.some(x => x.id === m.id)) return;
      membersCache.unshift(m);
      pushNotification('fa-user-plus', `${m.name} just joined the community!`);
      renderMembers(membersCache);
      renderRecentMembers();
      renderOverviewStats();
      showToast(`${m.name} just joined!`, 'info');
    })
    .subscribe();
}