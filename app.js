
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxhDRN-nCvHIioIpFjHQayymGRZ5Hx5wXfSUTYm-b-63adqkkMvFoWQ5WgwBbuOlK11hg/exec';

// Shorter User ID
function generateShortID() {
  return Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 8);
}
let userId = localStorage.getItem('uniqueUserID');
if (!userId) {
  userId = generateShortID();
  localStorage.setItem('uniqueUserID', userId);
}

let selectedTrack = null;

// Tab switching — now clears message when leaving request tab
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  
  // Clear success message when switching tabs
  const msg = document.getElementById('message');
  msg.innerHTML = '';
  msg.className = '';

  for (const name of ['vote', 'request']) {
    const button = document.getElementById(name + 'Tab');
    button.classList.toggle('tab-active', name === tab);
    if (name === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (tab === 'vote') loadVotes();
}

// ====== REQUEST LOGIC ======
const input = document.getElementById('searchInput');
const list = document.querySelector('.dropdown-list');
const btn = document.getElementById('submitBtn');
const spinner = btn.querySelector('.spinner');
const msg = document.getElementById('message');
let timer;

// Enhanced banned words list
const bannedWords = [
  'fuck','fucking','fucked','fck','fuk','shit','sh1t','bitch','bitches',
  'asshole','@$$','pussy','dick','cock','motherfucker','mf','cunt','nigga','nigger',
  'wtf','damn','hell','bastard'
];
const bannedRegex = new RegExp('\\b(' + bannedWords.join('|') + ')\\b', 'i');

function isClean(t) {
  if (t.explicit) return false;
  const text = t.name + ' ' + t.artists.map(a => a.name).join(' ');
  return !bannedRegex.test(text);
}

const searchStatus = document.getElementById('searchStatus');
let searchVersion = 0;
let submitting = false;

async function search(q, version) {
  if (!q.trim()) return;
  searchStatus.textContent = 'Searching…';
  try {
    const r = await fetch(`${WEB_APP_URL}?q=${encodeURIComponent(q)}&limit=4`);
    if (!r.ok) throw new Error('Search failed');
    const j = await r.json();
    if (version !== searchVersion) return;
    if (j.status !== 'success') throw new Error('Search failed');
    list.replaceChildren();
    j.data.filter(isClean).forEach(t => {
      const li = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'track-option';
      const title = document.createElement('span');
      title.className = 'track-title';
      title.textContent = t.name;
      const artist = document.createElement('span');
      artist.className = 'track-artist';
      const artistText = t.artists.map(a => a.name).join(', ');
      artist.textContent = artistText;
      option.append(title, artist);
      option.onclick = () => {
        selectedTrack = t;
        input.value = `${t.name} — ${artistText}`;
        list.classList.remove('show');
        searchStatus.textContent = 'Ready when you are. Send your request below.';
        btn.disabled = false;
        btn.focus();
      };
      li.append(option);
      list.append(li);
    });
    list.classList.toggle('show', list.children.length > 0);
    searchStatus.textContent = list.children.length ? 'Select the song you want to hear.' : 'No clean tracks found. Try another song or artist.';
  } catch {
    if (version !== searchVersion) return;
    list.classList.remove('show');
    searchStatus.textContent = 'Search is unavailable. Please try again.';
  }
}

input.addEventListener('input', () => {
  selectedTrack = null;
  btn.disabled = true;
  list.classList.remove('show');
  msg.textContent = '';
  clearTimeout(timer);
  const version = ++searchVersion;
  searchStatus.textContent = input.value.trim() ? 'Waiting to search…' : 'Find a track, then select it below.';
  timer = setTimeout(() => search(input.value, version), 300);
});

async function sendRequest(track) {
  // Apps Script uses an opaque response: delivery cannot be confirmed here.
  await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ title: track.title, artist: track.artist, userId }) });
}

btn.onclick = async () => {
  if (!selectedTrack || submitting) return;
  submitting = true;
  btn.disabled = true;
  input.disabled = true;
  spinner.hidden = false;
  msg.textContent = '';
  try {
    await sendRequest({ title: selectedTrack.name, artist: selectedTrack.artists.map(a => a.name).join(', ') });
    msg.textContent = 'Request sent. Check the voting list shortly to see it appear.';
    msg.className = 'success';
    input.value = '';
    selectedTrack = null;
    searchStatus.textContent = 'Have another favorite? Search again.';
  } catch {
    msg.textContent = 'Could not send your request. Please try again.';
    msg.className = 'error';
  } finally {
    submitting = false;
    spinner.hidden = true;
    input.disabled = false;
    btn.disabled = !selectedTrack;
  }
};

// ====== VOTE LOGIC (unchanged) ======
let votesLoading = false;
async function loadVotes() {
  if (votesLoading) return;
  votesLoading = true;
  document.getElementById('refreshBtn').disabled = true;
  const container = document.getElementById('voteList');
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<div class="empty"><span class="loading loading-spinner loading-sm" aria-hidden="true"></span> Loading the rotation…</div>';
  try {
    const resp = await fetch(`${WEB_APP_URL}?action=getVotes`);
    if (!resp.ok) throw new Error('Could not load songs');
    const csv = await resp.text();
    if (!csv || csv.startsWith('Error:')) throw '';
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length <= 1) { container.innerHTML = '<div class="empty">The rotation starts with you. Request the first song!</div>'; return; }

    const allSongs = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 4) continue;
      allSongs.push({
        timestamp: Date.parse(cols[0]),
        title: cols[1],
        artist: cols[2],
        userId: cols[3]
      });
    }

    const uniqueSongs = new Map();
    let hasBanned = new Set();
    allSongs.forEach(song => {
      const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
      if (song.userId === 'BANNED') hasBanned.add(key);

      if (!uniqueSongs.has(key)) {
        uniqueSongs.set(key, {
          title: song.title,
          artist: song.artist,
          latestTimestamp: song.timestamp,
          isRequestedByUser: song.userId === userId,
          isAdmin: song.userId === 'admin'
        });
      } else {
        const existing = uniqueSongs.get(key);
        existing.latestTimestamp = Math.max(existing.latestTimestamp, song.timestamp);
        if (song.userId === userId) existing.isRequestedByUser = true;
        if (song.userId === 'admin') existing.isAdmin = true;
      }
    });

    hasBanned.forEach(key => uniqueSongs.delete(key));

    let notRequested = Array.from(uniqueSongs.values()).filter(s => !s.isRequestedByUser);
    let requested = Array.from(uniqueSongs.values()).filter(s => s.isRequestedByUser);

    let adminSongs = notRequested.filter(s => s.isAdmin);
    if (adminSongs.length < 2) {
      const extra = requested.filter(s => s.isAdmin && !notRequested.some(x => x.title === s.title && x.artist === s.artist)).slice(0, 2 - adminSongs.length);
      notRequested.push(...extra);
    }

    notRequested.sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    let display = notRequested.slice(0, 5);
    const remaining = notRequested.slice(5);
    remaining.sort(() => Math.random() - 0.5);
    display = display.concat(remaining.slice(0, 20 - display.length));

    if (display.length < 20) {
      requested.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
      display = display.concat(requested.slice(0, 20 - display.length));
    }

    if (display.length === 0) {
      container.innerHTML = '<div class="empty">No songs to vote on!</div>';
      return;
    }

    container.innerHTML = '';
    const displayed = new Set();
    display.filter(song => {
      const key = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
      if (displayed.has(key)) return false;
      displayed.add(key);
      return true;
    }).forEach((song, index) => {
      const card = document.createElement('div');
      card.className = 'song-item';
      const number = document.createElement('span');
      number.className = 'song-number';
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div');
      info.className = 'song-info';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = song.title;
      const artist = document.createElement('div');
      artist.className = 'artist';
      artist.textContent = song.artist;
      const status = document.createElement('div');
      status.className = 'voted-label';
      status.setAttribute('role', 'status');
      status.textContent = song.isRequestedByUser ? 'You requested this' : '';
      info.append(title, artist, status);
      const vote = document.createElement('button');
      vote.type = 'button';
      vote.className = 'btn vote-btn';
      vote.disabled = song.isRequestedByUser;
      vote.textContent = song.isRequestedByUser ? '✓' : '↑';
      vote.setAttribute('aria-label', song.isRequestedByUser ? `Already requested ${song.title}` : `Vote for ${song.title} by ${song.artist}`);
      vote.onclick = async () => {
        vote.disabled = true;
        vote.textContent = '…';
        status.textContent = 'Sending vote…';
        try {
          await sendRequest(song);
          vote.textContent = '✓';
          vote.setAttribute('aria-label', `Vote sent for ${song.title}`);
          status.textContent = 'Vote sent';
        } catch {
          vote.disabled = false;
          vote.textContent = '↑';
          status.textContent = 'Could not send. Tap to retry.';
        }
      };
      card.append(number, info, vote);
      container.append(card);
    });

  } catch (e) {
    console.error('Could not load songs', e);
    container.innerHTML = '<div class="empty">Could not load songs. Tap refresh to try again.</div>';
  } finally {
    votesLoading = false;
    container.setAttribute('aria-busy', 'false');
    document.getElementById('refreshBtn').disabled = false;
  }
}

loadVotes();
