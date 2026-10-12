// Set to true to show the playlist popup on each page load.
const SHOW_PLAYLIST_POPUP = false;

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbygRnmHU_nZ51GjrHbv283VDPZZnTCbT3CXS1OYymGwSjNh4yO4XX7GowM6MZhgdpsvpQ/exec';

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
let manualMode = false;
const differentRequestBtn = document.getElementById('differentRequestBtn');
const differentRequestPrompt = document.getElementById('differentRequestPrompt');
const manualFields = document.getElementById('manualFields');
const manualTitle = document.getElementById('manualTitle');
const manualArtist = document.getElementById('manualArtist');
const backToSearchBtn = document.getElementById('backToSearchBtn');

function updateSubmitButton() {
  btn.disabled = submitting || (manualMode
    ? !manualTitle.value.trim() || !manualArtist.value.trim()
    : !selectedTrack);
}

function setManualMode(enabled) {
  if (submitting) return;
  manualMode = enabled;
  clearTimeout(timer);
  ++searchVersion;
  document.getElementById('searchFields').hidden = enabled;
  manualFields.hidden = !enabled;
  manualFields.disabled = !enabled;
  msg.textContent = '';
  updateSubmitButton();
  (enabled ? manualTitle : input).focus();
}
differentRequestBtn.onclick = () => setManualMode(true);
backToSearchBtn.onclick = () => setManualMode(false);
for (const field of [manualTitle, manualArtist]) {
  field.addEventListener('input', () => {
    msg.textContent = '';
    updateSubmitButton();
  });
}

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
    j.data.filter(isClean).slice(0, 4).forEach(t => {
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
    differentRequestPrompt.hidden = false;
    list.classList.toggle('show', list.children.length > 0);
    searchStatus.textContent = list.children.length ? 'Select the song you want to hear.' : 'No clean tracks found. Try another song or artist.';
  } catch {
    if (version !== searchVersion) return;
    list.classList.remove('show');
    differentRequestPrompt.hidden = false;
    searchStatus.textContent = 'Search is unavailable. Try again or add a different request below.';
  }
}

input.addEventListener('input', () => {
  selectedTrack = null;
  btn.disabled = true;
  list.classList.remove('show');
  msg.textContent = '';
  clearTimeout(timer);
  differentRequestPrompt.hidden = true;
  const version = ++searchVersion;
  searchStatus.textContent = input.value.trim() ? 'Waiting to search…' : 'Find a track, then select it below.';
  timer = setTimeout(() => search(input.value, version), 300);
});

async function sendRequest(track, requestType) {
  // Apps Script uses an opaque response: delivery cannot be confirmed here.
  await fetch(WEB_APP_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ title: track.title, artist: track.artist, userId, requestType }) });
}

document.getElementById('requestForm').onsubmit = async event => {
  event.preventDefault();
  if (submitting) return;
  const track = manualMode
    ? { name: manualTitle.value.trim(), artists: [{ name: manualArtist.value.trim() }] }
    : selectedTrack;
  if (!track || !track.name || !track.artists[0].name) return;
  if (manualMode && !isClean(track)) {
    msg.textContent = 'Please keep song titles and artist names clean.';
    msg.className = 'error';
    return;
  }
  submitting = true;
  btn.disabled = true;
  input.disabled = true;
  manualFields.disabled = true;
  differentRequestBtn.disabled = true;
  spinner.hidden = false;
  msg.textContent = '';
  try {
    await sendRequest({ title: track.name, artist: track.artists.map(a => a.name).join(', ') }, manualMode ? 'manual' : 'search');
    msg.textContent = 'Request sent. Check the voting list shortly to see it appear.';
    msg.className = 'success';
    input.value = '';
    selectedTrack = null;
    manualTitle.value = '';
    manualArtist.value = '';
    differentRequestPrompt.hidden = true;
    list.classList.remove('show');
    searchStatus.textContent = 'Have another favorite? Search again.';
  } catch {
    msg.textContent = 'Could not send your request. Please try again.';
    msg.className = 'error';
  } finally {
    submitting = false;
    spinner.hidden = true;
    input.disabled = false;
    manualFields.disabled = !manualMode;
    differentRequestBtn.disabled = false;
    updateSubmitButton();
  }
};

// Choose up to 20 songs. Quotas overlap; unvoted songs take priority.
function selectVoteSongs(songs, random = Math.random) {
  const shuffle = items => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const newest = (a, b) => b.latestTimestamp - a.latestTimestamp;
  const isPopular = song => song.requestCount >= 2 && song.requestCount <= 7;
  const unvoted = songs.filter(song => !song.isRequestedByUser);
  const voted = songs.filter(song => song.isRequestedByUser);
  const preferred = unvoted.filter(song => song.requestCount < 8);
  const highVote = unvoted.filter(song => song.requestCount >= 8);
  const selected = new Set();
  const add = items => items.forEach(song => { if (selected.size < 20) selected.add(song); });

  // High-vote songs cannot take recent/admin slots while lower-vote options remain.
  const recent = [...preferred].sort(newest).slice(0, 5);
  add(recent);
  add(shuffle(preferred.filter(song => song.isAdmin)).slice(0, 5));

  // Vary the popular target between 5 and 10, allowing quotas to overlap.
  const popularTarget = 5 + Math.floor(random() * 6);
  const popularCount = [...selected].filter(isPopular).length;
  add(shuffle(preferred.filter(song => isPopular(song) && !selected.has(song)))
    .slice(0, Math.max(0, popularTarget - popularCount)));
  // Give new random songs priority over songs this visitor has already voted for.
  add(shuffle(preferred.filter(song => !isPopular(song))));
  add(shuffle(preferred));
  // Only use 8+ votes after exhausting lower-vote unvoted songs.
  add(shuffle(highVote));
  add(shuffle(voted.filter(song => song.requestCount < 8)));
  add(shuffle(voted.filter(song => song.requestCount >= 8)));

  // Spread recent songs throughout the top ten instead of pinning them at the top.
  const recentSet = new Set(recent);
  const others = shuffle([...selected].filter(song => !recentSet.has(song)));
  const topTen = shuffle([...recent, ...others.splice(0, Math.max(0, 10 - recent.length))]);
  return [...topTen, ...others];
}

// ====== VOTE LOGIC ======
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
          latestTimestamp: Number.isFinite(song.timestamp) ? song.timestamp : 0,
          requesters: new Set(song.userId && !['admin', 'BANNED'].includes(song.userId) ? [song.userId] : []),
          isRequestedByUser: song.userId === userId,
          isAdmin: song.userId === 'admin'
        });
      } else {
        const existing = uniqueSongs.get(key);
        existing.latestTimestamp = Math.max(existing.latestTimestamp, Number.isFinite(song.timestamp) ? song.timestamp : 0);
        if (song.userId && !['admin', 'BANNED'].includes(song.userId)) existing.requesters.add(song.userId);
        if (song.userId === userId) existing.isRequestedByUser = true;
        if (song.userId === 'admin') existing.isAdmin = true;
      }
    });

    hasBanned.forEach(key => uniqueSongs.delete(key));

    const songs = Array.from(uniqueSongs.values()).map(song => ({
      ...song, requestCount: song.requesters.size
    }));
    const display = selectVoteSongs(songs);

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
          await sendRequest(song, 'vote');
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

// Show on every page load; dismissal only applies until the next reload.
if (SHOW_PLAYLIST_POPUP) {
  const playlistBanner = document.getElementById('playlistBanner');
  playlistBanner.hidden = false;
  document.body.classList.add('playlist-visible');
  const updatePlaylistSpace = () => {
    document.body.style.setProperty('--playlist-space', `${playlistBanner.offsetHeight + 40}px`);
  };
  updatePlaylistSpace();
  const playlistObserver = new ResizeObserver(updatePlaylistSpace);
  playlistObserver.observe(playlistBanner);
  const dismissPlaylist = () => {
    const hadFocus = playlistBanner.contains(document.activeElement);
    playlistBanner.hidden = true;
    document.body.classList.remove('playlist-visible');
    playlistObserver.disconnect();
    if (hadFocus) document.querySelector('.navigation .tab-active').focus({ preventScroll: true });
  };
  document.getElementById('dismissPlaylist').onclick = dismissPlaylist;
  document.getElementById('declinePlaylist').onclick = dismissPlaylist;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !playlistBanner.hidden) dismissPlaylist();
  });
}
