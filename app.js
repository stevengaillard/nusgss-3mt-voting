import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';
import { criteria } from './presenters.js';


// ============================================================
// FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);


// ============================================================
// STATE
// ============================================================

let user = null;
let presenters = [];
let votingOpen = false;

const scores = {};


// ============================================================
// BUILD SCORING INTERFACE
// ============================================================

criteria.forEach(([key, label]) => {

  scores[key] = 0;

  const container = document.createElement('div');

  container.className = 'criterion';

  container.innerHTML = `
    <label>${label}</label>

    <div class="stars" data-k="${key}">
      ${[1, 2, 3, 4, 5]
        .map(number => `
          <button
            type="button"
            data-n="${number}">
            ${number}
          </button>
        `)
        .join('')}
    </div>
  `;

  $('criteria').appendChild(container);
});


// ============================================================
// SCORE BUTTONS
// Only the selected number becomes orange.
// ============================================================

document.querySelectorAll('.stars button').forEach(button => {

  button.onclick = () => {

    const group = button.parentElement;

    const key = group.dataset.k;
    const number = Number(button.dataset.n);

    scores[key] = number;

    [...group.children].forEach(item => {

      item.classList.toggle(
        'on',
        Number(item.dataset.n) === number
      );

    });

  };

});


// ============================================================
// LOAD PRESENTERS FOR SELECTED ROOM
// ============================================================

function loadRoom() {

  const room = Number($('room').value);

  const roomPresenters = presenters
    .filter(presenter => Number(presenter.room) === room)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (roomPresenters.length > 0) {

    $('presenter').innerHTML = roomPresenters
      .map(presenter => `
        <option value="${presenter.id}">
          ${presenter.id} — ${presenter.name}
        </option>
      `)
      .join('');

  } else {

    $('presenter').innerHTML =
      '<option value="">No presenters loaded</option>';

  }

  showTitle();
}


// ============================================================
// SHOW RESEARCH TITLE
// ============================================================

function showTitle() {

  const presenter = presenters.find(
    p => p.id === $('presenter').value
  );

  $('title').textContent = presenter?.title || '';
}


$('room').onchange = loadRoom;
$('presenter').onchange = showTitle;


// ============================================================
// INITIALIZE AUDIENCE SESSION
// ============================================================

async function init() {

  try {

    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    user = auth.currentUser;

    const [presenterSnapshot, eventSnapshot] =
      await Promise.all([

        getDocs(
          collection(db, 'presenters')
        ),

        getDoc(
          doc(db, 'event', 'settings')
        )

      ]);


    presenters = presenterSnapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));


    votingOpen =
      eventSnapshot.exists() &&
      eventSnapshot.data().votingOpen === true;


    // --------------------------------------------------------
    // EVENT STATUS
    // --------------------------------------------------------

    $('eventState').textContent =
      votingOpen
        ? 'Voting is OPEN'
        : 'Voting is CLOSED';


    $('eventState').className =
      'statuspill ' +
      (votingOpen ? 'open' : 'closed');


    // --------------------------------------------------------
    // ENABLE/DISABLE SUBMIT BUTTON
    // --------------------------------------------------------

    $('submit').disabled =
      !votingOpen ||
      presenters.length === 0;


    // --------------------------------------------------------
    // ROOM-SPECIFIC QR SUPPORT
    //
    // Example:
    // index.html?room=1
    // index.html?room=2
    // index.html?room=3
    // --------------------------------------------------------

    const requestedRoom =
      new URLSearchParams(
        window.location.search
      ).get('room');


    if (['1', '2', '3'].includes(requestedRoom)) {

      $('room').value = requestedRoom;

      // Prevent audience from changing room
      $('room').disabled = true;

    }


    loadRoom();

  }

  catch (error) {

    console.error(error);

    $('msg').textContent =
      'Could not connect: ' +
      error.message;

  }

}


// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(auth, firebaseUser => {

  if (firebaseUser && !user) {
    init();
  }

});


if (!auth.currentUser) {

  signInAnonymously(auth)
    .catch(error => {

      console.error(error);

      $('msg').textContent =
        'Could not start voting session: ' +
        error.message;

    });

} else {

  init();

}


// ============================================================
// SUBMIT VOTE
// ============================================================

$('submit').onclick = async () => {

  const presenterId =
    $('presenter').value;


  $('msg').textContent = '';


  // ----------------------------------------------------------
  // CHECK EVENT STATUS
  // ----------------------------------------------------------

  if (!votingOpen) {

    $('msg').textContent =
      'Voting is currently closed.';

    return;

  }


  // ----------------------------------------------------------
  // CHECK PRESENTER
  // ----------------------------------------------------------

  if (!presenterId) {

    $('msg').textContent =
      'Please select a presenter.';

    return;

  }


  // ----------------------------------------------------------
  // CHECK ALL CRITERIA
  // ----------------------------------------------------------

  const missingScore =
    criteria.some(
      ([key]) => !scores[key]
    );


  if (missingScore) {

    $('msg').textContent =
      'Please score every criterion.';

    return;

  }


  // ----------------------------------------------------------
  // CHECK ANONYMOUS FIREBASE USER
  // ----------------------------------------------------------

  if (!user) {

    $('msg').textContent =
      'Voting session is not ready. Please refresh the page.';

    return;

  }


  try {

    // --------------------------------------------------------
    // UNIQUE VOTE DOCUMENT
    //
    // Example:
    //
    // ABC123_P02
    //
    // Same Firebase anonymous UID therefore cannot CREATE
    // another vote for P02.
    // --------------------------------------------------------

    const voteId =
      `${user.uid}_${presenterId}`;


    const voteReference =
      doc(
        db,
        'votes',
        voteId
      );


    // IMPORTANT:
    //
    // We intentionally DO NOT read this document first.
    //
    // Audience accounts are not allowed to read votes.
    // Firestore security rules prevent overwriting an
    // existing vote instead.
    // --------------------------------------------------------

    await setDoc(
      voteReference,
      {

        voterUid: user.uid,

        presenterId: presenterId,

        clarity: scores.clarity,

        engagement: scores.engagement,

        significance: scores.significance,

        delivery: scores.delivery,

        createdAt: serverTimestamp()

      }
    );


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    $('msg').textContent =
      '✓ Vote recorded. Thank you!';


    // Reset scores

    criteria.forEach(([key]) => {
      scores[key] = 0;
    });


    document
      .querySelectorAll('.stars button')
      .forEach(button => {
        button.classList.remove('on');
      });

  }

  catch (error) {

    console.error(
      'Vote submission failed:',
      error
    );


    // --------------------------------------------------------
    // FIRESTORE REJECTS DUPLICATE VOTES AS AN UPDATE
    // --------------------------------------------------------

    if (error.code === 'permission-denied') {

      $('msg').textContent =
        'Vote could not be submitted. This may be because this presenter has already been scored on this device.';
    
    }

    else {

      $('msg').textContent =
        'Could not submit vote: ' +
        error.message;

    }

  }

};
