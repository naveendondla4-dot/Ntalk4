const app = document.getElementById("app");

const cfg = window.NTALK_CONFIG || {};

const hasSupabase =
  !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

const sb = hasSupabase
  ? window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    )
  : null;

const state = {
  user: JSON.parse(localStorage.getItem("ntalk_user") || "null"),
  page: "chats",
  activeChat: null,
  theme: localStorage.getItem("ntalk_theme") || "dark",

  chats: [],
  messages: [],

  channel: null,
  presence: null,

  typingTimer: null,
  typing: false,

  call: null
};

let signalChannel = null;
let peer = null;
let localStream = null;
let remoteStream = null;
let pendingIce = [];


/* ===============================
   BASIC HELPERS
================================ */

function save() {
  localStorage.setItem(
    "ntalk_user",
    JSON.stringify(state.user)
  );
}

function uid() {
  return state.user?.id || null;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function avatarName(name) {
  const n = String(name || "N").trim();
  return n ? n.charAt(0).toUpperCase() : "N";
}

function ico(name) {
  const icons = {
    plus: "＋",
    search: "⌕",
    send: "➤",
    smile: "☺",
    attach: "📎",
    phone: "☎",
    video: "▣",
    more: "⋮",
    x: "‹",
    user: "●",
    settings: "⚙",
    logout: "↪",
    back: "‹",
    check: "✓",
    users: "👥",
    call: "☎",
    image: "▧",
    file: "▤"
  };

  return icons[name] || "";
}


/* ===============================
   AUTH
================================ */

async function doLogin() {
  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  if (!email || !password) {
    return alert("Enter email and password.");
  }

  if (!hasSupabase) {
    return alert("Add Supabase URL and key in config.js.");
  }

  const { data, error } =
    await sb.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    return alert(error.message);
  }

  if (data.user) {
    await loadProfile(data.user);
    await initBackend();
    render();
  }
}


async function doRegister() {
  const name =
    document.getElementById("name").value.trim() ||
    "NTalk User";

  const username =
    (
      document.getElementById("username").value.trim() ||
      "ntalkuser"
    )
      .replace(/^@/, "")
      .toLowerCase();

  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  if (!email || password.length < 6) {
    return alert(
      "Enter valid email and password (6+ characters)."
    );
  }

  if (!hasSupabase) {
    return alert(
      "Add Supabase URL and key in config.js."
    );
  }

  const { data, error } =
    await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          username
        }
      }
    });

  if (error) {
    return alert(error.message);
  }

  if (data.user) {
    const { error: profileError } =
      await sb.from("profiles").upsert({
        id: data.user.id,
        username,
        full_name: name
      });

    if (profileError) {
      console.warn(profileError);
    }

    if (data.session) {
      await loadProfile(data.user);
      await initBackend();
      render();
    } else {
      alert(
        "Account created. Check your email if confirmation is enabled, then login."
      );
    }
  }
}


async function logout() {
  try {
    if (state.channel) {
      await sb.removeChannel(state.channel);
    }

    if (signalChannel) {
      await sb.removeChannel(signalChannel);
    }
  } catch (e) {
    console.warn(e);
  }

  state.user = null;
  state.chats = [];
  state.messages = [];
  state.activeChat = null;

  localStorage.removeItem("ntalk_user");

  if (hasSupabase) {
    await sb.auth.signOut();
  }

  render();
}


/* ===============================
   PROFILE
================================ */

async function loadProfile(user) {
  if (!hasSupabase || !user) return;

  const { data, error } =
    await sb
      .from("profiles")
      .select(
        "id,username,full_name,avatar_url"
      )
      .eq("id", user.id)
      .maybeSingle();

  if (error) {
    console.warn(error);
  }

  state.user = {
    id: user.id,
    email: user.email,

    name:
      data?.full_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "NTalk User",

    username:
      "@" +
      (
        data?.username ||
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "ntalkuser"
      ),

    avatar_url:
      data?.avatar_url || null
  };

  save();
}


/* ===============================
   AUTH STATE
================================ */

async function checkSession() {
  if (!hasSupabase) {
    render();
    return;
  }

  const {
    data: { session }
  } = await sb.auth.getSession();

  if (session?.user) {
    await loadProfile(session.user);
    await initBackend();
  }

  render();
}


/* ===============================
   LOGIN / REGISTER UI
================================ */

function authView() {
  return `
    <div class="auth-page">

      <div class="auth-card">

        <div class="auth-logo">N</div>

        <h1>NTalk</h1>

        <p class="auth-sub">
          Private conversations. Simple and fast.
        </p>

        <div class="auth-tabs">
          <button
            class="active"
            onclick="showLogin()">
            Login
          </button>

          <button
            onclick="showRegister()">
            Register
          </button>
        </div>

        <div id="auth-form">
          ${loginForm()}
        </div>

      </div>

    </div>
  `;
}


function loginForm() {
  return `
    <form onsubmit="doLogin();return false;">

      <input
        id="email"
        type="email"
        placeholder="Email"
        autocomplete="email"
        required
      >

      <input
        id="password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
        required
      >

      <button class="primary-btn" type="submit">
        Login
      </button>

    </form>
  `;
}


function registerForm() {
  return `
    <form onsubmit="doRegister();return false;">

      <input
        id="name"
        type="text"
        placeholder="Full name"
        required
      >

      <input
        id="username"
        type="text"
        placeholder="@username"
        required
      >

      <input
        id="email"
        type="email"
        placeholder="Email"
        required
      >

      <input
        id="password"
        type="password"
        placeholder="Password (6+ characters)"
        minlength="6"
        required
      >

      <button class="primary-btn" type="submit">
        Create account
      </button>

    </form>
  `;
}


function showLogin() {
  const form = document.getElementById("auth-form");

  if (form) {
    form.innerHTML = loginForm();
  }

  document
    .querySelectorAll(".auth-tabs button")
    .forEach((b, i) => {
      b.classList.toggle("active", i === 0);
    });
}


function showRegister() {
  const form = document.getElementById("auth-form");

  if (form) {
    form.innerHTML = registerForm();
  }

  document
    .querySelectorAll(".auth-tabs button")
    .forEach((b, i) => {
      b.classList.toggle("active", i === 1);
    });
}


/* ===============================
   CHAT USER CREATION
================================ */

async function newChat() {
  if (!hasSupabase) {
    return alert("Connect Supabase first.");
  }

  const u =
    (
      prompt(
        "Enter their NTalk username (example: @rahul):"
      ) || ""
    )
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (!u) return;

  const { data, error } =
    await sb
      .from("profiles")
      .select(
        "id,username,full_name,avatar_url"
      )
      .eq("username", u)
      .maybeSingle();

  if (error || !data) {
    return alert("User not found.");
  }

  if (data.id === uid()) {
    return alert(
      "You cannot start a chat with yourself."
    );
  }

  let c =
    state.chats.find(
      x => x.user_id === data.id
    );

  if (!c) {
    c = {
      user_id: data.id,

      name:
        data.full_name ||
        data.username,

      username:
        "@" + data.username,

      avatar:
        avatarName(
          data.full_name ||
          data.username
        ),

      online: false,

      msg: "Tap to chat",
      time: "now",
      unread: 0,

      chat_id: null
    };

    state.chats.unshift(c);
  }

  state.activeChat =
    state.chats.indexOf(c);

  await loadMessages(c);

  render();
      }
/* ===============================
   OPEN CHAT
================================ */

async function openChat(i) {
  state.activeChat = i;

  await loadMessages(
    state.chats[i]
  );

  render();
}


/* ===============================
   LOAD PEOPLE
================================ */

async function loadChats() {
  if (!hasSupabase || !uid()) return;

  const {
    data,
    error
  } = await sb
    .from("profiles")
    .select(
      "id,username,full_name,avatar_url"
    )
    .neq("id", uid())
    .order("full_name");

  if (error) {
    console.warn(error);
    return;
  }

  const existing =
    new Map(
      state.chats.map(
        c => [c.user_id, c]
      )
    );

  state.chats =
    (data || []).map(p => {
      const old =
        existing.get(p.id);

      if (old) {
        old.name =
          p.full_name ||
          p.username;

        old.username =
          "@" + p.username;

        old.avatar =
          avatarName(
            p.full_name ||
            p.username
          );

        return old;
      }

      return {
        user_id: p.id,

        name:
          p.full_name ||
          p.username,

        username:
          "@" + p.username,

        avatar:
          avatarName(
            p.full_name ||
            p.username
          ),

        online: false,

        msg: "Tap to chat",
        time: "",
        unread: 0,

        chat_id: null
      };
    });
}


/* ===============================
   CHAT / MESSAGE VIEW
================================ */

function conversation() {
  const c =
    state.chats[
      state.activeChat
    ];

  if (!c) {
    return `
      <div class="empty">

        <div class="logo">N</div>

        <h2>Select a chat</h2>

        <p>
          Start a private conversation.
        </p>

      </div>
    `;
  }

  return `
    <section class="conversation">

      <header class="chat-head">

        <button
          class="mobile-back"
          onclick="
            state.activeChat=null;
            render();
          "
        >
          ${ico("x")}
        </button>

        <div
          class="avatar ${
            c.online ? "online" : ""
          }"
        >
          ${esc(c.avatar)}
        </div>

        <div>
          <b>
            ${esc(c.name)}
          </b>

          <small>
            ${
              c.typing
                ? "typing…"
                : c.online
                  ? "● Online"
                  : "Offline"
            }
          </small>
        </div>

        <div class="head-actions">

          <button
            onclick="startCall('voice')"
          >
            ${ico("phone")}
          </button>

          <button
            onclick="startCall('video')"
          >
            ${ico("video")}
          </button>

          <button
            onclick="chatInfo()"
          >
            ${ico("more")}
          </button>

        </div>

      </header>


      <div
        id="messages"
        class="messages"
      >

        ${
          state.messages.length
            ? state.messages
                .map(messageBubble)
                .join("")
            : `
              <div class="empty-chat">
                No messages yet.
                Say hello.
              </div>
            `
        }

      </div>


      <form
        class="composer"
        onsubmit="sendMessage(event)"
      >

        <button
          type="button"
          onclick="emoji()"
        >
          ${ico("smile")}
        </button>

        <input
          id="msg"
          autocomplete="off"
          placeholder="Type a message..."
          oninput="typingChanged(this.value)"
        >

        <label class="attach">

          ${ico("attach")}

          <input
            id="file"
            type="file"
            hidden
            onchange="
              uploadMedia(this.files[0])
            "
          >

        </label>

        <button
          class="send"
          type="submit"
        >
          ${ico("send")}
        </button>

      </form>

    </section>
  `;
}


/* ===============================
   MESSAGE BUBBLE
================================ */

function messageBubble(m) {
  const mine =
    m.sender_id === uid();

  const media =
    m.file_url
      ? `
        <a
          href="${esc(m.file_url)}"
          target="_blank"
        >
          ${
            m.file_type &&
            m.file_type.startsWith("image/")
              ? `
                <img
                  class="media"
                  src="${esc(m.file_url)}"
                >
              `
              : `
                ${ico("attach")}
                ${esc(
                  m.file_name ||
                  "File"
                )}
              `
          }
        </a>
      `
      : "";

  const text =
    m.content
      ? `
        <div>
          ${esc(m.content)}
        </div>
      `
      : "";

  let status = "";

  if (mine) {
    if (m.seen_at) {
      status = "✓✓";
    } else if (m.delivered_at) {
      status = "✓✓";
    } else {
      status = "✓";
    }
  }

  return `
    <div
      class="bubble ${
        mine ? "me" : "them"
      }"
    >

      ${media}
      ${text}

      <small>
        ${
          new Date(
            m.created_at
          ).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )
        }

        ${
          mine
            ? " " + status
            : ""
        }
      </small>

    </div>
  `;
}


/* ===============================
   FIND / CREATE CHAT
================================ */

async function loadMessages(c) {
  if (!hasSupabase || !c) return;

  let chatId =
    c.chat_id || null;


  /* -------------------------------
     FIND EXISTING CHAT
  -------------------------------- */

  if (!chatId) {

    const {
      data: mine,
      error: mineError
    } = await sb
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", uid());

    if (mineError) {
      console.warn(mineError);
      state.messages = [];
      return;
    }

    const ids =
      (mine || [])
        .map(x => x.chat_id);


    if (ids.length) {

      const {
        data: other,
        error: otherError
      } = await sb
        .from("chat_members")
        .select("chat_id")
        .eq(
          "user_id",
          c.user_id
        )
        .in(
          "chat_id",
          ids
        );

      if (otherError) {
        console.warn(
          otherError
        );
      } else if (
        other &&
        other.length
      ) {
        chatId =
          other[0].chat_id;
      }
    }
  }


  /* -------------------------------
     CREATE NEW CHAT
  -------------------------------- */

  if (!chatId) {

    const {
      data: newChatData,
      error: chatError
    } = await sb
      .from("chats")
      .insert({
        created_by: uid()
      })
      .select("id")
      .single();

    if (chatError) {
      console.warn(chatError);

      alert(
        chatError.message
      );

      return;
    }

    chatId =
      newChatData.id;


    /* Add both users */

    const {
      error: memberError
    } = await sb
      .from("chat_members")
      .insert([
        {
          chat_id: chatId,
          user_id: uid()
        },
        {
          chat_id: chatId,
          user_id: c.user_id
        }
      ]);

    if (memberError) {
      console.warn(
        memberError
      );

      alert(
        memberError.message
      );

      return;
    }
  }


  c.chat_id = chatId;


  /* -------------------------------
     LOAD MESSAGES
  -------------------------------- */

  const {
    data,
    error
  } = await sb
    .from("messages")
    .select("*")
    .eq(
      "chat_id",
      chatId
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );

  if (error) {
    console.warn(error);
    state.messages = [];
    return;
  }

  state.messages =
    data || [];


  /* -------------------------------
     MARK AS SEEN
  -------------------------------- */

  await sb
    .from("messages")
    .update({
      seen_at:
        new Date().toISOString()
    })
    .eq(
      "chat_id",
      chatId
    )
    .neq(
      "sender_id",
      uid()
    )
    .is(
      "seen_at",
      null
    );
}


/* ===============================
   SEND MESSAGE
================================ */

async function sendMessage(e) {
  e.preventDefault();

  const input =
    document.getElementById("msg");

  const text =
    input.value.trim();

  const c =
    state.chats[
      state.activeChat
    ];

  if (!text || !c) return;

  if (!hasSupabase) {
    return alert(
      "Connect Supabase first."
    );
  }


  /* Create/find chat first */

  if (!c.chat_id) {
    await loadMessages(c);
  }

  if (!c.chat_id) {
    return alert(
      "Chat could not be created."
    );
  }


  /* Insert using chat_id */

  const {
    data,
    error
  } = await sb
    .from("messages")
    .insert({
      chat_id: c.chat_id,
      sender_id: uid(),
      content: text
    })
    .select()
    .single();

  if (error) {
    return alert(
      error.message
    );
  }

  state.messages.push(data);

  c.msg = text;
  c.time = "now";

  input.value = "";

  await notifyTyping(false);

  render();

  scrollMessages();
}


/* ===============================
   SCROLL
================================ */

function scrollMessages() {
  setTimeout(() => {

    const m =
      document.getElementById(
        "messages"
      );

    if (m) {
      m.scrollTop =
        m.scrollHeight;
    }

  }, 50);
}


/* ===============================
   EMOJI
================================ */

function emoji() {
  const i =
    document.getElementById("msg");

  if (!i) return;

  i.value += " 😊";
  i.focus();
}


/* ===============================
   CHAT INFO
================================ */

function chatInfo() {
  const c =
    state.chats[
      state.activeChat
    ];

  if (!c) return;

  alert(
    `${c.name}\n${c.username || ""}`
  );
}


/* ===============================
   MEDIA UPLOAD
================================ */

async function uploadMedia(file) {
  const c =
    state.chats[
      state.activeChat
    ];

  if (
    !file ||
    !c ||
    !hasSupabase
  ) {
    return;
  }


  /* Make sure chat exists */

  if (!c.chat_id) {
    await loadMessages(c);
  }

  if (!c.chat_id) {
    return alert(
      "Chat could not be created."
    );
  }


  const ext =
    file.name
      .split(".")
      .pop();


  const path =
    `${uid()}/${crypto.randomUUID()}.${ext}`;


  const bucket =
    cfg.STORAGE_BUCKET ||
    "ntalk-media";


  const {
    error: uploadError
  } = await sb
    .storage
    .from(bucket)
    .upload(
      path,
      file,
      {
        contentType:
          file.type,
        upsert: false
      }
    );

  if (uploadError) {
    return alert(
      uploadError.message
    );
  }


  const {
    data: publicData
  } = sb
    .storage
    .from(bucket)
    .getPublicUrl(path);


  const {
    data,
    error
  } = await sb
    .from("messages")
    .insert({
      chat_id: c.chat_id,
      sender_id: uid(),
      content: "",
      file_url:
        publicData.publicUrl,
      file_name:
        file.name,
      file_type:
        file.type
    })
    .select()
    .single();

  if (error) {
    return alert(
      error.message
    );
  }

  state.messages.push(data);

  c.msg = "Media";
  c.time = "now";

  render();

  scrollMessages();
}


/* ===============================
   REALTIME
================================ */

async function setupRealtime() {
  if (!hasSupabase || !uid()) {
    return;
  }

  if (state.channel) {
    await sb.removeChannel(
      state.channel
    );
  }


  state.channel =
    sb.channel(
      "ntalk-user-" + uid()
    );


  state.channel

    /* ---------------------------
       NEW MESSAGE
    ---------------------------- */

    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },

      async payload => {

        const m =
          payload.new;


        if (
          !m ||
          m.sender_id === uid()
        ) {
          return;
        }


        const chat =
          state.chats.find(
            x =>
              x.chat_id ===
              m.chat_id
          );


        if (!chat) {
          return;
        }


        const active =
          state.activeChat !== null &&
          state.chats[
            state.activeChat
          ] === chat;


        /* Delivered */

        if (m.id) {
          await sb
            .from("messages")
            .update({
              delivered_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              m.id
            );
        }


        if (active) {

          state.messages.push(m);

          await sb
            .from("messages")
            .update({
              seen_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              m.id
            );

          render();

          scrollMessages();

        } else {

          chat.unread =
            (chat.unread || 0) + 1;

          chat.msg =
            m.content ||
            "Media";

          chat.time = "now";

          render();
        }
      }
    )


    /* ---------------------------
       TYPING
    ---------------------------- */

    .on(
      "broadcast",
      {
        event: "typing"
      },

      ({ payload }) => {

        const chat =
          state.chats.find(
            x =>
              x.user_id ===
              payload.from
          );

        if (!chat) return;

        chat.typing =
          !!payload.value;


        if (
          state.activeChat !== null &&
          state.chats[
            state.activeChat
          ] === chat
        ) {
          render();
        }
      }
    )


    .subscribe();
}


/* ===============================
   TYPING
================================ */

async function notifyTyping(value) {
  const c =
    state.chats[
      state.activeChat
    ];

  if (
    !state.channel ||
    !c ||
    !uid()
  ) {
    return;
  }

  await state.channel.send({
    type: "broadcast",

    event: "typing",

    payload: {
      from: uid(),
      to: c.user_id,
      value
    }
  });
}


function typingChanged(value) {
  clearTimeout(
    state.typingTimer
  );

  notifyTyping(
    !!value
  );

  if (value) {

    state.typingTimer =
      setTimeout(
        () =>
          notifyTyping(false),
        1200
      );
  }
   }
/* ===============================
   CALLS VIEW
================================ */

function callsView() {
  return `
    <section class="page-section">

      <div class="page-title">
        <div>
          <h2>Calls</h2>
          <p>Voice and video calls</p>
        </div>
      </div>

      <div class="call-empty">

        <div class="call-icon">
          ${ico("phone")}
        </div>

        <h3>No recent calls</h3>

        <p>
          Your recent NTalk calls
          will appear here.
        </p>

      </div>

    </section>
  `;
}


/* ===============================
   GROUPS VIEW
================================ */

function groupsView() {
  return `
    <section class="page-section">

      <div class="page-title">

        <div>
          <h2>Groups</h2>
          <p>Connect with your groups</p>
        </div>

        <button
          onclick="alert('Group creation will be added soon.')"
        >
          ${ico("plus")}
        </button>

      </div>

      <div class="call-empty">

        <div class="call-icon">
          ${ico("users")}
        </div>

        <h3>No groups yet</h3>

        <p>
          Create a group and start
          chatting together.
        </p>

      </div>

    </section>
  `;
}


/* ===============================
   PROFILE VIEW
================================ */

function profileView() {
  const u = state.user;

  if (!u) {
    return `
      <div class="empty">
        <h2>Not logged in</h2>
      </div>
    `;
  }

  return `
    <section class="page-section">

      <div class="page-title">
        <div>
          <h2>Profile</h2>
          <p>Your NTalk account</p>
        </div>
      </div>


      <div class="profile-card">

        <div class="profile-avatar">
          ${
            u.avatar_url
              ? `
                <img
                  src="${esc(
                    u.avatar_url
                  )}"
                  alt="Profile"
                >
              `
              : esc(
                  avatarName(
                    u.name
                  )
                )
          }
        </div>


        <h2>
          ${esc(u.name)}
        </h2>

        <p>
          ${esc(u.username)}
        </p>

        <p>
          ${esc(u.email)}
        </p>


        <button
          class="secondary-btn"
          onclick="toggleTheme()"
        >
          Toggle theme
        </button>


        <button
          class="danger-btn"
          onclick="logout()"
        >
          ${ico("logout")}
          Logout
        </button>

      </div>

    </section>
  `;
}


/* ===============================
   NEW CALL TARGET
================================ */

async function newCallTarget() {
  if (!hasSupabase) {
    return alert(
      "Connect Supabase first."
    );
  }

  const u =
    (
      prompt(
        "Enter their NTalk username:"
      ) || ""
    )
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

  if (!u) return;


  const {
    data,
    error
  } = await sb
    .from("profiles")
    .select(
      "id,username,full_name"
    )
    .eq(
      "username",
      u
    )
    .maybeSingle();


  if (error || !data) {
    return alert(
      "User not found."
    );
  }


  if (data.id === uid()) {
    return alert(
      "You cannot call yourself."
    );
  }


  state.chats.unshift({
    user_id: data.id,

    name:
      data.full_name ||
      data.username,

    username:
      "@" + data.username,

    avatar:
      avatarName(
        data.full_name ||
        data.username
      ),

    online: false,

    msg: "Ready to call",
    time: "now",
    unread: 0,

    chat_id: null
  });


  state.activeChat = 0;

  render();
}


/* ===============================
   WEBRTC
================================ */

async function startCall(type) {
  const c =
    state.chats[
      state.activeChat
    ];

  if (!c) {
    return alert(
      "Select a chat first."
    );
  }

  if (!hasSupabase) {
    return alert(
      "Connect Supabase first."
    );
  }


  try {

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video:
            type === "video"
        });


    remoteStream =
      new MediaStream();


    peer =
      new RTCPeerConnection({
        iceServers: [
          {
            urls:
              "stun:stun.l.google.com:19302"
          }
        ]
      });


    localStream
      .getTracks()
      .forEach(track => {
        peer.addTrack(
          track,
          localStream
        );
      });


    peer.ontrack =
      event => {

        event.streams[0]
          .getTracks()
          .forEach(track => {

            remoteStream.addTrack(
              track
            );

          });


        const remote =
          document.getElementById(
            "remoteVideo"
          );

        if (remote) {
          remote.srcObject =
            remoteStream;
        }
      };


    peer.onicecandidate =
      event => {

        if (
          event.candidate &&
          signalChannel
        ) {

          signalChannel.send({
            type: "broadcast",

            event: "ice",

            payload: {
              from: uid(),
              to: c.user_id,
              candidate:
                event.candidate
            }
          });

        }
      };


    await setupCallSignal(c);


    const offer =
      await peer.createOffer();

    await peer.setLocalDescription(
      offer
    );


    await signalChannel.send({
      type: "broadcast",

      event: "offer",

      payload: {
        from: uid(),
        to: c.user_id,
        type,
        offer
      }
    });


    state.call = {
      type,
      user: c,
      outgoing: true
    };


    render();

  } catch (error) {

    console.warn(error);

    alert(
      "Camera/microphone permission is required."
    );
  }
}


/* ===============================
   CALL SIGNALING
================================ */

async function setupCallSignal(c) {
  if (signalChannel) {
    await sb.removeChannel(
      signalChannel
    );
  }


  signalChannel =
    sb.channel(
      "ntalk-call-" + uid()
    );


  signalChannel

    .on(
      "broadcast",
      {
        event: "offer"
      },

      async ({ payload }) => {

        if (
          payload.to !== uid()
        ) {
          return;
        }


        try {

          localStream =
            await navigator.mediaDevices
              .getUserMedia({
                audio: true,
                video:
                  payload.type ===
                  "video"
              });


          remoteStream =
            new MediaStream();


          peer =
            new RTCPeerConnection({
              iceServers: [
                {
                  urls:
                    "stun:stun.l.google.com:19302"
                }
              ]
            });


          localStream
            .getTracks()
            .forEach(track => {
              peer.addTrack(
                track,
                localStream
              );
            });


          peer.ontrack =
            event => {

              event.streams[0]
                .getTracks()
                .forEach(track =>
                  remoteStream.addTrack(
                    track
                  )
                );


              const remote =
                document.getElementById(
                  "remoteVideo"
                );

              if (remote) {
                remote.srcObject =
                  remoteStream;
              }
            };


          peer.onicecandidate =
            event => {

              if (
                event.candidate &&
                signalChannel
              ) {

                signalChannel.send({
                  type: "broadcast",

                  event: "ice",

                  payload: {
                    from: uid(),
                    to:
                      payload.from,
                    candidate:
                      event.candidate
                  }
                });

              }
            };


          await peer.setRemoteDescription(
            new RTCSessionDescription(
              payload.offer
            )
          );


          const answer =
            await peer.createAnswer();


          await peer.setLocalDescription(
            answer
          );


          await signalChannel.send({
            type: "broadcast",

            event: "answer",

            payload: {
              from: uid(),
              to: payload.from,
              answer
            }
          });


          state.call = {
            type: payload.type,
            user: c,
            outgoing: false
          };


          render();

        } catch (error) {

          console.warn(error);

          alert(
            "Unable to answer the call."
          );
        }
      }
    )


    .on(
      "broadcast",
      {
        event: "answer"
      },

      async ({ payload }) => {

        if (
          payload.to !== uid() ||
          !peer
        ) {
          return;
        }


        await peer.setRemoteDescription(
          new RTCSessionDescription(
            payload.answer
          )
        );


        for (
          const candidate of pendingIce
        ) {

          try {
            await peer.addIceCandidate(
              candidate
            );
          } catch (e) {
            console.warn(e);
          }

        }


        pendingIce = [];
      }
    )


    .on(
      "broadcast",
      {
        event: "ice"
      },

      async ({ payload }) => {

        if (
          payload.to !== uid() ||
          !payload.candidate
        ) {
          return;
        }


        const candidate =
          new RTCIceCandidate(
            payload.candidate
          );


        if (
          peer &&
          peer.remoteDescription
        ) {

          try {
            await peer.addIceCandidate(
              candidate
            );
          } catch (e) {
            console.warn(e);
          }

        } else {

          pendingIce.push(
            candidate
          );

        }
      }
    )


    .subscribe();
}


/* ===============================
   END CALL
================================ */

function endCall() {

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );
  }


  if (remoteStream) {
    remoteStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );
  }


  if (peer) {
    peer.close();
  }


  localStream = null;
  remoteStream = null;
  peer = null;
  pendingIce = [];

  state.call = null;

  render();
}


/* ===============================
   CALL SCREEN
================================ */

function callView() {

  if (!state.call) {
    return "";
  }


  const c =
    state.call.user;


  return `
    <div class="call-screen">

      <div class="call-user">

        <div class="avatar large">
          ${esc(c.avatar)}
        </div>

        <h2>
          ${esc(c.name)}
        </h2>

        <p>
          ${
            state.call.outgoing
              ? "Calling..."
              : "Connected"
          }
        </p>

      </div>


      ${
        state.call.type === "video"
          ? `
            <video
              id="remoteVideo"
              autoplay
              playsinline
              class="remote-video"
            ></video>
          `
          : ""
      }


      ${
        state.call.type === "video"
          ? `
            <video
              id="localVideo"
              autoplay
              muted
              playsinline
              class="local-video"
            ></video>
          `
          : ""
      }


      <div class="call-controls">

        <button
          onclick="endCall()"
          class="end-call"
        >
          ${ico("phone")}
        </button>

      </div>

    </div>
  `;
}


/* ===============================
   THEME
================================ */

function toggleTheme() {

  state.theme =
    state.theme === "dark"
      ? "light"
      : "dark";


  localStorage.setItem(
    "ntalk_theme",
    state.theme
  );


  document.documentElement
    .setAttribute(
      "data-theme",
      state.theme
    );


  render();
}


/* ===============================
   INSTALL PWA
================================ */

let deferredPrompt = null;


window.addEventListener(
  "beforeinstallprompt",
  event => {

    event.preventDefault();

    deferredPrompt = event;

  }
);


async function installApp() {

  if (!deferredPrompt) {

    return alert(
      "Install option is not available right now. Open NTalk in Chrome and try again."
    );

  }


  deferredPrompt.prompt();

  await deferredPrompt.userChoice;

  deferredPrompt = null;
}


/* ===============================
   BACKEND INIT
================================ */

async function initBackend() {

  if (
    !hasSupabase ||
    !uid()
  ) {
    return;
  }


  await loadChats();

  await setupRealtime();

  await initPresence();
}


/* ===============================
   PRESENCE
================================ */

async function initPresence() {

  if (
    !hasSupabase ||
    !uid()
  ) {
    return;
  }


  if (state.presence) {

    try {
      await sb.removeChannel(
        state.presence
      );
    } catch (e) {
      console.warn(e);
    }

  }


  state.presence =
    sb.channel(
      "presence"
    );


  state.presence
    .on(
      "presence",
      {
        event: "sync"
      },
      () => {

        const presence =
          state.presence
            .presenceState();


        state.chats.forEach(
          chat => {

            chat.online =
              !!presence[
                chat.user_id
              ];

          }
        );


        render();
      }
    )
    .on(
      "presence",
      {
        event: "join"
      },
      () => render()
    )
    .on(
      "presence",
      {
        event: "leave"
      },
      () => render()
    )
    .subscribe(
      async status => {

        if (
          status ===
          "SUBSCRIBED"
        ) {

          await state.presence
            .track({
              user_id: uid(),
              online_at:
                new Date().toISOString()
            });

        }

      }
    );
}


/* ===============================
   MAIN RENDER
================================ */

function render() {

  document.documentElement
    .setAttribute(
      "data-theme",
      state.theme
    );


  if (!state.user) {

    app.innerHTML =
      authView();

    return;
  }


  if (state.call) {

    app.innerHTML =
      callView();

    const local =
      document.getElementById(
        "localVideo"
      );

    if (
      local &&
      localStream
    ) {
      local.srcObject =
        localStream;
    }

    return;
  }


  const active =
    state.activeChat !== null;


  app.innerHTML = `

    <div class="app-shell">

      <aside class="sidebar">

        <div class="brand">
          <div class="logo">N</div>

          <div>
            <b>NTalk</b>
            <small>Private chat</small>
          </div>
        </div>


        <nav>

          <button
            class="${
              state.page === "chats"
                ? "active"
                : ""
            }"
            onclick="
              state.page='chats';
              state.activeChat=null;
              render();
            "
          >
            ${ico("user")}
            <span>Chats</span>
          </button>


          <button
            class="${
              state.page === "calls"
                ? "active"
                : ""
            }"
            onclick="
              state.page='calls';
              state.activeChat=null;
              render();
            "
          >
            ${ico("phone")}
            <span>Calls</span>
          </button>


          <button
            class="${
              state.page === "groups"
                ? "active"
                : ""
            }"
            onclick="
              state.page='groups';
              state.activeChat=null;
              render();
            "
          >
            ${ico("users")}
            <span>Groups</span>
          </button>


          <button
            class="${
              state.page === "profile"
                ? "active"
                : ""
            }"
            onclick="
              state.page='profile';
              state.activeChat=null;
              render();
            "
          >
            ${ico("user")}
            <span>Profile</span>
          </button>

        </nav>


        <div class="sidebar-bottom">

          <button
            onclick="installApp()"
          >
            Install NTalk
          </button>

          <button
            onclick="toggleTheme()"
          >
            Theme
          </button>

          <button
            onclick="logout()"
          >
            ${ico("logout")}
            Logout
          </button>

        </div>

      </aside>


      <main class="main">

        ${
          state.page === "calls"
            ? callsView()

            : state.page === "groups"
              ? groupsView()

              : state.page === "profile"
                ? profileView()

                : `

                  <section class="chat-layout">

                    <aside
                      class="chat-list ${
                        active
                          ? "mobile-hidden"
                          : ""
                      }"
                    >

                      <header class="list-head">

                        <div>
                          <h2>Chats</h2>
                          <small>
                            People on NTalk
                          </small>
                        </div>

                        <button
                          onclick="newChat()"
                        >
                          ${ico("plus")}
                        </button>

                      </header>


                      <div class="people">

                        ${
                          state.chats.length
                            ? state.chats
                                .map(
                                  (c,i) => `
                                    <button
                                      class="person ${
                                        state.activeChat === i
                                          ? "selected"
                                          : ""
                                      }"
                                      onclick="
                                        openChat(${i})
                                      "
                                    >

                                      <div
                                        class="avatar ${
                                          c.online
                                            ? "online"
                                            : ""
                                        }"
                                      >
                                        ${esc(
                                          c.avatar
                                        )}
                                      </div>


                                      <div class="person-info">

                                        <div class="person-top">

                                          <b>
                                            ${esc(
                                              c.name
                                            )}
                                          </b>

                                          ${
                                            c.time
                                              ? `<small>${esc(c.time)}</small>`
                                              : ""
                                          }

                                        </div>


                                        <div class="person-bottom">

                                          <span>
                                            ${
                                              c.typing
                                                ? "typing…"
                                                : esc(
                                                    c.msg ||
                                                    "Tap to chat"
                                                  )
                                            }
                                          </span>


                                          ${
                                            c.unread
                                              ? `
                                                <i>
                                                  ${c.unread}
                                                </i>
                                              `
                                              : ""
                                          }

                                        </div>

                                      </div>

                                    </button>
                                  `
                                )
                                .join("")

                            : `
                              <div class="empty-list">

                                <div class="logo">
                                  N
                                </div>

                                <h3>
                                  No people yet
                                </h3>

                                <p>
                                  Register another
                                  NTalk account to
                                  start chatting.
                                </p>

                              </div>
                            `
                        }

                      </div>

                    </aside>


                    <div
                      class="chat-area ${
                        !active
                          ? "mobile-hidden"
                          : ""
                      }"
                    >
                      ${conversation()}
                    </div>

                  </section>

                `
        }

      </main>

    </div>
  `;
}


/* ===============================
   INITIAL LOAD
================================ */

window.addEventListener(
  "load",
  async () => {

    if (state.theme) {
      document.documentElement
        .setAttribute(
          "data-theme",
          state.theme
        );
    }

    await checkSession();

  }
);
