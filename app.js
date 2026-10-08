const app = document.getElementById("app");
const cfg = window.NTALK_CONFIG || {};
const hasSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const sb = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL.replace(/\/rest\/v1\/?$/,""), cfg.SUPABASE_ANON_KEY) : null;

const state = {
  user: JSON.parse(localStorage.getItem("ntalk_user") || "null"),
  page: "chats",
  activeChat: null,
  chatTab: "chats",
  chats: [],
  people: [],
  messages: [],
  channel: null,
  presence: null,
  signal: null,
  typingTimer: null,
  theme: localStorage.getItem("ntalk_theme") || "dark",
  call: null
};
let peer = null, localStream = null, pendingIce = [];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const uid = () => state.user?.id || "";
const meName = () => state.user?.name || "NTalk User";
const saveUser = () => localStorage.setItem("ntalk_user", JSON.stringify(state.user));
const avatarName = n => (String(n || "N").trim()[0] || "N").toUpperCase();
const fmt = d => d ? new Date(d).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "";

function ico(name){
  const p={
    chat:'<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z"/>',
    phone:'<path d="M7 4h3l1.5 4-2 1.5a15 15 0 0 0 5 5l1.5-2 4 1.5v3c0 1-1 1.5-2 1.5C11 18.5 5.5 13 5.5 6c0-1 .5-2 1.5-2Z"/>',
    video:'<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3Z"/>',
    users:'<path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3"/><path d="M17 11a3 3 0 1 0-1-5.8M17 15h1.5A3.5 3.5 0 0 1 22 18.5V20"/>',
    user:'<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    attach:'<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    send:'<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    camera:'<path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    theme:'<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
    download:'<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${p[name] || p.chat}</svg>`;
}

function loginView(){
 return `<main class="auth"><section class="auth-card">
 <div class="brand"><div class="logo">N</div><div><h1>NTalk</h1><p>Private. Real-time. Simple.</p></div></div>
 <div class="auth-tabs"><button class="active">Login</button><button onclick="registerMode()">Create account</button></div>
 <label>Email</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com">
 <label>Password</label><input id="password" type="password" autocomplete="current-password" placeholder="Your password">
 <button class="primary wide" onclick="doLogin()">Login</button>
 <p class="muted center">${hasSupabase?"Connected to NTalk backend":"Supabase configuration missing"}</p>
 </section></main>`;
}
function registerMode(){
 app.innerHTML=`<main class="auth"><section class="auth-card">
 <div class="brand"><div class="logo">N</div><div><h1>NTalk</h1><p>Create your account</p></div></div>
 <label>Display name</label><input id="name" placeholder="Your name">
 <label>Username</label><input id="username" placeholder="@yourname">
 <label>Email</label><input id="email" type="email" placeholder="you@example.com">
 <label>Password</label><input id="password" type="password" placeholder="At least 6 characters">
 <button class="primary wide" onclick="doRegister()">Create account</button>
 <button class="ghost wide" onclick="render()">Back to login</button>
 </section></main>`;
}
async function doLogin(){
 const email=document.getElementById("email").value.trim(), password=document.getElementById("password").value;
 if(!email||!password)return alert("Enter email and password.");
 if(!hasSupabase)return alert("Supabase is not configured.");
 const {data,error}=await sb.auth.signInWithPassword({email,password});
 if(error)return alert(error.message);
 await loadProfile(data.user); await initBackend(); render();
}
async function doRegister(){
 const name=document.getElementById("name").value.trim()||"NTalk User";
 const username=(document.getElementById("username").value.trim()||"ntalkuser").replace(/^@/,"").toLowerCase();
 const email=document.getElementById("email").value.trim(), password=document.getElementById("password").value;
 if(!email||password.length<6)return alert("Enter a valid email and a password of 6+ characters.");
 if(!/^[a-z0-9_]{3,24}$/.test(username))return alert("Username: 3-24 characters, letters/numbers/underscore only.");
 const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name,username}}});
 if(error)return alert(error.message);
 if(!data.user)return;
 const {error:pe}=await sb.from("profiles").upsert({id:data.user.id,username,display_name:name});
 if(pe)return alert(pe.message);
 if(data.session){await loadProfile(data.user);await initBackend();render();}
 else alert("Account created. Email confirmation is currently enabled in Supabase, so confirm the email before login.");
}
async function loadProfile(user){
 const {data}=await sb.from("profiles").select("id,username,display_name,avatar_url").eq("id",user.id).maybeSingle();
 state.user={id:user.id,email:user.email,name:data?.display_name||user.user_metadata?.display_name||user.email.split("@")[0],username:"@"+(data?.username||user.user_metadata?.username||"user"),avatar_url:data?.avatar_url||null};
 saveUser();
}
async function logout(){
 try{if(state.channel)await sb.removeChannel(state.channel);if(state.presence)await sb.removeChannel(state.presence);if(state.signal)await sb.removeChannel(state.signal);await sb.auth.signOut();}catch{}
 state.user=null; state.chats=[]; state.people=[]; state.messages=[]; localStorage.removeItem("ntalk_user"); endCall(false); render();
}
function setTheme(t){state.theme=t;localStorage.setItem("ntalk_theme",t);render()}
function toggleTheme(){setTheme(state.theme==="dark"?"light":"dark")}

function sidebar(){
 return `<aside class="sidebar"><div class="side-brand"><div class="logo small">N</div><b>NTalk</b><button class="icon-btn" onclick="toggleTheme()">${ico("theme")}</button></div>
 <nav>
 <button class="${state.page==="chats"?"selected":""}" onclick="state.page='chats';state.activeChat=null;render()">${ico("chat")}<span>Chats</span></button>
 <button class="${state.page==="calls"?"selected":""}" onclick="state.page='calls';state.activeChat=null;render()">${ico("phone")}<span>Calls</span></button>
 <button class="${state.page==="groups"?"selected":""}" onclick="state.page='groups';state.activeChat=null;render()">${ico("users")}<span>Groups</span></button>
 <button class="${state.page==="profile"?"selected":""}" onclick="state.page='profile';state.activeChat=null;render()">${ico("user")}<span>Profile</span></button>
 </nav>
 <div class="side-user"><div class="avatar">${esc(avatarName(meName()))}</div><div><b>${esc(meName())}</b><small>${esc(state.user?.username||"@user")}</small></div></div></aside>`;
}

function chatList(){
 const rows=state.chats.map((c,i)=>chatRow(c,i)).join("");
 const people=state.people.map(p=>personRow(p)).join("");
 return `<section class="chat-list">
 <header class="list-head"><div><h2>${state.chatTab==="people"?"People":"Chats"}</h2><p>${state.chatTab==="people"?"Find NTalk users":"Your private conversations"}</p></div><button class="round" onclick="refreshDirectory()" title="Refresh">${ico("plus")}</button></header>
 <div class="search">${ico("search")}<input placeholder="${state.chatTab==="people"?"Search users...":"Search chats..."}" oninput="filterDirectory(this.value)"></div>
 <div class="list-tabs"><button class="${state.chatTab==="chats"?"active":""}" onclick="state.chatTab='chats';render()">Chats</button><button class="${state.chatTab==="people"?"active":""}" onclick="state.chatTab='people';render()">People</button></div>
 <div id="directoryRows">${state.chatTab==="people"?people:(rows||`<div class="empty-small">No conversations yet. Open <b>People</b> and choose a user.</div>`)}</div>
 </section>`;
}
function chatRow(c,i){
 return `<button class="chat-row" onclick="openChat(${i})"><div class="avatar ${c.online?"online":""}">${esc(avatarName(c.name))}</div><div class="chat-info"><b>${esc(c.name)}</b><span>${esc(c.msg||"Tap to chat")}</span></div><div class="chat-meta"><small>${esc(fmt(c.time)||"")}</small>${c.unread?`<em>${c.unread}</em>`:""}</div></button>`;
}
function personRow(p){
 const existing=state.chats.find(c=>c.user_id===p.id);
 return `<button class="chat-row" onclick="startChatWith('${p.id}')"><div class="avatar ${p.online?"online":""}">${esc(avatarName(p.display_name))}</div><div class="chat-info"><b>${esc(p.display_name||p.username)}</b><span>@${esc(p.username)} · ${p.online?"Online":"Offline"}</span></div><div class="chat-meta"><small>${existing?"Chat":"New"}</small></div></button>`;
}
function filterDirectory(v){
 const q=v.toLowerCase();
 const el=document.getElementById("directoryRows"); if(!el)return;
 if(state.chatTab==="people") el.innerHTML=state.people.filter(p=>(p.display_name||"").toLowerCase().includes(q)||(p.username||"").toLowerCase().includes(q)).map(personRow).join("")||`<div class="empty-small">No users found.</div>`;
 else el.innerHTML=state.chats.filter(c=>(c.name||"").toLowerCase().includes(q)||(c.username||"").toLowerCase().includes(q)).map(c=>chatRow(c,state.chats.indexOf(c))).join("")||`<div class="empty-small">No chats found.</div>`;
}
async function refreshDirectory(){await loadPeople();await loadChats();render()}
async function loadPeople(){
 if(!hasSupabase||!uid())return;
 const {data,error}=await sb.from("profiles").select("id,username,display_name,avatar_url").neq("id",uid()).order("display_name");
 if(error){console.warn(error);return;}
 state.people=(data||[]).map(p=>({...p,online:false}));
 updatePresenceFlags();
}
async function loadChats(){
 if(!hasSupabase||!uid())return;
 const {data,error}=await sb.from("chat_members").select("chat_id").eq("user_id",uid());
 if(error){console.warn(error);return;}
 const ids=[...new Set((data||[]).map(x=>x.chat_id))];
 const result=[];
 for(const chatId of ids){
   const {data:members}=await sb.from("chat_members").select("user_id").eq("chat_id",chatId);
   const other=(members||[]).find(m=>m.user_id!==uid());
   if(!other)continue;
   const person=state.people.find(p=>p.id===other.user_id);
   const {data:last}=await sb.from("messages").select("content,message_type,created_at,file_name,sender_id").eq("chat_id",chatId).order("created_at",{ascending:false}).limit(1).maybeSingle();
   result.push({id:chatId,user_id:other.user_id,name:person?.display_name||"NTalk User",username:person?"@"+person.username:"",online:false,msg:last?.content||(last?.message_type==="image"?"Photo":last?.message_type==="video"?"Video":last?"File":"Tap to chat"),time:last?.created_at||"",unread:0});
 }
 state.chats=result;
 updatePresenceFlags();
}
function updatePresenceFlags(){
 const online=new Set(state.onlineUsers||[]);
 state.chats.forEach(c=>c.online=online.has(c.user_id));
 state.people.forEach(p=>p.online=online.has(p.id));
}
async function startChatWith(userId){
 let c=state.chats.find(x=>x.user_id===userId);
 if(!c){
   const {data:my}=await sb.from("chat_members").select("chat_id").eq("user_id",uid());
   for(const row of (my||[])){
     const {data:members}=await sb.from("chat_members").select("user_id").eq("chat_id",row.chat_id);
     if((members||[]).some(m=>m.user_id===userId)){c=state.chats.find(x=>x.id===row.chat_id);break;}
   }
 }
 if(!c){
   const p=state.people.find(x=>x.id===userId);
   const {data:chat,error}=await sb.from("chats").insert({chat_type:"private",created_by:uid()}).select().single();
   if(error)return alert(error.message);
   const {error:me}=await sb.from("chat_members").insert([{chat_id:chat.id,user_id:uid()},{chat_id:chat.id,user_id:userId}]);
   if(me){await sb.from("chats").delete().eq("id",chat.id);return alert(me.message);}
   c={id:chat.id,user_id:userId,name:p?.display_name||"NTalk User",username:p?"@"+p.username:"",online:p?.online||false,msg:"No messages yet",time:"",unread:0};
   state.chats.unshift(c);
 }
 state.activeChat=state.chats.indexOf(c);
 state.chatTab="chats";
 await loadMessages(c);
 subscribeMessageChannel();
 render(); scrollMessages();
}
async function openChat(i){state.activeChat=i;await loadMessages(state.chats[i]);subscribeMessageChannel();render();scrollMessages()}

function conversation(){
 const c=state.chats[state.activeChat];
 if(!c)return `<div class="empty"><div class="logo">N</div><h2>Choose a person</h2><p>Open People to start a private chat.</p></div>`;
 return `<section class="conversation"><header class="chat-head"><button class="mobile-back" onclick="state.activeChat=null;render()">‹</button>
 <div class="avatar ${c.online?"online":""}">${esc(avatarName(c.name))}</div><div><b>${esc(c.name)}</b><small>${c.typing?"typing…":c.online?"● Online":"Offline"}</small></div>
 <div class="head-actions"><button onclick="startCall('voice')">${ico("phone")}</button><button onclick="startCall('video')">${ico("video")}</button><button onclick="chatInfo()">${ico("more")}</button></div></header>
 <div id="messages" class="messages">${state.messages.map(messageBubble).join("")||`<div class="empty-chat">No messages yet. Say hello 👋</div>`}</div>
 <form class="composer" onsubmit="sendMessage(event)"><button type="button" onclick="emoji()">${ico("smile")}</button><input id="msg" autocomplete="off" placeholder="Type a message..." oninput="typingChanged(this.value)"><label class="attach" title="Attach">${ico("attach")}<input id="file" type="file" hidden onchange="uploadMedia(this.files[0])"></label><button class="send" type="submit">${ico("send")}</button></form>
 </section>`;
}
function messageBubble(m){
 const mine=m.sender_id===uid();
 let body=esc(m.content||"");
 if(m.file_path){
   const label=esc(m.file_name||"Attachment");
   body=m.mime_type?.startsWith("image/")?`<img class="media" src="${esc(m._url||"")}" alt="${label}">`:`<a href="${esc(m._url||"#")}" target="_blank" rel="noopener">${ico("attach")} ${label}</a>`;
 }
 const stateIcon=mine?(m.seen_at?"✓✓":m.delivered_at?"✓✓":"✓"):"";
 return `<div class="bubble ${mine?"me":"them"}">${body}<small>${fmt(m.created_at)} ${stateIcon}</small></div>`;
}
async function signedUrl(path){
 const {data,error}=await sb.storage.from("ntalk-media").createSignedUrl(path,3600);
 return error?null:data?.signedUrl||null;
}
async function loadMessages(c){
 if(!hasSupabase||!c)return;
 const {data,error}=await sb.from("messages").select("*").eq("chat_id",c.id).order("created_at",{ascending:true});
 if(error){console.warn(error);state.messages=[];return;}
 state.messages=data||[];
 for(const m of state.messages)if(m.file_path)m._url=await signedUrl(m.file_path);
 const incoming=state.messages.filter(m=>m.sender_id!==uid()&&(!m.seen_at||!m.delivered_at));
 for(const m of incoming)await sb.from("messages").update({delivered_at:m.delivered_at||new Date().toISOString(),seen_at:new Date().toISOString()}).eq("id",m.id);
}
async function sendMessage(e){
 e.preventDefault();
 const input=document.getElementById("msg"), text=input.value.trim(), c=state.chats[state.activeChat];
 if(!text||!c)return;
 const {data,error}=await sb.from("messages").insert({chat_id:c.id,sender_id:uid(),content:text,message_type:"text"}).select().single();
 if(error)return alert(error.message);
 state.messages.push(data); c.msg=text;c.time=data.created_at;input.value="";await notifyTyping(false);render();scrollMessages();
}
function scrollMessages(){setTimeout(()=>{const m=document.getElementById("messages");if(m)m.scrollTop=m.scrollHeight},40)}
function emoji(){const i=document.getElementById("msg");if(i){i.value+=" 😊";i.focus();typingChanged(i.value)}}
function chatInfo(){const c=state.chats[state.activeChat];if(c)alert(`${c.name}\n${c.username||""}`)}

async function uploadMedia(file){
 const c=state.chats[state.activeChat];if(!file||!c)return;
 const path=`${uid()}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
 const {error}=await sb.storage.from("ntalk-media").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
 if(error)return alert(error.message);
 const type=file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"file";
 const {data,error:me}=await sb.from("messages").insert({chat_id:c.id,sender_id:uid(),content:"",message_type:type,file_path:path,file_name:file.name,file_size:file.size,mime_type:file.type}).select().single();
 if(me)return alert(me.message);
 data._url=await signedUrl(path);state.messages.push(data);c.msg=type==="image"?"Photo":type==="video"?"Video":"File";c.time=data.created_at;render();scrollMessages();
}

async function subscribeMessageChannel(){
 if(!hasSupabase||!uid())return;
 if(state.channel)await sb.removeChannel(state.channel);
 state.channel=sb.channel("ntalk-messages-"+uid())
 .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{
   const m=payload.new;
   const c=state.chats.find(x=>x.id===m.chat_id);
   if(!c||m.sender_id===uid())return;
   if(state.activeChat!==null&&c.id===state.chats[state.activeChat]?.id){
     if(m.file_path)m._url=await signedUrl(m.file_path);
     state.messages.push(m);
     await sb.from("messages").update({delivered_at:new Date().toISOString(),seen_at:new Date().toISOString()}).eq("id",m.id);
     render();scrollMessages();
   }else{
     c.unread=(c.unread||0)+1;c.msg=m.content||"Media";c.time=m.created_at;render();
   }
 })
 .on("broadcast",{event:"typing"},({payload})=>{
   const c=state.chats.find(x=>x.id===payload.chat_id);
   if(c&&payload.from!==uid()){c.typing=!!payload.value;if(state.activeChat!==null&&state.chats[state.activeChat]?.id===c.id)render()}
 })
 .subscribe();
}
async function notifyTyping(value){
 const c=state.chats[state.activeChat];if(!state.channel||!c)return;
 await state.channel.send({type:"broadcast",event:"typing",payload:{from:uid(),chat_id:c.id,value}});
}
function typingChanged(v){clearTimeout(state.typingTimer);notifyTyping(!!v);if(v)state.typingTimer=setTimeout(()=>notifyTyping(false),1200)}

async function initPresence(){
 if(!hasSupabase||!uid())return;
 if(state.presence)await sb.removeChannel(state.presence);
 const ch=sb.channel("ntalk-presence",{config:{presence:{key:uid()}}});
 ch.on("presence",{event:"sync"},()=>{const ps=ch.presenceState();state.onlineUsers=Object.keys(ps);updatePresenceFlags();if(state.page==="chats")render()})
 .on("presence",{event:"join"},({key})=>{state.onlineUsers=[...(state.onlineUsers||[]),key];updatePresenceFlags();render()})
 .on("presence",{event:"leave"},({key})=>{state.onlineUsers=(state.onlineUsers||[]).filter(x=>x!==key);updatePresenceFlags();render()});
 await ch.subscribe(async status=>{if(status==="SUBSCRIBED")await ch.track({online_at:new Date().toISOString()})});
 state.presence=ch;
}

function callsView(){return `<section class="full-page"><header><h2>Calls</h2></header><div class="call-card"><div class="avatar">${ico("phone")}</div><div><b>Voice & Video Calls</b><small>Select a person from People, open the chat, then use the call buttons.</small></div></div></section>`}
function groupsView(){return `<section class="full-page"><header><h2>Groups</h2></header><div class="group-card"><div class="avatar">${ico("users")}</div><div><b>Groups</b><small>Private 1-to-1 chat is fully connected. Group chat can be added on the same backend next.</small></div></div></section>`}
function profileView(){return `<section class="full-page profile"><header><h2>Profile</h2><button onclick="logout()" class="danger-text">Logout</button></header><div class="profile-top"><div class="profile-avatar">${esc(avatarName(meName()))}</div><h2>${esc(meName())}</h2><p>${esc(state.user?.username||"@user")}</p><span class="status">Online</span></div><div class="settings-card"><button onclick="installApp()">Install NTalk <span>${ico("download")}</span></button><button onclick="toggleTheme()">Appearance: ${state.theme==="dark"?"Dark":"Light"} <span>${ico("theme")}</span></button><button onclick="alert('Email: '+state.user.email)">Account <span>${ico("user")}</span></button></div></section>`}

function rtcConfig(){
 const ice=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];
 if(cfg.TURN_URL)ice.push({urls:cfg.TURN_URL,username:cfg.TURN_USERNAME,credential:cfg.TURN_CREDENTIAL});
 return {iceServers:ice};
}
async function setupSignaling(){
 if(!hasSupabase||!state.user)return;
 if(state.signal)await sb.removeChannel(state.signal);
 state.signal=sb.channel("ntalk-call-signal",{config:{broadcast:{self:false}}});
 state.signal.on("broadcast",{event:"call"},async({payload})=>{if(payload.to===uid())await onSignal(payload)}).subscribe();
}
async function signal(payload){if(state.signal)await state.signal.send({type:"broadcast",event:"call",payload:{...payload,from:uid(),fromName:meName()}})}
function callTarget(){return state.chats[state.activeChat]?.user_id}
async function startCall(type){
 const to=callTarget();if(!to)return alert("Open a chat first.");
 if(!navigator.mediaDevices?.getUserMedia)return alert("Microphone/camera access is unavailable. Use HTTPS.");
 try{localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"});}catch(e){return alert("Permission denied or device media is unavailable: "+e.message)}
 state.call={role:"caller",type,to,otherName:state.chats[state.activeChat].name,status:"Calling…"};showCallOverlay();
 peer=new RTCPeerConnection(rtcConfig());localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
 peer.onicecandidate=e=>e.candidate&&signal({kind:"ice",to,candidate:e.candidate});peer.ontrack=e=>attachRemote(e.streams[0]);peer.onconnectionstatechange=()=>updateCallStatus(peer.connectionState);
 const offer=await peer.createOffer();await peer.setLocalDescription(offer);await signal({kind:"offer",to,type,offer:{type:offer.type,sdp:offer.sdp}});
}
async function onSignal(p){
 if(p.kind==="offer"){if(state.call)return;state.call={role:"callee",type:p.type,to:p.from,otherName:p.fromName||"NTalk user",status:"Incoming call",offer:p.offer};renderIncomingCall()}
 else if(p.kind==="answer"&&peer){await peer.setRemoteDescription(p.answer);await flushIce()}
 else if(p.kind==="ice"&&peer){if(peer.remoteDescription)await peer.addIceCandidate(p.candidate);else pendingIce.push(p.candidate)}
 else if(p.kind==="reject"||p.kind==="hangup")endCall(false);
}
async function acceptCall(){
 const c=state.call;
 try{localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:c.type==="video"});}catch(e){return alert(e.message)}
 peer=new RTCPeerConnection(rtcConfig());localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
 peer.onicecandidate=e=>e.candidate&&signal({kind:"ice",to:c.to,candidate:e.candidate});peer.ontrack=e=>attachRemote(e.streams[0]);peer.onconnectionstatechange=()=>updateCallStatus(peer.connectionState);
 await peer.setRemoteDescription(c.offer);await flushIce();const answer=await peer.createAnswer();await peer.setLocalDescription(answer);await signal({kind:"answer",to:c.to,answer:{type:answer.type,sdp:answer.sdp}});c.status="Connecting…";showCallOverlay();
}
async function flushIce(){while(pendingIce.length)await peer.addIceCandidate(pendingIce.shift())}
function attachRemote(stream){const v=document.getElementById("remoteVideo");if(v){v.srcObject=stream;v.play?.().catch(()=>{})}document.getElementById("remoteAvatar")?.classList.add("hidden")}
function updateCallStatus(s){if(!state.call)return;state.call.status=s==="connected"?"Connected":s==="failed"?"Connection failed":state.call.status;const e=document.getElementById("callStatus");if(e)e.textContent=state.call.status}
function showCallOverlay(){
 document.querySelector(".call-overlay")?.remove();const c=state.call,video=c.type==="video";
 app.insertAdjacentHTML("beforeend",`<div class="call-overlay ${video?"video":""}"><button class="close-call" onclick="endCall(true)">${ico("x")}</button><div class="call-main">${video?`<video id="remoteVideo" class="remote-video" autoplay playsinline></video><div id="remoteAvatar" class="video-avatar">${esc(avatarName(c.otherName))}</div><video id="localVideo" class="local-video" autoplay muted playsinline></video>`:`<div id="remoteAvatar" class="call-avatar">${esc(avatarName(c.otherName))}</div>`}<div class="call-title"><h1>${video?"Video Call":"Voice Call"}</h1><h2>${esc(c.otherName)}</h2><p id="callStatus">${esc(c.status)}</p></div><div class="call-controls"><button onclick="toggleMute(this)">${ico("mic")}</button>${video?`<button onclick="toggleCamera(this)">${ico("camera")}</button>`:""}<button class="end" onclick="endCall(true)">${ico("phone")}</button></div></div></div>`);
 if(video&&localStream){const v=document.getElementById("localVideo");v.srcObject=localStream;v.play?.().catch(()=>{})}
}
function renderIncomingCall(){
 document.querySelector(".call-overlay")?.remove();const c=state.call;
 app.insertAdjacentHTML("beforeend",`<div class="call-overlay incoming"><div class="incoming-card"><div class="call-avatar">${esc(avatarName(c.otherName))}</div><h2>${esc(c.otherName)}</h2><p>Incoming ${c.type==="video"?"video":"voice"} call</p><div class="incoming-actions"><button class="reject" onclick="rejectCall()">${ico("x")}</button><button class="accept" onclick="acceptCall()">${ico("check")}</button></div></div></div>`);
}
async function rejectCall(){const c=state.call;if(c)await signal({kind:"reject",to:c.to});endCall(false)}
async function endCall(send=true){const c=state.call;if(send&&c?.to)await signal({kind:"hangup",to:c.to});try{peer?.close()}catch{}peer=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;pendingIce=[];state.call=null;document.querySelector(".call-overlay")?.remove()}
function toggleMute(btn){const t=localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;btn.classList.toggle("muted",!t.enabled)}}
function toggleCamera(btn){const t=localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;btn.classList.toggle("muted",!t.enabled)}}

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});
async function installApp(){if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert("Use the browser menu → Install app / Add to Home screen.")}

async function initBackend(){await loadPeople();await loadChats();await subscribeMessageChannel();await initPresence();await setupSignaling()}
function render(){
 document.body.dataset.theme=state.theme;
 if(!state.user){app.innerHTML=loginView();return}
 const center=state.page==="calls"?callsView():state.page==="groups"?groupsView():state.page==="profile"?profileView():chatList();
 app.innerHTML=`<div class="shell">${sidebar()}<main class="main">${center}${state.page==="chats"&&state.activeChat!==null?conversation():state.page==="chats"?`<div class="empty"><div class="logo">N</div><h2>Select a chat</h2><p>Open <b>People</b> to see all registered NTalk users.</p></div>`:""}</main></div>`;
 scrollMessages();
}
window.addEventListener("load",async()=>{
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
 if(hasSupabase){const {data}=await sb.auth.getSession();if(data.session){await loadProfile(data.session.user);await initBackend()}}
 render();
});
