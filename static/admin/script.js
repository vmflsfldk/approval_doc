const loginSection = document.querySelector('#loginSection');
const managementSection = document.querySelector('#managementSection');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const logoutButton = document.querySelector('#logoutButton');
const createUserForm = document.querySelector('#createUserForm');
const createUserMessage = document.querySelector('#createUserMessage');
const updatePasswordForm = document.querySelector('#updatePasswordForm');
const updatePasswordMessage = document.querySelector('#updatePasswordMessage');
const refreshUsersButton = document.querySelector('#refreshUsers');
const userTableBody = document.querySelector('#userTable tbody');
const userListMessage = document.querySelector('#userListMessage');
const userRowTemplate = document.querySelector('#userRowTemplate');

function toggleAuth(isAuthenticated) {
  if (isAuthenticated) {
    loginSection.classList.add('hidden');
    managementSection.classList.remove('hidden');
    logoutButton.classList.remove('hidden');
    refreshUsers();
  } else {
    loginSection.classList.remove('hidden');
    managementSection.classList.add('hidden');
    logoutButton.classList.add('hidden');
    loginForm.reset();
    createUserForm.reset();
    updatePasswordForm.reset();
    userTableBody.innerHTML = '';
  }

  clearMessages();
}

function clearMessages() {
  loginError.textContent = '';
  createUserMessage.textContent = '';
  updatePasswordMessage.textContent = '';
  userListMessage.textContent = '';
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
    ...options,
  });

  if (!response.ok) {
    let error = '요청을 처리하지 못했습니다.';

    try {
      const data = await response.json();
      if (data && data.error) {
        error = data.error;
      }
    } catch (err) {
      // ignore json parsing error
    }

    throw new Error(error);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    await request('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    toggleAuth(true);
  } catch (error) {
    loginError.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await request('/api/logout', { method: 'POST' });
    toggleAuth(false);
  } catch (error) {
    userListMessage.textContent = error.message;
  }
});

createUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createUserMessage.textContent = '';

  const formData = new FormData(createUserForm);
  const payload = Object.fromEntries(formData.entries());
  payload.username = (payload.username || '').trim();
  payload.name = (payload.name || '').trim();
  payload.role = payload.role === 'admin' ? 'admin' : 'user';

  try {
    await request('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    createUserForm.reset();
    createUserMessage.textContent = '사용자를 생성했습니다.';
    refreshUsers();
  } catch (error) {
    createUserMessage.textContent = error.message;
  }
});

updatePasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  updatePasswordMessage.textContent = '';

  const formData = new FormData(updatePasswordForm);
  const payload = { password: formData.get('password') };
  const username = (formData.get('username') || '').trim();

  try {
    await request(`/api/users/${encodeURIComponent(username)}/password`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    updatePasswordForm.reset();
    updatePasswordMessage.textContent = '비밀번호를 변경했습니다.';
  } catch (error) {
    updatePasswordMessage.textContent = error.message;
  }
});

refreshUsersButton.addEventListener('click', () => {
  refreshUsers();
});

async function refreshUsers() {
  userListMessage.textContent = '';
  userTableBody.innerHTML = '';

  try {
    const data = await request('/api/users');
    const users = data.users || [];

    if (users.length === 0) {
      userListMessage.textContent = '등록된 사용자가 없습니다.';
      return;
    }

    const fragment = document.createDocumentFragment();
    users.forEach((user) => {
      const row = userRowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector('.username').textContent = user.username;
      row.querySelector('.display-name').textContent = user.name || '-';
      row.querySelector('.role').textContent = user.role === 'admin' ? '관리자' : '일반 사용자';
      fragment.appendChild(row);
    });

    userTableBody.appendChild(fragment);
  } catch (error) {
    userListMessage.textContent = error.message;
  }
}

async function checkSession() {
  try {
    const session = await request('/api/session');
    toggleAuth(Boolean(session.authenticated));
  } catch (error) {
    toggleAuth(false);
  }
}

checkSession();
