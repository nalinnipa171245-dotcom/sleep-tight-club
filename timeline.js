async function init() {
  const banner = document.getElementById('statusBanner');
  const status = await fetch('/api/status').then(r=>r.json());
  banner.innerText = status.open ? ('คลับเปิดอยู่ — เวลาปัจจุบัน: ' + new Date(status.now).toLocaleString()) : 'คลับปิด — เปิดทุกคืน 00:00-04:00 (Asia/Bangkok)';
  document.getElementById('postBtn').addEventListener('click', createPost);
  loadPosts();
}

function getUserId() { return localStorage.getItem('st_user'); }

async function loadPosts() {
  const res = await fetch('/api/posts');
  const j = await res.json();
  const cont = document.getElementById('posts');
  cont.innerHTML = '';
  if (!j.posts || j.posts.length===0) { cont.innerHTML = '<p class="muted">ยังไม่มีโพสต์คืนนี้</p>'; return; }
  j.posts.forEach(p => {
    const el = document.createElement('div'); el.className = 'post card';
    const meta = document.createElement('div'); meta.className='meta muted'; meta.innerText = 'anonymous • ' + new Date(p.createdAt).toLocaleString();
    const content = document.createElement('div'); content.className='content'; content.innerText = p.content;
    const replyBtn = document.createElement('button'); replyBtn.className='btn secondary'; replyBtn.innerText='ตอบ';
    replyBtn.addEventListener('click', ()=> openReplyModal(p.id));
    el.appendChild(meta); el.appendChild(content); el.appendChild(replyBtn);
    cont.appendChild(el);
  });
}

function openReplyModal(postId) {
  const txt = prompt('พิมพ์คำตอบของคุณ (demo)');
  if (!txt) return;
  const uid = getUserId();
  if (!uid) { alert('กรุณาเข้าสู่ระบบก่อน'); return; }
  fetch('/api/posts/'+postId+'/comments', { method:'POST', headers:{'Content-Type':'application/json', 'x-user-id': uid}, body: JSON.stringify({ content: txt }) })
    .then(r=>r.json()).then(j=>{ if (j.error) alert(j.error); else { alert('ตอบเรียบร้อย'); loadPosts(); } });
}

async function createPost() {
  const content = document.getElementById('content').value;
  const uid = getUserId();
  const msg = document.getElementById('postMsg');
  if (!uid) { msg.innerText = 'กรุณาเข้าสู่ระบบ (Login)'; return; }
  const res = await fetch('/api/posts', { method:'POST', headers:{'Content-Type':'application/json','x-user-id': uid}, body: JSON.stringify({ content }) });
  const j = await res.json();
  if (j.error) msg.innerText = j.error; else { msg.innerText = 'โพสต์ส่งเรียบร้อย'; document.getElementById('content').value=''; loadPosts(); }
}

window.addEventListener('load', init);
