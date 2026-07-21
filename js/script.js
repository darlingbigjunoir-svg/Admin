/* =============================================
   THE PINK CHRONICLES — admin.js
   Backed by Supabase: Auth + Postgres + Storage.
   Every change here is written to the shared database,
   so it appears live on the main site too.
   ============================================= */
'use strict';

/* ── State (in-memory cache of what's in Supabase) ── */
let state = {
  episodes: [],
  members:  [],
  notifications: [
    { icon: 'fa-cloud-arrow-up', text: 'Upload Media to get started!' },
    { icon: 'fa-people-group',   text: 'Add your first community member.' },
    { icon: 'fa-heart',          text: 'Welcome to The Pink Chronicles Admin!' }
  ],
  pendingUpload: null
};

/* ── Helpers ── */
function show(id) { const el = document.getElementById(id); if (el) { el.classList.remove('hidden'); el.style.display = 'block'; } }
function hide(id) { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
function showFlex(id) { const el = document.getElementById(id); if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; } }

/* =============================================
   LOGIN  (Supabase Auth)
   ============================================= */
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  const msg   = document.getElementById('loginErrorMsg');
  const btn   = document.querySelector('.btn-login');

  if (!email) { msg.textContent = 'Please enter your email.'; showFlex('loginError'); return; }
  if (!pw)    { msg.textContent = 'Please enter your password.'; showFlex('loginError'); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…'; }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> SIGN IN'; }

  if (error) {
    msg.textContent = 'Incorrect email or password.';
    showFlex('loginError');
    return;
  }

  hide('loginError');
  await enterDashboard();
  showToast('Welcome back, Herty! 💕', 'info');
}

async function enterDashboard() {
  hide('loginScreen');
  showFlex('dashboard');
  await loadState();
  refreshAll();
  renderNotifs();
}

function handleLogout() {
  openConfirm('Log Out', 'Are you sure you want to sign out?', async () => {
    await supabaseClient.auth.signOut();
    hide('dashboard');
    showFlex('loginScreen');
    document.getElementById('loginEmail').value    = '';
    document.getElementById('loginPassword').value = '';
    showToast('Logged out successfully.', 'info');
  });
}

function togglePassword() {
  const input = document.getElementById('loginPassword');
  const icon  = document.getElementById('pwEyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-regular fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-regular fa-eye';
  }
}

document.addEventListener('keydown', e => {
  const ls = document.getElementById('loginScreen');
  if (e.key === 'Enter' && ls && ls.style.display !== 'none') handleLogin();
});

/* The login screen always shows first — no auto-login from a
   saved session. Signing in still works normally; this just
   means you'll enter your password each time you open the page. */
async function checkExistingSession() {
  // Intentionally does nothing: login screen stays as the first thing shown.
}

/* =============================================
   SIDEBAR & NAVIGATION
   ============================================= */
function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');
  const titles = { overview:'Overview', upload:'Upload Media', episodes:'Episodes', community:'Community', settings:'Settings' };
  document.getElementById('topbarTitle').textContent = titles[tabName] || tabName;
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
  if (tabName === 'overview')  refreshOverview();
  if (tabName === 'episodes')  renderEpisodes();
  if (tabName === 'community') renderMembers();
  if (tabName === 'settings')  loadSettingsForm();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* =============================================
   NOTIFICATIONS
   ============================================= */
function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel.style.display === 'none' || panel.style.display === '') {
    show('notifPanel');
    renderNotifs();
  } else {
    hide('notifPanel');
  }
}

function renderNotifs() {
  const list  = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!state.notifications.length) {
    list.innerHTML = '<p class="notif-empty">All caught up! 🎉</p>';
    hide('notifBadge'); return;
  }
  badge.textContent = state.notifications.length;
  showFlex('notifBadge');
  list.innerHTML = state.notifications.map(n =>
    `<div class="notif-item"><i class="fa-solid ${n.icon}"></i><span>${n.text}</span></div>`
  ).join('');
}

function clearNotifs() {
  state.notifications = [];
  renderNotifs();
}

document.addEventListener('click', e => {
  const panel   = document.getElementById('notifPanel');
  const trigger = document.getElementById('notifTrigger');
  if (panel && trigger && !trigger.contains(e.target) && !panel.contains(e.target)) {
    hide('notifPanel');
  }
});

/* =============================================
   DATA LOADING  (Supabase reads)
   ============================================= */
async function loadState() {
  const [episodesRes, membersRes] = await Promise.all([
    supabaseClient.from('episodes').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('members').select('*').order('joined_at', { ascending: false })
  ]);

  if (episodesRes.error) { console.error(episodesRes.error); showToast('Could not load episodes.', 'error'); }
  else state.episodes = episodesRes.data.map(mapEpisodeFromDb);

  if (membersRes.error) { console.error(membersRes.error); showToast('Could not load members.', 'error'); }
  else state.members = membersRes.data.map(mapMemberFromDb);
}

/* Convert DB rows (snake_case) to the shape the UI code already expects */
function mapEpisodeFromDb(row) {
  return {
    id: row.id, number: row.number, topic: row.topic, title: row.title,
    desc: row.description, duration: row.duration,
    date: row.air_date, type: row.type,
    fileName: row.file_name, fileUrl: row.media_url, youtubeUrl: row.youtube_url
  };
}
function mapMemberFromDb(row) {
  return {
    id: row.id, name: row.name, email: row.email, age: row.age || '—',
    role: row.role, status: row.status,
    joined: row.joined_at ? new Date(row.joined_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
  };
}

/* =============================================
   OVERVIEW
   ============================================= */
function refreshAll() {
  refreshOverview();
  renderEpisodes();
  renderMembers();
}

function refreshOverview() {
  document.getElementById('statEpisodes').textContent = state.episodes.length;
  document.getElementById('statMembers').textContent  = state.members.filter(m => m.status === 'active').length;
  document.getElementById('statVideos').textContent   = state.episodes.filter(e => e.type === 'video').length;
  document.getElementById('statAudios').textContent   = state.episodes.filter(e => e.type === 'audio').length;

  const ru = document.getElementById('recentUploads');
  const recent = [...state.episodes].slice(0, 4);
  if (!recent.length) {
    ru.innerHTML = '<p class="empty-state"><i class="fa-regular fa-folder-open"></i><br>No uploads yet.</p>';
  } else {
    ru.innerHTML = recent.map(ep => `
      <div class="ep-admin-card">
        <div class="ep-admin-num">EP<br>${ep.number || '?'}</div>
        <div class="ep-admin-info">
          <div class="ep-admin-title">${ep.title}</div>
          <div class="ep-admin-meta">
            <span class="ep-admin-topic-badge">${ep.topic || 'General'}</span>
            <span class="ep-admin-type-badge ${ep.type}">
              <i class="fa-solid ${ep.type === 'video' ? 'fa-video' : 'fa-music'}"></i> ${ep.type}
            </span>
            <span><i class="fa-regular fa-calendar-days"></i>${ep.date || '—'}</span>
            ${ep.duration ? `<span><i class="fa-regular fa-clock"></i>${ep.duration}</span>` : ''}
          </div>
        </div>
      </div>`).join('');
  }

  const rm = document.getElementById('recentMembers');
  const recentM = [...state.members].slice(0, 4);
  if (!recentM.length) {
    rm.innerHTML = '<p class="empty-state"><i class="fa-regular fa-users"></i><br>No community members yet.</p>';
  } else {
    rm.innerHTML = `<table class="member-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>${recentM.map(m => `
        <tr>
          <td><div class="member-name-cell"><div class="member-avatar"><i class="fa-solid fa-user"></i></div><span class="member-name-text">${m.name}</span></div></td>
          <td>${m.email}</td>
          <td><span class="role-badge ${getRoleClass(m.role)}">${m.role}</span></td>
          <td><span class="status-badge ${m.status}">${m.status}</span></td>
        </tr>`).join('')}
      </tbody></table>`;
  }
}

/* =============================================
   UPLOAD MEDIA
   ============================================= */
function handleMediaUpload(e) {
  const file = e.target.files[0];
  if (file) processMediaFile(file);
}

function processMediaFile(file) {
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  if (!isVideo && !isAudio) { showToast('Please upload a video or audio file.', 'error'); return; }

  const type = isVideo ? 'video' : 'audio';
  state.pendingUpload = { file, type };

  document.getElementById('selectedFileName').textContent = file.name;
  const tag = document.getElementById('selectedFileType');
  tag.textContent  = type.toUpperCase();
  tag.className    = `file-type-tag file-type-tag--${type}`;
  showFlex('selectedFileChip');
  document.getElementById('metaYoutubeUrl').value = '';

  showUploadProgress(file.name, () => {
    show('uploadMetaCard');
    document.getElementById('uploadMetaCard').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('metaDate').value = new Date().toISOString().split('T')[0];
    showToast(`${type === 'video' ? '🎬 Video' : '🎵 Audio'} ready! Fill in the details.`, 'info');
  });
}

/* Alternative path: paste a YouTube link instead of uploading a video file */
function handleYoutubeInput() {
  const url = document.getElementById('metaYoutubeUrl').value.trim();
  if (!url) return;
  state.pendingUpload = { youtubeUrl: url, type: 'video' };
  hide('selectedFileChip');
  document.getElementById('mediaFile').value = '';
  show('uploadMetaCard');
  document.getElementById('uploadMetaCard').scrollIntoView({ behavior: 'smooth' });
  if (!document.getElementById('metaDate').value) {
    document.getElementById('metaDate').value = new Date().toISOString().split('T')[0];
  }
}

function clearSelectedFile() {
  state.pendingUpload = null;
  hide('selectedFileChip');
  hide('uploadMetaCard');
  document.getElementById('selectedFileName').textContent = '';
  document.getElementById('mediaFile').value = '';
  document.getElementById('metaYoutubeUrl').value = '';
}

function showUploadProgress(name, callback) {
  const wrap  = document.getElementById('uploadProgress');
  const fill  = document.getElementById('progressBarFill');
  const label = document.getElementById('uploadProgressLabel');
  show('uploadProgress');
  label.textContent = `Processing "${name}"…`;
  fill.style.width  = '0%';
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 22;
    if (pct >= 100) {
      pct = 100; fill.style.width = '100%';
      label.textContent = 'Ready! ✓';
      clearInterval(iv);
      setTimeout(() => { hide('uploadProgress'); fill.style.width = '0%'; if (callback) callback(); }, 600);
    } else {
      fill.style.width = pct + '%';
    }
  }, 120);
}

async function saveUpload() {
  const title    = document.getElementById('metaTitle').value.trim();
  const number   = document.getElementById('metaEpNum').value.trim();
  const topic    = document.getElementById('metaTopic').value;
  const desc     = document.getElementById('metaDesc').value.trim();
  const duration = document.getElementById('metaDuration').value.trim();
  const date     = document.getElementById('metaDate').value;

  if (!title) { showToast('Please enter an episode title.', 'error'); return; }
  if (!state.pendingUpload) { showToast('No file or YouTube link selected yet.', 'error'); return; }

  const saveBtn = document.querySelector('#uploadMetaCard .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

  try {
    let mediaUrl = null, youtubeUrl = null, fileName = null;

    if (state.pendingUpload.file) {
      const file = state.pendingUpload.file;
      const path = `${state.pendingUpload.type}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const { error: uploadError } = await supabaseClient.storage.from('media').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: pub } = supabaseClient.storage.from('media').getPublicUrl(path);
      mediaUrl = pub.publicUrl;
      fileName = file.name;
    } else if (state.pendingUpload.youtubeUrl) {
      youtubeUrl = state.pendingUpload.youtubeUrl;
    }

    const { data: inserted, error: insertError } = await supabaseClient.from('episodes').insert({
      title,
      number:      number ? parseInt(number, 10) : (state.episodes.length + 1),
      topic:       topic || 'General',
      description: desc,
      duration,
      air_date:    date || new Date().toISOString().split('T')[0],
      type:        state.pendingUpload.type,
      media_url:   mediaUrl,
      youtube_url: youtubeUrl,
      file_name:   fileName
    }).select().single();
    if (insertError) throw insertError;

    state.episodes.unshift(mapEpisodeFromDb(inserted));
    state.pendingUpload = null;

    ['metaTitle','metaEpNum','metaDesc','metaDuration','metaDate','metaYoutubeUrl'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('metaTopic').value = '';
    document.getElementById('mediaFile').value = '';
    hide('selectedFileChip');
    hide('uploadMetaCard');
    document.getElementById('selectedFileName').textContent = '';

    refreshAll();
    showToast(`Episode "${title}" saved! It's now live on the main site 🎉`, 'success');
    state.notifications.unshift({ icon: 'fa-podcast', text: `New episode "${title}" uploaded.` });
    renderNotifs();
  } catch (err) {
    console.error(err);
    showToast('Upload failed: ' + (err.message || 'please try again.'), 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Episode'; }
  }
}

function cancelUpload() {
  state.pendingUpload = null;
  hide('uploadMetaCard');
  hide('uploadProgress');
  hide('selectedFileChip');
  document.getElementById('selectedFileName').textContent = '';
  document.getElementById('mediaFile').value = '';
  document.getElementById('metaYoutubeUrl').value = '';
  showToast('Upload cancelled.', 'info');
}

/* Drag and drop */
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('mediaDropZone');
  if (!zone) return;
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) processMediaFile(files[0]);
  });
});

/* =============================================
   EPISODES
   ============================================= */
function renderEpisodes(filtered) {
  const list = document.getElementById('episodesList');
  const eps  = filtered !== undefined ? filtered : state.episodes;
  if (!eps.length) {
    list.innerHTML = '<p class="empty-state"><i class="fa-solid fa-podcast"></i><br>No episodes yet. Upload your first episode!</p>';
    return;
  }
  list.innerHTML = `<div class="section-card">${eps.map(ep => `
    <div class="ep-admin-card" id="epCard-${ep.id}">
      <div class="ep-admin-num">EP<br>${ep.number}</div>
      <div class="ep-admin-info">
        <div class="ep-admin-title">${ep.title}</div>
        <div class="ep-admin-meta">
          <span class="ep-admin-topic-badge">${ep.topic}</span>
          <span class="ep-admin-type-badge ${ep.type}">
            <i class="fa-solid ${ep.type === 'video' ? 'fa-video' : 'fa-music'}"></i> ${ep.type}
          </span>
          ${ep.date     ? `<span><i class="fa-regular fa-calendar-days"></i>${ep.date}</span>` : ''}
          ${ep.duration ? `<span><i class="fa-regular fa-clock"></i>${ep.duration}</span>` : ''}
          ${ep.fileName ? `<span><i class="fa-solid fa-file"></i>${ep.fileName}</span>` : ''}
          ${ep.youtubeUrl ? `<span><i class="fa-brands fa-youtube"></i>YouTube</span>` : ''}
        </div>
        ${ep.desc ? `<div style="font-size:.75rem;color:#64748b;margin-top:5px;line-height:1.5;">${ep.desc}</div>` : ''}
      </div>
      <div class="ep-admin-actions">
        ${ep.fileUrl ? `<a href="${ep.fileUrl}" target="_blank" class="btn-icon" title="Preview"><i class="fa-solid fa-play"></i></a>` : ''}
        ${ep.youtubeUrl ? `<a href="${ep.youtubeUrl}" target="_blank" class="btn-icon" title="Preview on YouTube"><i class="fa-brands fa-youtube"></i></a>` : ''}
        <button class="btn-icon" onclick="openEditModal(${ep.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon btn-icon-danger" onclick="deleteEpisode(${ep.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('')}</div>`;
}

function filterEpisodes() {
  const q     = document.getElementById('episodeSearch').value.toLowerCase();
  const topic = document.getElementById('episodeFilter').value;
  renderEpisodes(state.episodes.filter(ep => {
    const mQ = !q || ep.title.toLowerCase().includes(q) || (ep.desc && ep.desc.toLowerCase().includes(q));
    const mT = !topic || ep.topic === topic;
    return mQ && mT;
  }));
}

function deleteEpisode(id) {
  const ep = state.episodes.find(e => e.id === id);
  if (!ep) return;
  openConfirm('Delete Episode', `Delete "${ep.title}"? This cannot be undone.`, async () => {
    try {
      // Best-effort: remove the file from storage too, if there is one
      if (ep.fileUrl) {
        const marker = '/object/public/media/';
        const idx = ep.fileUrl.indexOf(marker);
        if (idx !== -1) {
          const path = ep.fileUrl.substring(idx + marker.length);
          await supabaseClient.storage.from('media').remove([path]);
        }
      }
      const { error } = await supabaseClient.from('episodes').delete().eq('id', id);
      if (error) throw error;
      state.episodes = state.episodes.filter(e => e.id !== id);
      refreshAll();
      showToast('Episode deleted — it\'s gone from the main site too.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Could not delete episode: ' + (err.message || ''), 'error');
    }
  });
}

function openEditModal(id) {
  const ep = state.episodes.find(e => e.id === id);
  if (!ep) return;
  document.getElementById('editEpId').value       = id;
  document.getElementById('editEpNum').value      = ep.number;
  document.getElementById('editEpTopic').value    = ep.topic;
  document.getElementById('editEpTitle').value    = ep.title;
  document.getElementById('editEpDesc').value     = ep.desc;
  document.getElementById('editEpDuration').value = ep.duration;
  document.getElementById('editEpDate').value     = ep.date;
  showFlex('editModal');
}
function closeEditModal() { hide('editModal'); }

async function saveEditEpisode() {
  const id    = parseInt(document.getElementById('editEpId').value);
  const ep    = state.episodes.find(e => e.id === id);
  const title = document.getElementById('editEpTitle').value.trim();
  if (!ep)    return;
  if (!title) { showToast('Title cannot be empty.', 'error'); return; }

  const updated = {
    number:      document.getElementById('editEpNum').value,
    topic:       document.getElementById('editEpTopic').value,
    title,
    description: document.getElementById('editEpDesc').value.trim(),
    duration:    document.getElementById('editEpDuration').value.trim(),
    air_date:    document.getElementById('editEpDate').value
  };

  const { error } = await supabaseClient.from('episodes').update(updated).eq('id', id);
  if (error) { console.error(error); showToast('Could not save changes.', 'error'); return; }

  ep.number = updated.number; ep.topic = updated.topic; ep.title = updated.title;
  ep.desc = updated.description; ep.duration = updated.duration; ep.date = updated.air_date;

  refreshAll(); closeEditModal();
  showToast(`"${ep.title}" updated on the main site!`, 'success');
}

/* =============================================
   COMMUNITY
   ============================================= */
async function addMember() {
  const name  = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  const age   = document.getElementById('memberAge').value.trim();
  const role  = document.getElementById('memberRole').value;

  if (!name)  { showToast('Please enter a name.', 'error'); return; }
  if (!email) { showToast('Please enter an email.', 'error'); return; }
  if (!isValidEmail(email)) { showToast('Please enter a valid email address.', 'error'); return; }
  if (state.members.find(m => m.email.toLowerCase() === email.toLowerCase())) {
    showToast('A member with this email already exists.', 'error'); return;
  }

  const { data, error } = await supabaseClient.from('members').insert({
    name, email, age: age || null, role, status: 'active'
  }).select().single();

  if (error) { console.error(error); showToast('Could not add member: ' + error.message, 'error'); return; }

  state.members.unshift(mapMemberFromDb(data));
  document.getElementById('memberName').value  = '';
  document.getElementById('memberEmail').value = '';
  document.getElementById('memberAge').value   = '';
  document.getElementById('memberRole').value  = 'Member';
  renderMembers(); refreshOverview();
  state.notifications.unshift({ icon: 'fa-user-plus', text: `${name} joined the community!` });
  renderNotifs();
  showToast(`${name} added to the community! 💕`, 'success');
}

function renderMembers(filtered) {
  const tbody = document.getElementById('memberTableBody');
  const list  = filtered !== undefined ? filtered : state.members;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-people-group"></i><br>No members yet.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(m => `
    <tr>
      <td><div class="member-name-cell"><div class="member-avatar"><i class="fa-solid fa-user"></i></div><span class="member-name-text">${m.name}</span></div></td>
      <td>${m.email}</td><td>${m.age}</td>
      <td><span class="role-badge ${getRoleClass(m.role)}">${m.role}</span></td>
      <td>${m.joined}</td>
      <td><span class="status-badge ${m.status}">${m.status}</span></td>
      <td><div class="table-actions">
        <button class="btn-icon" onclick="toggleMemberStatus(${m.id})" title="${m.status==='active'?'Deactivate':'Activate'}">
          <i class="fa-solid ${m.status==='active'?'fa-user-slash':'fa-user-check'}"></i>
        </button>
        <button class="btn-icon" onclick="changeMemberRole(${m.id})" title="Change Role"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon btn-icon-danger" onclick="removeMember(${m.id})" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}

function filterMembers() {
  const q = document.getElementById('memberSearch').value.toLowerCase();
  renderMembers(state.members.filter(m =>
    m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
  ));
}

function toggleMemberStatus(id) {
  const m = state.members.find(m => m.id === id);
  if (!m) return;
  const next   = m.status === 'active' ? 'inactive' : 'active';
  const action = next === 'inactive' ? 'deactivate' : 'reactivate';
  openConfirm(`${action.charAt(0).toUpperCase()+action.slice(1)} Member`, `Are you sure you want to ${action} ${m.name}?`, async () => {
    const { error } = await supabaseClient.from('members').update({ status: next }).eq('id', id);
    if (error) { showToast('Could not update member.', 'error'); return; }
    m.status = next; renderMembers(); refreshOverview();
    showToast(`${m.name} has been ${next === 'active' ? 'reactivated' : 'deactivated'}.`, 'info');
  });
}

function changeMemberRole(id) {
  const m = state.members.find(m => m.id === id);
  if (!m) return;
  const roles = ['Member','Moderator','Guest Speaker'];
  const next  = roles[(roles.indexOf(m.role)+1) % roles.length];
  openConfirm('Change Role', `Change ${m.name}'s role to "${next}"?`, async () => {
    const { error } = await supabaseClient.from('members').update({ role: next }).eq('id', id);
    if (error) { showToast('Could not update role.', 'error'); return; }
    m.role = next; renderMembers();
    showToast(`${m.name} is now a ${next}.`, 'success');
  });
}

function removeMember(id) {
  const m = state.members.find(m => m.id === id);
  if (!m) return;
  openConfirm('Remove Member', `Remove ${m.name} from the community? This cannot be undone.`, async () => {
    const { error } = await supabaseClient.from('members').delete().eq('id', id);
    if (error) { showToast('Could not remove member.', 'error'); return; }
    state.members = state.members.filter(m => m.id !== id);
    renderMembers(); refreshOverview();
    showToast(`${m.name} has been removed.`, 'info');
  });
}

function getRoleClass(role) {
  if (role === 'Moderator')    return 'moderator';
  if (role === 'Guest Speaker') return 'guest';
  return 'member';
}

/* =============================================
   SETTINGS
   ============================================= */
async function loadSettingsForm() {
  const { data, error } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (error || !data) return;
  document.getElementById('settingName').value     = data.podcast_name || '';
  document.getElementById('settingHost').value     = data.host_name || '';
  document.getElementById('settingTagline').value  = data.tagline || '';
  document.getElementById('settingUrl').value      = data.website_url || '';
  document.getElementById('settingInstagram').value = data.instagram_url || '';
  document.getElementById('settingTiktok').value    = data.tiktok_url || '';
  document.getElementById('settingSpotify').value   = data.spotify_url || '';
  document.getElementById('settingYoutube').value   = data.youtube_url || '';
}

async function saveSettings() {
  const podcast_name = document.getElementById('settingName').value.trim();
  if (!podcast_name) { showToast('Name is required.', 'error'); return; }
  const { error } = await supabaseClient.from('settings').update({
    podcast_name,
    host_name:   document.getElementById('settingHost').value.trim(),
    tagline:     document.getElementById('settingTagline').value.trim(),
    website_url: document.getElementById('settingUrl').value.trim()
  }).eq('id', 1);
  if (error) { console.error(error); showToast('Could not save settings.', 'error'); return; }
  showToast('Podcast info saved! ✓', 'success');
}

async function changePassword() {
  const cur  = document.getElementById('currentPw').value;
  const nw   = document.getElementById('newPw').value;
  const conf = document.getElementById('confirmPw').value;
  if (!cur)                          { showToast('Please enter your current password.', 'error'); return; }
  if (nw.length < 6)                 { showToast('New password must be at least 6 characters.', 'error'); return; }
  if (nw !== conf)                   { showToast('Passwords do not match.', 'error'); return; }

  // Re-verify the current password by attempting a fresh sign-in
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { showToast('Session expired, please log in again.', 'error'); return; }
  const { error: verifyError } = await supabaseClient.auth.signInWithPassword({ email: user.email, password: cur });
  if (verifyError) { showToast('Current password is incorrect.', 'error'); return; }

  const { error } = await supabaseClient.auth.updateUser({ password: nw });
  if (error) { showToast('Could not update password: ' + error.message, 'error'); return; }

  ['currentPw','newPw','confirmPw'].forEach(id => document.getElementById(id).value = '');
  showToast('Password updated! 🔒', 'success');
}

async function saveSocials() {
  const { error } = await supabaseClient.from('settings').update({
    instagram_url: document.getElementById('settingInstagram').value.trim(),
    tiktok_url:    document.getElementById('settingTiktok').value.trim(),
    spotify_url:   document.getElementById('settingSpotify').value.trim(),
    youtube_url:   document.getElementById('settingYoutube').value.trim()
  }).eq('id', 1);
  if (error) { console.error(error); showToast('Could not save social links.', 'error'); return; }
  showToast('Social links saved! ✓', 'success');
}

/* =============================================
   UI HELPERS
   ============================================= */
let toastTimer = null;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i> ${msg}`;
  toast.style.display = 'flex';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

let confirmCallback = null;
function openConfirm(title, msg, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  confirmCallback = callback;
  showFlex('confirmModal');
  document.getElementById('confirmOkBtn').onclick = () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  };
}
function closeConfirm() { hide('confirmModal'); confirmCallback = null; }

document.addEventListener('click', e => {
  const cm = document.getElementById('confirmModal');
  if (e.target === cm) closeConfirm();
  const em = document.getElementById('editModal');
  if (e.target === em) closeEditModal();
});

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  renderNotifs();
  checkExistingSession();
});
