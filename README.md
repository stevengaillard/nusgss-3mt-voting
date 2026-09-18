# NUSGSS 3MT Voting System

Static HTML + Firebase Authentication + Cloud Firestore. It can be hosted on GitHub Pages; no Firebase Hosting is required.

## Why Firebase instead of Excel as the live database?
Firestore safely handles many phones at once. Excel is generated only as the results/export format. Duplicate votes are prevented by a unique Firestore document ID: `VOTINGCODE_PRESENTERID`.

## 1. Create Firebase project
1. Go to Firebase Console and create a project (e.g. `nusgss-3mt-2026`).
2. Build > Firestore Database > Create database. Choose a nearby region and start in production mode.
3. Build > Authentication > Sign-in method > enable Email/Password.
4. Authentication > Users > Add user. Create ONE moderator account using your email and a strong password.
5. Project settings > Your apps > Web > Register app. Copy the Firebase config values.

## 2. Configure this project
1. Open `firebase-config.js`; paste the web app config and set `MODERATOR_EMAIL`.
2. Open `firestore.rules`; replace `YOUR_MODERATOR_EMAIL@u.nus.edu` with the exact same moderator email.
3. Firebase Console > Firestore Database > Rules: paste `firestore.rules`, then Publish.
4. Edit `presenters.js` with the 30 real names/titles. P01-P10 = Room 1, P11-P20 = Room 2, P21-P30 = Room 3 by default.

## 3. Upload to GitHub
Create a new repository and upload ONLY:
- `index.html`
- `admin.html`
- `style.css`
- `app.js`
- `admin.js`
- `presenters.js`
- `firebase-config.js`
- `README.md`

Do NOT upload Excel exports containing results/voting codes. `firestore.rules` may be uploaded; it contains no password, but it does contain the moderator email.

Then GitHub repository > Settings > Pages > Deploy from a branch > `main` / root. Wait for the Pages URL.

## 4. Firebase authorized domain
Firebase Console > Authentication > Settings > Authorized domains. Add your GitHub Pages host, e.g. `yourname.github.io`.

## 5. Before the event
1. Open `/admin.html` on the deployed site and sign in.
2. Click `Create 150 voting codes` ONCE. Copy the codes immediately and distribute one per attendee (printed slips/registration QR mapping). Codes themselves contain no personal information.
3. Test: use one code to score P01. A second P01 submission with the same code must fail; P02 with the same code must work.
4. In Moderator, verify the ranking changes and test Export Excel.
5. Use RESET ALL VOTES after testing. This deletes votes but keeps voting codes.

## Voting logic
Each code can score EACH presenter once. A voter can therefore score all presenters in their room, but cannot score the same presenter twice. Scores are 1-5 for Clarity, Engagement, Research Significance, and Delivery. Final score is the simple average of the four criterion averages.

## Security notes
- The moderator password is NEVER placed in GitHub. Firebase Authentication stores it.
- Firestore rules permit only the configured moderator email to read rankings, create voting codes, or delete votes.
- Audience clients can create a vote only if the token exists and score values are 1-5.
- This is stronger than browser/device fingerprinting and avoids collecting attendee identity.
- A person who deliberately shares their code can still let another person use it. If you need identity-bound voting, use authenticated attendee accounts instead.

## Excel
The moderator page's `Export Excel` creates `NUSGSS_3MT_Results.xlsx` with a Ranking sheet plus P01-P30 sheets. A blank planning/template workbook is also supplied separately with this package.
