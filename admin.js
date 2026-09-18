import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { presenters as defaults, criteria } from './presenters.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const TIE_DECIMALS = 3;
const TIE_EPSILON = 0.5 * Math.pow(10, -TIE_DECIMALS);

let role = null;
let lastVotes = [];
let presenters = [];
let votingOpen = false;
let lastWeights = {};

function ownerUI() {
  document.querySelectorAll('.ownerOnly').forEach(x =>
    x.classList.toggle('hidden', role !== 'owner')
  );
  $('roleText').textContent =
    `Signed in as ${auth.currentUser?.email || ''} — ${role || 'unauthorized'}`;
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    role = null;
    $('login').classList.remove('hidden');
    $('dash').classList.add('hidden');
    return;
  }

  try {
    const roleSnap = await getDoc(doc(db, 'moderators', user.uid));
    role = roleSnap.exists() ? roleSnap.data().role : null;

    if (!['owner', 'moderator'].includes(role)) {
      throw Error('This account is not an approved moderator.');
    }

    $('login').classList.add('hidden');
    $('dash').classList.remove('hidden');
    ownerUI();
    await refresh();
  } catch (error) {
    $('loginMsg').textContent = error.message;
    await signOut(auth);
  }
});

$('loginBtn').onclick = async () => {
  try {
    $('loginMsg').textContent = '';
    await signInWithEmailAndPassword(
      auth,
      $('email').value.trim(),
      $('password').value
    );
  } catch (error) {
    $('loginMsg').textContent = error.message;
  }
};

$('logout').onclick = () => signOut(auth);

/*
  AUDIENCE-PATTERN WEIGHTS
  ------------------------
  We derive one event-wide weight per criterion from the spread of ALL raw
  audience ratings. A criterion on which attendees differentiate presenters
  more strongly receives more tie-break influence.

  weight_k = variance_k / sum(all criterion variances)

  If there is no usable variation yet, all four criteria receive equal weight.
  These weights NEVER affect the official score. They are used only inside
  a group whose official scores tie to 3 decimal places.
*/
function deriveAudienceWeights() {
  const variances = {};

  for (const [key] of criteria) {
    const values = lastVotes
      .map(v => Number(v[key]))
      .filter(Number.isFinite);

    if (values.length < 2) {
      variances[key] = 0;
      continue;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    variances[key] =
      values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
      values.length;
  }

  const totalVariance = criteria.reduce(
    (sum, [key]) => sum + variances[key],
    0
  );

  if (totalVariance <= 0) {
    const equal = 1 / criteria.length;
    return Object.fromEntries(criteria.map(([key]) => [key, equal]));
  }

  return Object.fromEntries(
    criteria.map(([key]) => [key, variances[key] / totalVariance])
  );
}

function officialTie(a, b) {
  return Math.abs(a.final - b.final) < TIE_EPSILON;
}

function calcRows() {
  lastWeights = deriveAudienceWeights();

  const rows = presenters.map(presenter => {
    const votes = lastVotes.filter(v => v.presenterId === presenter.id);

    const average = key =>
      votes.length
        ? votes.reduce((sum, vote) => sum + (Number(vote[key]) || 0), 0) /
          votes.length
        : 0;

    const values = Object.fromEntries(
      criteria.map(([key]) => [key, average(key)])
    );

    const final =
      criteria.reduce((sum, [key]) => sum + values[key], 0) /
      criteria.length;

    const tieBreak =
      criteria.reduce(
        (sum, [key]) => sum + values[key] * lastWeights[key],
        0
      );

    return {
      ...presenter,
      ...values,
      final,
      tieBreak,
      votes: votes.length,
      tieApplied: false
    };
  });

  // Primary order is ALWAYS the official equal-weight average.
  rows.sort(
    (a, b) =>
      b.final - a.final ||
      b.votes - a.votes ||
      a.id.localeCompare(b.id)
  );

  // Find score groups that tie at the official 3-decimal precision.
  for (let start = 0; start < rows.length; ) {
    let end = start + 1;

    while (
      end < rows.length &&
      officialTie(rows[start], rows[end])
    ) {
      end++;
    }

    if (end - start > 1) {
      const tied = rows.slice(start, end);

      tied.forEach(row => {
        row.tieApplied = true;
      });

      // ONLY the tied presenters are re-ordered by audience-pattern score.
      tied.sort(
        (a, b) =>
          b.tieBreak - a.tieBreak ||
          b.votes - a.votes ||
          a.id.localeCompare(b.id)
      );

      rows.splice(start, tied.length, ...tied);
    }

    start = end;
  }

  return rows;
}

function renderWeights() {
  const parts = criteria.map(([key, label]) =>
    `${label}: ${(lastWeights[key] * 100).toFixed(1)}%`
  );

  $('tieWeights').innerHTML =
    `<b>Tie-break weights from audience rating patterns:</b> ${parts.join(' · ')}
     <br><span class="muted">Used only when official equal-weight scores tie to ${TIE_DECIMALS} decimal places. Official scores are never replaced.</span>`;
}

async function refresh() {
  const [voteSnap, presenterSnap, eventSnap] = await Promise.all([
    getDocs(collection(db, 'votes')),
    getDocs(collection(db, 'presenters')),
    getDoc(doc(db, 'event', 'settings'))
  ]);

  lastVotes = voteSnap.docs.map(d => d.data());
  presenters = presenterSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  votingOpen =
    eventSnap.exists() &&
    eventSnap.data().votingOpen === true;

  $('toggleVoting').textContent =
    votingOpen ? 'Close voting' : 'Open voting';
  $('toggleVoting').className =
    votingOpen ? 'danger' : '';

  const rows = calcRows();
  renderWeights();

  $('ranking').innerHTML = rows
    .map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${row.id} — ${esc(row.name)}</td>
        <td>${row.room}</td>
        ${criteria.map(([key]) =>
          `<td>${row[key].toFixed(2)}</td>`
        ).join('')}
        <td><b>${row.final.toFixed(3)}</b></td>
        <td>${row.tieApplied ? `<span class="tieflag">Tie-break: ${row.tieBreak.toFixed(4)}</span>` : '—'}</td>
        <td>${row.votes}</td>
        ${role === 'owner'
          ? `<td><button class="small edit" data-id="${row.id}">Edit</button></td>`
          : ''}
      </tr>
    `)
    .join('');

  document.querySelectorAll('.edit').forEach(button => {
    button.onclick = () => editPresenter(button.dataset.id);
  });

  $('winners').innerHTML = [1, 2, 3]
    .map(room => {
      const top = rows
        .filter(row => Number(row.room) === room)
        .slice(0, 3);

      return `
        <div class="winnerbox">
          <h3>Room ${room}</h3>
          ${
            top.map((row, index) => `
              <p>
                <b>${['🥇', '🥈', '🥉'][index]} ${row.id} — ${esc(row.name)}</b><br>
                Official: ${row.final.toFixed(3)}
                ${row.tieApplied
                  ? `<br><span class="tieflag">Tie-break applied: ${row.tieBreak.toFixed(4)}</span>`
                  : ''}
                · ${row.votes} votes
              </p>
            `).join('') || '<p>No presenters yet.</p>'
          }
        </div>
      `;
    })
    .join('');

  const tieCount = rows.filter(r => r.tieApplied).length;
  $('status').textContent =
    `${lastVotes.length} submitted scores · Voting ${votingOpen ? 'OPEN' : 'CLOSED'} · ${tieCount ? `${tieCount} presenter(s) currently in tie-break groups` : 'No active ties'}.`;

  return rows;
}

$('refresh').onclick = refresh;

$('toggleVoting').onclick = async () => {
  if (!['owner', 'moderator'].includes(role)) return;

  await updateDoc(
    doc(db, 'event', 'settings'),
    { votingOpen: !votingOpen }
  );

  await refresh();
};

$('seed').onclick = async () => {
  if (role !== 'owner') return;

  if (!confirm('Create/update the 30 presenter records from presenters.js?')) {
    return;
  }

  for (let i = 0; i < defaults.length; i += 400) {
    const batch = writeBatch(db);

    defaults.slice(i, i + 400).forEach(p =>
      batch.set(
        doc(db, 'presenters', p.id),
        { name: p.name, room: p.room, title: p.title },
        { merge: true }
      )
    );

    await batch.commit();
  }

  await refresh();
  alert('Presenter records synchronized.');
};

async function editPresenter(id) {
  if (role !== 'owner') return;

  const presenter = presenters.find(x => x.id === id);

  const name = prompt(`Name for ${id}:`, presenter.name);
  if (name === null) return;

  const title = prompt(
    `Research title for ${id}:`,
    presenter.title || ''
  );
  if (title === null) return;

  await setDoc(
    doc(db, 'presenters', id),
    {
      name: name.trim() || presenter.name,
      title: title.trim(),
      room: presenter.room
    },
    { merge: true }
  );

  await refresh();
}

$('reset').onclick = async () => {
  if (role !== 'owner') return;

  const typed = prompt(
    'This permanently deletes ALL submitted votes. Type RESET ALL VOTES to continue.'
  );

  if (typed !== 'RESET ALL VOTES') return;

  const snap = await getDocs(collection(db, 'votes'));

  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  await refresh();
  alert('All votes deleted. Presenter and moderator records were kept.');
};

$('export').onclick = async () => {
  const rows = await refresh();
  const wb = XLSX.utils.book_new();

  const weightRow = Object.fromEntries(
    criteria.map(([key, label]) => [label, lastWeights[key]])
  );

  const methodology = [
    {
      Setting: 'Official score',
      Value: 'Equal-weight mean of the four criterion averages'
    },
    {
      Setting: 'Tie definition',
      Value: `Official scores equal to ${TIE_DECIMALS} decimal places`
    },
    {
      Setting: 'Tie-break method',
      Value: 'Criterion weights proportional to variance across all raw audience ratings; applied only within tied groups'
    },
    {
      Setting: 'Clarity weight',
      Value: weightRow['Clarity & accessibility']
    },
    {
      Setting: 'Engagement weight',
      Value: weightRow['Engagement & storytelling']
    },
    {
      Setting: 'Significance weight',
      Value: weightRow['Research significance']
    },
    {
      Setting: 'Delivery weight',
      Value: weightRow['Delivery & time management']
    }
  ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(methodology),
    'Tie-break Method'
  );

  const ranking = rows.map((row, index) => ({
    Rank: index + 1,
    ID: row.id,
    Presenter: row.name,
    Room: row.room,
    Title: row.title,
    Clarity: row.clarity,
    Engagement: row.engagement,
    Significance: row.significance,
    Delivery: row.delivery,
    'Official Score': row.final,
    'Tie-break Applied': row.tieApplied ? 'Yes' : 'No',
    'Tie-break Score': row.tieApplied ? row.tieBreak : '',
    Votes: row.votes
  }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(ranking),
    'Ranking'
  );

  [1, 2, 3].forEach(room => {
    const roomRows = rows
      .filter(row => Number(row.room) === room)
      .map((row, index) => ({
        Rank: index + 1,
        ID: row.id,
        Presenter: row.name,
        Title: row.title,
        'Official Score': row.final,
        'Tie-break Applied': row.tieApplied ? 'Yes' : 'No',
        'Tie-break Score': row.tieApplied ? row.tieBreak : '',
        Votes: row.votes
      }));

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(roomRows),
      `Room ${room}`
    );
  });

  [...presenters]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(presenter => {
      const data = lastVotes
        .filter(v => v.presenterId === presenter.id)
        .map((vote, index) => ({
          Vote: index + 1,
          Clarity: vote.clarity,
          Engagement: vote.engagement,
          Significance: vote.significance,
          Delivery: vote.delivery,
          Average:
            (
              vote.clarity +
              vote.engagement +
              vote.significance +
              vote.delivery
            ) / 4
        }));

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          data.length ? data : [{ Vote: 'No votes' }]
        ),
        presenter.id
      );
    });

  XLSX.writeFile(wb, 'NUSGSS_3MT_Results.xlsx');
};

function esc(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]
  );
}
