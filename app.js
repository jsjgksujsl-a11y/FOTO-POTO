import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// Add the project URL and publishable key from Supabase before deployment.
// Never put a Supabase service-role key or Gemini API key in this file.
const SUPABASE_URL = "https://vpefqotymnfimtfgqwpi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_vNHCLd34pusrbWi3KAf_3A_KQMbZm1P";
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (selector) => document.querySelector(selector);
const feed = $("#feed");
const authDialog = $("#auth-dialog");
const composerDialog = $("#composer-dialog");
let currentUser = null;
let selectedFile = null;
let authMode = "login";
let postsCache = [];
let currentProfile = null;
let profileRequired = false;
let themeMode = 'dark';

function notice(message, error = false) {
  const el = $("#status-banner");
  el.textContent = message;
  el.classList.remove("hidden", "error");
  if (error) el.classList.add("error");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function clearNotice() { $("#status-banner").classList.add("hidden"); }
function initials(user) { return (user?.email?.[0] || "F").toUpperCase(); }
function timeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "только что";
  if (seconds < 3600) return Math.floor(seconds / 60) + " мин. назад";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " ч. назад";
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function displayName() { return currentProfile?.username || "Участник"; }
function applyTheme(mode, color) {
  themeMode = mode;
  const root = document.documentElement;
  const light = mode === "light";
  root.dataset.theme = mode;
  const values = light
    ? ["#f4f5f7","#ffffff","#eef0f3","#dedfe5","#20212a","#6d707c"]
    : ["#101014","#19191f","#202027","#2c2c35","#f5f4f7","#92919d"];
  ["--bg","--panel","--panel2","--line","--text","--muted"].forEach((key,i)=>root.style.setProperty(key,values[i]));
  root.style.setProperty("--accent", color || (light ? "#7b9f35" : "#c7f36b"));
  root.style.setProperty("--accent2", color || (light ? "#7b9f35" : "#a7d84d"));
  localStorage.setItem("foto-poto-theme", JSON.stringify({mode,color:color||""}));
}
function openProfile() {
  if (!currentUser) return openAuth();
  $("#profile-username").value = currentProfile?.username || "";
  $("#profile-message").textContent = "";
  $("#profile-save").textContent = currentProfile ? "Сохранить изменения" : "Создать профиль";
  $("#profile-close").classList.toggle("hidden", profileRequired);
  $("#profile-signout").classList.toggle("hidden", profileRequired);
  $("#profile-dialog").showModal();
}
async function loadProfile(user) {
  currentProfile = null;
  profileRequired = false;
  if (!user || !configured) { $("#profile-open").classList.add("hidden"); return; }
  $("#profile-open").classList.remove("hidden");
  const {data,error} = await supabase.from("profiles").select("id,username").eq("id",user.id).maybeSingle();
  if (error) { notice("Не удалось загрузить профиль: " + error.message,true); return; }
  currentProfile = data;
  profileRequired = !data;
  $("#profile-open").textContent = data?.username?.slice(0,1).toUpperCase() || "?";
  if (!data) {
    $("#profile-username").value = "";
    $("#profile-message").textContent = "Сначала придумай уникальный ник.";
    $("#profile-save").textContent = "Создать профиль";
    $("#profile-close").classList.add("hidden");
    $("#profile-signout").classList.add("hidden");
    if (!$("#profile-dialog").open) $("#profile-dialog").showModal();
  }
}

function setUser(user) {
  currentUser = user;
  $("#user-label").textContent = user ? (currentProfile?.username || "Настрой профиль") : "Гость";
  $("#profile-open").classList.toggle("hidden", !user);
  $("#profile-open").textContent = currentProfile?.username?.slice(0,1).toUpperCase() || "?";
  $("#auth-open").classList.toggle("hidden", !!user);
  $("#sign-out").classList.toggle("hidden", !user);
  $("#publish-hint").textContent = user
    ? "Фото сначала проверит Gemini. Если проверка не пройдёт, публикация не появится в ленте."
    : "Для публикации войди в аккаунт. Фото проверяются на откровенный сексуальный контент.";
}
function showEmpty(title, subtitle) {
  feed.innerHTML = "";
  const box = document.createElement("div");
  box.className = "panel empty-state";
  box.innerHTML = '<div class="empty-icon">✧</div>';
  const h = document.createElement("h3"); h.textContent = title;
  const p = document.createElement("p"); p.textContent = subtitle;
  box.append(h, p); feed.append(box);
}
function safeText(element, value) { element.textContent = value || ""; }

async function loadFeed() {
  if (!configured) {
    $("#post-count").textContent = "Пока нет публикаций";
    showEmpty("Лента пока пустая", "Здесь будут фотографии, мемы и интересные моменты сообщества. Загляни чуть позже!");
    return;
  }
  const sort = $("#sort-select").value;
  const { data, error } = await supabase.from("posts")
    .select("id,user_id,author_name,caption,tag,image_url,created_at,likes(count),comments(count)")
    .order("created_at", { ascending: false }).limit(60);
  if (error) { showEmpty("Не удалось загрузить ленту", error.message); return; }
  postsCache = data || [];
  if (sort === "popular") postsCache.sort((a,b) => (b.likes?.[0]?.count || 0) - (a.likes?.[0]?.count || 0));
  $("#post-count").textContent = postsCache.length + " публикаций";
  if (!postsCache.length) { showEmpty("Пока нет публикаций", "Когда участники поделятся фотографиями и мемами, они появятся здесь."); return; }
  feed.innerHTML = "";
  for (const post of postsCache) await renderPost(post);
}

async function renderPost(post) {
  const template = $("#post-template").content.cloneNode(true);
  const card = template.querySelector(".post-card");
  const avatar = card.querySelector(".post-avatar");
  safeText(avatar, (post.author_name || "F").slice(0,1).toUpperCase());
  safeText(card.querySelector(".author-name"), post.author_name || "Участник FOTO-POTO");
  safeText(card.querySelector(".post-time"), timeAgo(post.created_at));
  safeText(card.querySelector(".post-tag"), "#" + (post.tag || "Разное"));
  safeText(card.querySelector(".post-caption"), post.caption);
  const image = card.querySelector(".post-image");
  image.src = post.image_url;
  image.alt = "Фото пользователя " + (post.author_name || "");
  const likeButton = card.querySelector(".like-button");
  const likeCount = post.likes?.[0]?.count || 0;
  likeButton.querySelector("span").textContent = likeCount;
  let liked = false;
  if (currentUser) {
    const { data } = await supabase.from("likes").select("id").eq("post_id", post.id).eq("user_id", currentUser.id).maybeSingle();
    liked = !!data;
  }
  likeButton.classList.toggle("liked", liked);
  likeButton.innerHTML = (liked ? "♥ " : "♡ ") + '<span>' + likeCount + '</span>';
  likeButton.addEventListener("click", async () => {
    if (!currentUser) return openAuth();
    likeButton.disabled = true;
    if (liked) {
      const { error } = await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", currentUser.id);
      if (!error) { liked = false; likeButton.classList.remove("liked"); }
    } else {
      const { error } = await supabase.from("likes").insert({ post_id: post.id, user_id: currentUser.id });
      if (!error) { liked = true; likeButton.classList.add("liked"); }
    }
    const count = Math.max(0, likeCount + (liked ? 1 : -1));
    likeButton.innerHTML = (liked ? "♥ " : "♡ ") + '<span>' + count + '</span>';
    likeButton.disabled = false;
  });
  const count = post.comments?.[0]?.count || 0;
  safeText(card.querySelector(".comment-count"), count + " комментариев");
  const commentsBox = card.querySelector(".comments-list");
  const { data: comments } = await supabase.from("comments").select("id,author_name,body,created_at").eq("post_id", post.id).order("created_at", { ascending: true }).limit(3);
  (comments || []).forEach(comment => {
    const row = document.createElement("div"); row.className = "comment";
    const author = document.createElement("strong"); author.textContent = comment.author_name || "Участник";
    const body = document.createElement("span"); body.textContent = comment.body;
    row.append(author, body); commentsBox.append(row);
  });
  card.querySelector(".comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return openAuth();
    const input = event.currentTarget.querySelector("input");
    const body = input.value.trim();
    if (!body) return;
    const { error } = await supabase.from("comments").insert({ post_id: post.id, user_id: currentUser.id, author_name: currentProfile?.username || "Участник", body });
    if (error) notice("Комментарий не отправлен: " + error.message, true);
    else { input.value = ""; await loadFeed(); }
  });
  feed.append(card);
}

function openAuth() { $("#auth-message").textContent = ""; authDialog.showModal(); }
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#auth-title").textContent = signup ? "Создай аккаунт" : "С возвращением!";
  $("#auth-subtitle").textContent = signup ? "Присоединяйся к FOTO-POTO." : "Войди, чтобы публиковать фотографии и общаться.";
  $("#auth-submit").textContent = signup ? "Зарегистрироваться" : "Войти";
  $("#auth-switch").textContent = signup ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться";
}

$("#auth-open").addEventListener("click", openAuth);
$("#profile-open").addEventListener("click", openProfile);
$("#profile-close").addEventListener("click", () => $("#profile-dialog").close());
$("#profile-dialog").addEventListener("cancel", event => { if (profileRequired) event.preventDefault(); });
$("#profile-signout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentProfile = null;
  $("#profile-dialog").close();
  setUser(null);
  await loadFeed();
});
document.querySelectorAll(".theme-choice").forEach(button => button.addEventListener("click", () => {
  const saved = JSON.parse(localStorage.getItem("foto-poto-theme") || "{}");
  applyTheme(button.dataset.theme, saved.color || "");
}));
$("#custom-color").addEventListener("input", event => applyTheme(themeMode, event.target.value));
$("#profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;
  const username = $("#profile-username").value.trim();
  if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(username)) {
    $("#profile-message").textContent = "Используй 3–20 букв, цифр или _.";
    return;
  }
  const save = $("#profile-save");
  save.disabled = true;
  const result = currentProfile
    ? await supabase.from("profiles").update({username, updated_at:new Date().toISOString()}).eq("id", currentUser.id).select("id,username").single()
    : await supabase.from("profiles").insert({id:currentUser.id, username}).select("id,username").single();
  save.disabled = false;
  if (result.error) {
    $("#profile-message").textContent = result.error.code === "23505" ? "Этот ник уже занят. Придумай другой." : "Не удалось сохранить: " + result.error.message;
    return;
  }
  currentProfile = result.data;
  profileRequired = false;
  $("#user-label").textContent = currentProfile.username;
  $("#profile-open").textContent = currentProfile.username.slice(0,1).toUpperCase();
  $("#profile-close").classList.remove("hidden");
  $("#profile-signout").classList.remove("hidden");
  $("#profile-dialog").close();
  notice("Профиль сохранён!");
  await loadFeed();
});
const savedTheme = JSON.parse(localStorage.getItem("foto-poto-theme") || "null");
if (savedTheme) applyTheme(savedTheme.mode, savedTheme.color);

$("#google-signin").addEventListener("click", async () => {
  if (!configured) {
    $("#auth-message").textContent = "Сначала подключи Supabase и включи Google в Authentication → Sign In / Providers.";
    return;
  }
  const button = $("#google-signin");
  button.disabled = true;
  button.textContent = "Переходим к Google...";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: "https://jsjgksujsl-a11y.github.io/FOTO-POTO/" }
  });
  if (error) {
    $("#auth-message").textContent = "Не удалось войти через Google: " + error.message;
    button.disabled = false;
    button.innerHTML = '<span class="google-g">G</span> Продолжить с Google';
  }
});
$("#auth-switch").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured) return $("#auth-message").textContent = "Сначала подключи Supabase (см. README).";
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  $("#auth-submit").disabled = true;
  const result = authMode === "signup"
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  $("#auth-submit").disabled = false;
  if (result.error) { $("#auth-message").textContent = result.error.message; return; }
  if (authMode === "signup" && !result.data.session) {
    $("#auth-message").textContent = "Проверь почту и подтверди регистрацию.";
    return;
  }
  authDialog.close(); setUser(result.data.user); clearNotice(); await loadFeed();
});
$("#sign-out").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  setUser(null); await loadFeed();
});
$("#sort-select").addEventListener("change", loadFeed);
$("#feed-nav").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
function openComposer() {
  if (!currentUser) return openAuth();
  if (!currentProfile) return openProfile();
  composerDialog.showModal();
}
$("#create-post-open").addEventListener("click", openComposer);
$("#new-post-nav").addEventListener("click", openComposer);
$("#composer-close").addEventListener("click", () => composerDialog.close());
composerDialog.addEventListener("click", (event) => { if (event.target === composerDialog) composerDialog.close(); });
$("#photo-file").addEventListener("change", (event) => {
  selectedFile = event.target.files?.[0] || null;
  if (!selectedFile) return;
  if (!["image/jpeg","image/png","image/webp"].includes(selectedFile.type) || selectedFile.size > 5 * 1024 * 1024) {
    selectedFile = null; event.target.value = ""; $("#image-preview").classList.add("hidden");
    notice("Выбери JPG, PNG или WEBP размером до 5 МБ.", true); return;
  }
  $("#image-preview").src = URL.createObjectURL(selectedFile);
  $("#image-preview").classList.remove("hidden");
  $("#upload-zone").querySelector("strong").textContent = selectedFile.name;
  clearNotice();
});
$("#post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured) return notice("Backend ещё не подключён. Сначала настрой Supabase по README.", true);
  if (!currentUser) return openAuth();
  if (!selectedFile) return notice("Сначала выбери фотографию.", true);
  const button = $("#publish-button");
  button.disabled = true; button.textContent = "Проверяем фото...";
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject; reader.readAsDataURL(selectedFile);
    });
    const { data: moderation, error: moderationError } = await supabase.functions.invoke("moderate-image", {
      body: { imageBase64: base64, mimeType: selectedFile.type }
    });
    if (moderationError || !moderation?.approved) {
      throw new Error(moderation?.message || moderationError?.message || "Gemini не разрешил публикацию. Попробуй другое фото.");
    }
    button.textContent = "Загружаем...";
    const extension = selectedFile.type === "image/png" ? "png" : selectedFile.type === "image/webp" ? "webp" : "jpg";
    const path = currentUser.id + "/" + crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await supabase.storage.from("photos").upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from("photos").getPublicUrl(path);
    const caption = $("#caption").value.trim();
    const { error: postError } = await supabase.from("posts").insert({
      user_id: currentUser.id,
      author_name: currentProfile?.username || "Участник",
      caption,
      tag: $("#post-tag").value,
      image_url: publicUrl.publicUrl,
      storage_path: path
    });
    if (postError) {
      await supabase.storage.from("photos").remove([path]);
      throw postError;
    }
    $("#post-form").reset(); selectedFile = null;
    $("#image-preview").removeAttribute("src"); $("#image-preview").classList.add("hidden");
    $("#upload-zone").querySelector("strong").textContent = "Выбрать фотографию";
    composerDialog.close();
    notice("Готово! Фото прошло проверку и опубликовано.");
    await loadFeed();
  } catch (error) {
    notice(error.message || "Не получилось опубликовать фото.", true);
  } finally {
    button.disabled = false; button.innerHTML = 'Опубликовать <span>↗</span>';
  }
});

if (configured) {
  supabase.auth.getSession().then(async ({ data }) => { const user = data.session?.user || null; await loadProfile(user); setUser(user); loadFeed(); });
  supabase.auth.onAuthStateChange(async (_event, session) => { const user = session?.user || null; await loadProfile(user); setUser(user); loadFeed(); });
} else {
  setUser(null);
  $("#post-count").textContent = "Ожидает настройки";
  showEmpty("Лента пока пустая", "Здесь будут фотографии и мемы сообщества. Публикации появятся после подключения сервера.");
}
setAuthMode("login");
