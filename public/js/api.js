// api.js - thin wrapper around fetch that attaches the JWT and handles errors
const api = {
  async request(method, url, body) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showLogin();
      throw new Error('Session expired, please log in again');
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  },
  get(url) {
    return this.request('GET', url);
  },
  post(url, body) {
    return this.request('POST', url, body);
  },
  put(url, body) {
    return this.request('PUT', url, body);
  },
  delete(url) {
    return this.request('DELETE', url);
  },
};

function toast(message, type = 'success') {
  let el = document.getElementById('toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'toast';
  el.className = type;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
