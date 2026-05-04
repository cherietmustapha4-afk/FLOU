// ======================= FIREBASE CONFIG =======================
const firebaseConfig = {
  apiKey: "AIzaSyA_QtaO5NjrTg-XAo8-l9OO-t35r9ERmBA",
  authDomain: "twasol-a6376.firebaseapp.com",
  databaseURL: "https://twasol-a6376-default-rtdb.firebaseio.com",
  projectId: "twasol-a6376",
  storageBucket: "twasol-a6376.firebasestorage.app",
  messagingSenderId: "692913650252",
  appId: "1:692913650252:web:83142ece89f939130612e9"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const IMGBB_KEY = "2daa4a8113066b3b9b658cdb063c99b5";

// ================ GLOBAL STATE ================
let state = {
  currentUser: null,
  currentUID: null,
  currentChatPartner: null,
  unreadMessagesCount: 0,
  activeMessageListener: null
};

// ================ HELPER FUNCTIONS ================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function (m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function showToast(msg) {
  let toast = document.createElement("div");
  toast.innerText = msg;
  toast.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:12px 24px; border-radius:60px; z-index:3000; backdrop-filter:blur(8px); font-weight:500;";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function uploadToImgBB(files) {
  let urls = [];
  for (let f of files) {
    let fd = new FormData();
    fd.append("image", f);
    let res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
    let data = await res.json();
    if (data.success) urls.push(data.data.url);
  }
  return urls;
}

function getGridClass(count) {
  if (count === 1) return "media-grid-1";
  if (count === 2) return "media-grid-2";
  return "media-grid-3";
}

// ================ UNREAD MESSAGES LOGIC ================
async function computeTotalUnreadMessages() {
  if (!state.currentUID) return 0;
  let totalUnread = 0;
  let messagesSnap = await db.ref("messages").once("value");
  let allMsgs = messagesSnap.val() || {};
  for (let chatId in allMsgs) {
    if (!chatId.includes(state.currentUID)) continue;
    let lastReadSnap = await db.ref(`userLastRead/${state.currentUID}/${chatId}`).once("value");
    let lastRead = lastReadSnap.val() || 0;
    let messages = allMsgs[chatId];
    for (let msgId in messages) {
      let msg = messages[msgId];
      if (msg.from !== state.currentUID && msg.timestamp > lastRead) totalUnread++;
    }
  }
  return totalUnread;
}

async function updateUnreadBadge() {
  let count = await computeTotalUnreadMessages();
  state.unreadMessagesCount = count;
  let badge = document.getElementById("unreadMessagesBadge");
  if (badge) {
    if (count > 0) {
      badge.innerText = count > 99 ? "99+" : count;
      badge.style.display = "flex";
    } else badge.style.display = "none";
  }
}

async function markChatAsRead(partnerId) {
  if (!state.currentUID || !partnerId) return;
  let chatId = state.currentUID < partnerId ? `${state.currentUID}_${partnerId}` : `${partnerId}_${state.currentUID}`;
  await db.ref(`userLastRead/${state.currentUID}/${chatId}`).set(Date.now());
  await updateUnreadBadge();
}

function setupGlobalMessageListener() {
  if (!state.currentUID) return;
  db.ref("messages").on("value", async () => {
    await updateUnreadBadge();
    if (window.location.hash.split("/")[0] !== "#messages") showToast("💬 New message received!");
  });
}

function listenMessagesWithReadTracking(partnerId) {
  if (state.activeMessageListener && state.currentChatPartner) {
    let oldChatId = state.currentUID < state.currentChatPartner ? `${state.currentUID}_${state.currentChatPartner}` : `${state.currentChatPartner}_${state.currentUID}`;
    db.ref(`messages/${oldChatId}`).off();
  }
  let chatId = state.currentUID < partnerId ? `${state.currentUID}_${partnerId}` : `${partnerId}_${state.currentUID}`;
  db.ref(`messages/${chatId}`).on("value", async (snap) => {
    let msgs = snap.val() || {};
    let html = "";
    Object.values(msgs).forEach(m => {
      let isOwn = m.from === state.currentUID;
      html += `<div style="text-align:${isOwn ? 'right' : 'left'}; margin:8px;"><span style="background:${isOwn ? '#3b82f6' : '#eef2ff'}; padding:8px 18px; border-radius:40px; display:inline-block; max-width:80%; color:${isOwn ? 'white' : 'inherit'};">${m.text || (m.image ? `<img src="${m.image}" style="max-width:140px; border-radius:20px;">` : "")}</span></div>`;
    });
    document.getElementById("chatMessages").innerHTML = html || "<div>No messages</div>";
    document.getElementById("chatMessages").scrollTop = document.getElementById("chatMessages").scrollHeight;
    await markChatAsRead(partnerId);
  });
  state.activeMessageListener = true;
  state.currentChatPartner = partnerId;
  markChatAsRead(partnerId);
}

async function sendMessage(text, imageFile = null) {
  if (!state.currentChatPartner) return alert("Select a friend first");
  let chatId = state.currentUID < state.currentChatPartner ? `${state.currentUID}_${state.currentChatPartner}` : `${state.currentChatPartner}_${state.currentUID}`;
  let imageUrl = null;
  if (imageFile) {
    let fd = new FormData();
    fd.append("image", imageFile);
    let res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
    let data = await res.json();
    if (data.success) imageUrl = data.data.url;
  }
  await db.ref(`messages/${chatId}`).push({
    from: state.currentUID,
    text: text || "",
    image: imageUrl,
    timestamp: Date.now()
  });
  document.getElementById("chatInput").value = "";
  updateUnreadBadge();
}

async function loadChatUsers() {
  let following = (await db.ref(`following/${state.currentUID}`).once("value")).val() || {};
  let html = `<div class="glass-card" style="padding:16px; font-weight:600;">💬 Direct messages</div>`;
  for (let fid of Object.keys(following)) {
    let userSnap = await db.ref(`users/${fid}`).once("value");
    if (userSnap.val()) {
      let user = userSnap.val();
      html += `<div class="chat-user" data-uid="${fid}"><img class="avatar" style="width:48px;" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}"><div><strong>${escapeHtml(user.name)}</strong></div></div>`;
    }
  }
  document.getElementById("chatUserList").innerHTML = html;
  document.querySelectorAll(".chat-user").forEach(el => {
    el.onclick = () => {
      let uid = el.dataset.uid;
      state.currentChatPartner = uid;
      listenMessagesWithReadTracking(uid);
    };
  });
}

// ================ RENDERING & MODULAR ACTIONS ================
async function loadHomeFeed() {
  let snap = await db.ref("posts").once("value");
  let posts = snap.val() || {};
  let arr = Object.entries(posts).map(([id, p]) => ({ id, ...p })).sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 30);
  let html = "";
  for (let p of arr) {
    let userSnap = await db.ref(`users/${p.userId}`).once("value");
    html += renderPost(p.id, p, userSnap.val() || { name: "user" });
  }
  document.getElementById("homeFeed").innerHTML = html || "<div class='glass-card' style='padding:48px; text-align:center;'>✨ No posts yet</div>";
  attachGlobalPostEvents();
}

async function loadFriendsFeed() {
  let following = (await db.ref(`following/${state.currentUID}`).once("value")).val() || {};
  let friendIds = Object.keys(following);
  let allPosts = (await db.ref("posts").once("value")).val() || {};
  let html = "";
  for (let [pid, p] of Object.entries(allPosts)) {
    if (friendIds.includes(p.userId)) {
      let userSnap = await db.ref(`users/${p.userId}`).once("value");
      html += renderPost(pid, p, userSnap.val() || {});
    }
  }
  document.getElementById("friendsFeed").innerHTML = html || "<div class='glass-card' style='padding:40px;'>🤝 Follow friends to see moments</div>";
  attachGlobalPostEvents();
}

function renderPost(postId, post, author) {
  let isLiked = post.likes && post.likes[state.currentUID];
  let likeIcon = isLiked ? "fas fa-heart" : "far fa-heart";
  let mediaHtml = `<div class="${getGridClass(post.images.length)}">${post.images.map(img => `<img class="media-img" src="${img}" loading="lazy">`).join("")}</div>`;
  let captionHtml = post.caption ? `<div class="post-caption" style="padding:12px 16px 4px; font-size:14px;">${escapeHtml(post.caption)}</div>` : '';
  return `<div class="post-card" data-pid="${postId}"><div class="post-header" data-uid="${post.userId}" style="cursor:pointer; padding:16px 18px; display:flex; align-items:center; gap:14px;"><img class="avatar" src="${author.photoURL || 'https://ui-avatars.com/api/?background=3b82f6&color=fff&name=' + encodeURIComponent(author.name)}"><div><strong>${escapeHtml(author.name)}</strong><div style="font-size:12px; color:#6c7a91;">${new Date(post.timestamp).toLocaleString()}</div></div></div>${captionHtml}${mediaHtml}<div class="action-row"><button class="action-btn like-btn" data-pid="${postId}"><i class="${likeIcon}"></i> <span class="like-count">${post.likeCount || 0}</span></button><button class="action-btn comment-open-btn" data-pid="${postId}"><i class="far fa-comment"></i> <span class="comment-count-badge">${post.commentCount || 0}</span> Comment</button><button class="action-btn share-post" data-pid="${postId}"><i class="fas fa-share-alt"></i> Share</button>${post.userId === state.currentUID ? `<button class="action-btn delete-post" data-pid="${postId}" style="color:#ef4444;"><i class="fas fa-trash"></i></button>` : ''}</div></div>`;
}

async function attachGlobalPostEvents() {
  document.querySelectorAll(".like-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      let pid = btn.dataset.pid;
      let likeRef = db.ref(`posts/${pid}/likes/${state.currentUID}`);
      let exists = (await likeRef.get()).exists();
      if (exists) {
        await likeRef.remove();
        await db.ref(`posts/${pid}/likeCount`).transaction(c => (c || 1) - 1);
      } else {
        await likeRef.set(true);
        await db.ref(`posts/${pid}/likeCount`).transaction(c => (c || 0) + 1);
        let postSnap = await db.ref(`posts/${pid}`).once("value");
        let owner = postSnap.val().userId;
        if (owner !== state.currentUID) db.ref(`notifications/${owner}`).push({ type: "like", fromId: state.currentUID, postId: pid, read: false, createdAt: Date.now() });
      }
      loadHomeFeed();
      if (document.getElementById("friendsPage").classList.contains("active-page")) loadFriendsFeed();
    };
  });
  document.querySelectorAll(".comment-open-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await openCommentModal(btn.dataset.pid);
    };
  });
  document.querySelectorAll(".share-post").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showShareMenu(btn.dataset.pid);
    };
  });
  document.querySelectorAll(".post-header").forEach(header => {
    header.onclick = () => {
      window.location.hash = `profile/${header.dataset.uid}`;
    };
  });
  document.querySelectorAll(".delete-post").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm("Delete post?")) {
        await db.ref(`posts/${btn.dataset.pid}`).remove();
        loadHomeFeed();
        if (document.getElementById("friendsPage").classList.contains("active-page")) loadFriendsFeed();
      }
    };
  });
}

// COMMENT MODAL (FULLY ADAPTIVE)
async function openCommentModal(postId) {
  let modalDiv = document.createElement("div");
  modalDiv.className = "comment-modal";
  let postSnap = await db.ref(`posts/${postId}`).once("value");
  let post = postSnap.val();
  if (!post) return;
  modalDiv.innerHTML = `<div class="comment-modal-card"><div class="comment-header"><span>💬 Comments & replies</span><button id="closeCommentModal" style="background:none; border:none; font-size:28px; cursor:pointer;">&times;</button></div><div id="commentListContainer" class="comment-list-area"></div><div class="comment-input-area"><input type="text" id="newCommentText" placeholder="Write a comment..."><button id="submitCommentBtn" class="btn-glow" style="padding:10px 24px;">Post</button></div></div>`;
  document.body.appendChild(modalDiv);
  
  async function refreshCommentsAndReplies() {
    let commentsSnap = await db.ref(`comments/${postId}`).once("value");
    let comments = commentsSnap.val() || {};
    let container = modalDiv.querySelector("#commentListContainer");
    let html = "";
    for (let [cid, comm] of Object.entries(comments).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))) {
      let isLikedComment = comm.likes && comm.likes[state.currentUID];
      let likeIcon = isLikedComment ? "fas fa-heart" : "far fa-heart";
      html += `<div class="single-comment" data-cid="${cid}"><div class="comment-avatar-name" style="display:flex; gap:10px; align-items:center; margin-bottom:8px;"><img class="avatar" style="width:36px; height:36px;" src="${comm.authorPhoto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(comm.authorName)}"><strong>${escapeHtml(comm.authorName)}</strong><span style="font-size:11px; color:#94a3b8;">${new Date(comm.timestamp).toLocaleString()}</span></div><div class="comment-text">${escapeHtml(comm.text)}</div><div><button class="like-comment-btn" data-cid="${cid}" data-postid="${postId}" style="background:none; border:none; margin-right:12px;"><i class="${likeIcon}" style="font-size:12px;"></i> <span class="likeCount">${Object.keys(comm.likes || {}).length}</span></button><button class="reply-btn" data-cid="${cid}" style="background:none; border:none;">↩️ Reply</button></div><div class="comments-replies" id="replies-${cid}"></div></div>`;
    }
    container.innerHTML = html || "<div style='padding:30px; text-align:center;'>Start the conversation ✨</div>";
    for (let cid of Object.keys(comments)) {
      let repliesSnap = await db.ref(`commentReplies/${postId}/${cid}`).once("value");
      let replies = repliesSnap.val() || {};
      let repliesContainer = modalDiv.querySelector(`#replies-${cid}`);
      if (repliesContainer) {
        let repliesHtml = "";
        for (let [rid, rep] of Object.entries(replies).sort((a, b) => b[1].timestamp - a[1].timestamp)) {
          repliesHtml += `<div class="reply-item"><strong>${escapeHtml(rep.authorName)}</strong> ${escapeHtml(rep.text)} <span style="font-size:10px;">${new Date(rep.timestamp).toLocaleString()}</span></div>`;
        }
        repliesContainer.innerHTML = repliesHtml || "";
      }
    }
    modalDiv.querySelectorAll(".like-comment-btn").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        let commentId = btn.dataset.cid;
        let likeRef = db.ref(`comments/${postId}/${commentId}/likes/${state.currentUID}`);
        let exists = (await likeRef.get()).exists();
        if (exists) await likeRef.remove();
        else await likeRef.set(true);
        refreshCommentsAndReplies();
      };
    });
    modalDiv.querySelectorAll(".reply-btn").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        let parentCid = btn.dataset.cid;
        let replyInput = prompt("Write your reply:");
        if (replyInput && replyInput.trim()) addReplyToComment(postId, parentCid, replyInput);
      };
    });
  }
  
  async function addReplyToComment(postId, commentId, replyText) {
    let replyId = db.ref(`commentReplies/${postId}/${commentId}`).push().key;
    let userData = (await db.ref(`users/${state.currentUID}`).once("value")).val();
    await db.ref(`commentReplies/${postId}/${commentId}/${replyId}`).set({
      authorId: state.currentUID,
      authorName: userData.name || "user",
      text: replyText,
      timestamp: Date.now()
    });
    refreshCommentsAndReplies();
  }
  
  await refreshCommentsAndReplies();
  document.getElementById("submitCommentBtn").onclick = async () => {
    let text = modalDiv.querySelector("#newCommentText").value.trim();
    if (!text) return;
    let userData = (await db.ref(`users/${state.currentUID}`).once("value")).val();
    let newCommentId = db.ref(`comments/${postId}`).push().key;
    await db.ref(`comments/${postId}/${newCommentId}`).set({
      authorId: state.currentUID,
      authorName: userData.name,
      authorPhoto: userData.photoURL,
      text: text,
      timestamp: Date.now(),
      likes: {}
    });
    let currentCount = (await db.ref(`posts/${postId}/commentCount`).once("value")).val() || 0;
    await db.ref(`posts/${postId}/commentCount`).set(currentCount + 1);
    modalDiv.querySelector("#newCommentText").value = "";
    refreshCommentsAndReplies();
    loadHomeFeed();
  };
  document.getElementById("closeCommentModal").onclick = () => modalDiv.remove();
}

function showCreatePostModal() {
  let modal = document.createElement("div");
  modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:2000;";
  modal.innerHTML = `<div class="create-post-modal"><h3>✨ New moment</h3><textarea id="postCaption" placeholder="Caption..." rows="3" style="width:100%; border-radius:28px; padding:12px; background:var(--input-bg); color:var(--text-primary); border:1px solid var(--input-border);"></textarea><div id="imagePreviewContainer" class="image-preview-grid"></div><input type="file" id="postImagesInput" multiple accept="image/*" style="margin:12px 0;"><div style="display:flex; gap:12px; margin-top:20px;"><button id="cancelPostBtn" style="background:#eef2ff; border:none; border-radius:40px; padding:10px 20px;">Cancel</button><button id="submitPostBtn" class="btn-glow">Share</button></div></div>`;
  document.body.appendChild(modal);
  let fileInput = modal.querySelector("#postImagesInput");
  let preview = modal.querySelector("#imagePreviewContainer");
  let pending = [];
  fileInput.onchange = () => {
    pending = Array.from(fileInput.files);
    preview.innerHTML = pending.map(f => `<img src="${URL.createObjectURL(f)}" style="width:80px; height:80px; border-radius:20px; margin:4px;">`).join("");
  };
  modal.querySelector("#submitPostBtn").onclick = async () => {
    if (pending.length === 0) {
      alert("Select image");
      return;
    }
    let urls = await uploadToImgBB(pending);
    let postId = db.ref("posts").push().key;
    await db.ref(`posts/${postId}`).set({
      userId: state.currentUID,
      images: urls,
      caption: modal.querySelector("#postCaption").value,
      timestamp: Date.now(),
      likeCount: 0,
      commentCount: 0,
      likes: {}
    });
    loadHomeFeed();
    modal.remove();
  };
  modal.querySelector("#cancelPostBtn").onclick = () => modal.remove();
}

async function showProfilePage(uid) {
  let user = (await db.ref(`users/${uid}`).once("value")).val();
  if (!user) return;
  let postsSnap = await db.ref("posts").orderByChild("userId").equalTo(uid).once("value");
  let posts = postsSnap.val() || {};
  let postsHtml = "";
  for (let [pid, p] of Object.entries(posts).reverse()) {
    postsHtml += `<div style="cursor:pointer;" onclick="window.location.hash='post/${pid}'"><img src="${p.images[0]}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:28px;"></div>`;
  }
  let followersSnap = await db.ref(`followers/${uid}`).once("value");
  let followersCount = followersSnap.exists() ? Object.keys(followersSnap.val()).length : 0;
  let followingSnap = await db.ref(`following/${uid}`).once("value");
  let followingCount = followingSnap.exists() ? Object.keys(followingSnap.val()).length : 0;
  document.getElementById("profileHeader").innerHTML = `<div style="text-align:center;"><img class="avatar-large" style="width:110px; height:110px; border-radius:110px;" src="${user.photoURL || 'https://ui-avatars.com/api/?background=3b82f6&color=fff&name=' + encodeURIComponent(user.name)}"><h2>${escapeHtml(user.name)}</h2></div>`;
  document.getElementById("profileStats").innerHTML = `<div class="stat-item"><div class="stat-number">${Object.keys(posts).length}</div><div>Posts</div></div><div class="stat-item"><div class="stat-number">${followersCount}</div><div>Followers</div></div><div class="stat-item"><div class="stat-number">${followingCount}</div><div>Following</div></div>`;
  if (uid !== state.currentUID) {
    let isFollowing = await db.ref(`followers/${uid}/${state.currentUID}`).once("value").then(s => s.exists());
    document.getElementById("profileActions").innerHTML = `<button id="followProfileBtn" class="btn-glow" style="background:${isFollowing ? '#475569' : '#3b82f6'};">${isFollowing ? 'Unfollow' : 'Follow'}</button><button id="messageProfileBtn" class="btn-glow" style="background:var(--glass-bg); color:var(--text-primary);">Message</button>`;
    document.getElementById("followProfileBtn")?.addEventListener("click", async () => {
      let currently = await db.ref(`followers/${uid}/${state.currentUID}`).once("value").then(s => s.exists());
      if (currently) {
        await db.ref(`followers/${uid}/${state.currentUID}`).remove();
        await db.ref(`following/${state.currentUID}/${uid}`).remove();
      } else {
        await db.ref(`followers/${uid}/${state.currentUID}`).set(true);
        await db.ref(`following/${state.currentUID}/${uid}`).set(true);
        db.ref(`notifications/${uid}`).push({ type: "follow", fromId: state.currentUID, read: false, createdAt: Date.now() });
      }
      showProfilePage(uid);
    });
    document.getElementById("messageProfileBtn")?.addEventListener("click", () => {
      state.currentChatPartner = uid;
      window.location.hash = "messages";
      loadChatUsers();
      listenMessagesWithReadTracking(uid);
    });
  } else {
    document.getElementById("profileActions").innerHTML = "";
  }
  document.getElementById("profilePostsGrid").innerHTML = postsHtml || "<div style='background:var(--glass-bg); border-radius:40px; padding:40px;'>✨ No posts yet</div>";
}

async function applySettings() {
  let userSnap = await db.ref(`users/${state.currentUID}`).once("value");
  let u = userSnap.val();
  document.getElementById("settingsName").value = u?.name || "";
  document.getElementById("settingsAvatar").src = u?.photoURL || 'https://ui-avatars.com/api/?background=3b82f6&color=fff&name=' + encodeURIComponent(u?.name || "");
}

async function showShareMenu(postId) {
  let menu = document.createElement("div");
  menu.className = "floating-share";
  menu.innerHTML = `<div style="font-weight:bold; margin-bottom:12px;">✨ Share to friends</div>`;
  let followSnap = await db.ref(`following/${state.currentUID}`).once("value");
  let friends = followSnap.val() || {};
  for (let fid of Object.keys(friends)) {
    let userSnap = await db.ref(`users/${fid}`).once("value");
    let div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "14px";
    div.style.padding = "8px";
    div.style.cursor = "pointer";
    div.style.borderRadius = "40px";
    div.innerHTML = `<img class="avatar" style="width:38px;" src="${userSnap.val()?.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userSnap.val()?.name)}"><span>${userSnap.val()?.name}</span>`;
    div.onclick = () => {
      db.ref(`notifications/${fid}`).push({ type: "shared_post", fromId: state.currentUID, postId, read: false, createdAt: Date.now() });
      menu.remove();
      alert("Shared!");
    };
    menu.appendChild(div);
  }
  document.body.appendChild(menu);
  setTimeout(() => menu.remove(), 5000);
}

// ================ ROUTING WITH HISTORY SUPPORT ================
function handleRoute() {
  let hash = window.location.hash.slice(1) || "home";
  let [route, param] = hash.split("/");
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
  if (route === "home") document.getElementById("homePage").classList.add("active-page");
  else if (route === "friends") document.getElementById("friendsPage").classList.add("active-page");
  else if (route === "search") document.getElementById("searchPage").classList.add("active-page");
  else if (route === "messages") {
    document.getElementById("messagesPage").classList.add("active-page");
    loadChatUsers();
    if (state.currentChatPartner) listenMessagesWithReadTracking(state.currentChatPartner);
    else if (document.querySelector(".chat-user")) document.querySelector(".chat-user")?.click();
    updateUnreadBadge();
  } else if (route === "profile") {
    document.getElementById("profilePage").classList.add("active-page");
    showProfilePage(param || state.currentUID);
  } else if (route === "notifications") {
    document.getElementById("notificationsPage").classList.add("active-page");
    loadNotificationsPage();
  } else if (route === "settings") {
    document.getElementById("settingsPage").classList.add("active-page");
    applySettings();
  } else {
    document.getElementById("homePage").classList.add("active-page");
    loadHomeFeed();
  }
  document.querySelectorAll(".nav-item").forEach(btn => {
    if (btn.dataset.route === route) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  if (route === "home") loadHomeFeed();
  if (route === "friends") loadFriendsFeed();
  if (route === "search") document.getElementById("searchInput").oninput = (e) => searchUsers(e.target.value);
}

async function loadNotificationsPage() {
  let notifsSnap = await db.ref(`notifications/${state.currentUID}`).once("value");
  let notifs = notifsSnap.val() || {};
  let html = "";
  for (let [nid, n] of Object.entries(notifs).reverse()) {
    let fromUser = (await db.ref(`users/${n.fromId}`).once("value")).val();
    html += `<div class="glass-card" style="padding:18px; margin-bottom:14px; cursor:pointer;" data-notif='${JSON.stringify(n)}'>🔔 <strong>${fromUser?.name || "Someone"}</strong> ${n.type.replace("_", " ")}</div>`;
    await db.ref(`notifications/${state.currentUID}/${nid}/read`).set(true);
  }
  document.getElementById("notificationsList").innerHTML = html || "<div class='glass-card'>✨ No new notifications</div>";
  document.querySelectorAll("[data-notif]").forEach(el => {
    el.onclick = () => {
      let notif = JSON.parse(el.dataset.notif);
      if (notif.postId) window.location.hash = `post/${notif.postId}`;
      else window.location.hash = `profile/${notif.fromId}`;
    };
  });
  updateBadge();
}

async function updateBadge() {
  let snap = await db.ref(`notifications/${state.currentUID}`).once("value");
  let unread = Object.values(snap.val() || {}).filter(n => !n.read).length;
  let badge = document.getElementById("globalNotifBadge");
  if (unread > 0) {
    badge.innerText = unread;
    badge.style.display = "flex";
  } else badge.style.display = "none";
}

async function searchUsers(query) {
  if (!query.trim()) {
    document.getElementById("searchResults").innerHTML = "";
    return;
  }
  let usersSnap = await db.ref("users").once("value");
  let users = usersSnap.val() || {};
  let html = "";
  for (let [uid, data] of Object.entries(users)) {
    if (data.name.toLowerCase().includes(query.toLowerCase()) && uid !== state.currentUID) {
      html += `<div class="chat-user" data-uid="${uid}"><img class="avatar" src="${data.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.name)}"><div><strong>${escapeHtml(data.name)}</strong></div></div>`;
    }
  }
  document.getElementById("searchResults").innerHTML = html || "<div>No users found</div>";
  document.querySelectorAll("#searchResults .chat-user").forEach(el => {
    el.onclick = () => {
      window.location.hash = `profile/${el.dataset.uid}`;
    };
  });
}

function initTheme() {
  const saved = localStorage.getItem('flouTheme');
  if (saved === 'dark') document.body.classList.add('dark');
  const toggle = document.getElementById('themeToggleSwitch');
  if (toggle) {
    if (document.body.classList.contains('dark')) toggle.classList.add('active');
    toggle.onclick = () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('flouTheme', isDark ? 'dark' : 'light');
      toggle.classList.toggle('active', isDark);
    };
  }
}

// ================ AUTH LISTENER & UI BINDINGS ================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.currentUser = user;
    state.currentUID = user.uid;
    let userRef = db.ref(`users/${user.uid}`);
    let snap = await userRef.once("value");
    if (!snap.exists()) await userRef.set({ name: user.email.split("@")[0], email: user.email, photoURL: null });
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("appMain").style.display = "block";
    setupGlobalMessageListener();
    handleRoute();
    db.ref(`notifications/${state.currentUID}`).on("value", () => updateBadge());
    initTheme();
  } else {
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("appMain").style.display = "none";
    document.getElementById("loginView").style.display = "block";
    document.getElementById("signupView").style.display = "none";
    document.getElementById("resetView").style.display = "none";
    initTheme();
  }
});

window.addEventListener("hashchange", handleRoute);

// DOM Event Listeners
document.getElementById("doLoginBtn").onclick = () => auth.signInWithEmailAndPassword(document.getElementById("loginEmail").value, document.getElementById("loginPassword").value).catch(e => alert(e.message));
document.getElementById("doSignupBtn").onclick = () => auth.createUserWithEmailAndPassword(document.getElementById("signupEmail").value, document.getElementById("signupPassword").value).then(async (cred) => {
  await db.ref(`users/${cred.user.uid}`).set({ name: document.getElementById("signupName").value, email: cred.user.email, photoURL: null });
}).catch(e => alert(e.message));
document.getElementById("showSignupLink").onclick = () => { document.getElementById("loginView").style.display = "none"; document.getElementById("signupView").style.display = "block"; };
document.getElementById("backToLoginBtn").onclick = () => { document.getElementById("signupView").style.display = "none"; document.getElementById("loginView").style.display = "block"; };
document.getElementById("showForgotLink").onclick = () => { document.getElementById("loginView").style.display = "none"; document.getElementById("resetView").style.display = "block"; };
document.getElementById("sendResetBtn").onclick = () => auth.sendPasswordResetEmail(document.getElementById("resetEmail").value).then(() => alert("Reset email sent")).catch(e => alert(e.message));
document.getElementById("backToLoginReset").onclick = () => { document.getElementById("resetView").style.display = "none"; document.getElementById("loginView").style.display = "block"; };
document.getElementById("createPostFab").onclick = showCreatePostModal;
document.getElementById("sendMsgButton").onclick = () => { let msg = document.getElementById("chatInput").value; if (msg.trim()) sendMessage(msg); };
document.getElementById("attachImageButton").onclick = () => document.getElementById("chatImageInput").click();
document.getElementById("chatImageInput").onchange = async (e) => { if (e.target.files[0]) { await sendMessage("", e.target.files[0]); document.getElementById("chatImageInput").value = ""; } };
document.querySelectorAll(".nav-item").forEach(btn => { btn.onclick = () => { window.location.hash = btn.dataset.route; }; });
document.getElementById("settingsAvatarClick")?.addEventListener("click", () => document.getElementById("avatarUploadInput").click());
document.getElementById("avatarUploadInput")?.addEventListener("change", async (e) => {
  if (e.target.files[0]) {
    let url = await uploadToImgBB([e.target.files[0]]);
    if (url[0]) {
      await db.ref(`users/${state.currentUID}/photoURL`).set(url[0]);
      applySettings();
      showProfilePage(state.currentUID);
      alert("Avatar updated");
    }
  }
});
document.getElementById("updateNameBtn")?.addEventListener("click", async () => {
  let newName = document.getElementById("settingsName").value.trim();
  if (newName) {
    await db.ref(`users/${state.currentUID}/name`).set(newName);
    alert("Updated");
    applySettings();
    showProfilePage(state.currentUID);
  }
});
document.getElementById("settingsResetPwdBtn")?.addEventListener("click", () => auth.sendPasswordResetEmail(state.currentUser.email).then(() => alert("Reset link sent")));
document.getElementById("settingsDeleteAccountBtn")?.addEventListener("click", async () => {
  let pwd = prompt("Enter password:");
  if (pwd) {
    let cred = firebase.auth.EmailAuthProvider.credential(state.currentUser.email, pwd);
    await state.currentUser.reauthenticateWithCredential(cred);
    await state.currentUser.delete();
    await db.ref(`users/${state.currentUID}`).remove();
    auth.signOut();
  }
});
document.getElementById("settingsLogoutBtn")?.addEventListener("click", () => auth.signOut());
document.getElementById("openSettingsBtn")?.addEventListener("click", () => window.location.hash = "settings");
document.getElementById("logoutProfileBtn")?.addEventListener("click", () => auth.signOut());
document.getElementById("notifIconBtn")?.addEventListener("click", () => window.location.hash = "notifications");

window.updateUnreadBadge = updateUnreadBadge;