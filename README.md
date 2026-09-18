# NUSGSS 3MT Voting System v2

Static HTML + Firebase Authentication + Cloud Firestore, designed for GitHub Pages.

## What changed from v1
- No manual voting codes.
- Audience signs in automatically with Firebase Anonymous Authentication.
- One anonymous Firebase UID can submit one vote per presenter.
- Multiple moderator accounts are supported through the Firestore `moderators/{uid}` role document.
- `owner` can reset votes, sync/edit presenters; `moderator` can view/export results and open/close voting.
- Dashboard shows top 3 in each of 3 rooms (9 winners) plus overall ranking.
- Excel export includes Ranking, Room 1-3, and P01-P30 sheets.

## Firebase prerequisites
1. Authentication: enable Email/Password and Anonymous.
2. Firestore: create `(default)` database in production mode.
3. Create `event/settings` with `eventName = "NUSGSS 3MT 2026"` and `votingOpen = false`.
4. Create `moderators/<YOUR_FIREBASE_UID>` with fields `name`, `email`, and `role = "owner"`.
5. Paste `firestore.rules` into Firestore > Rules and Publish.

## First login
1. Open `admin.html` through your deployed GitHub Pages site.
2. Sign in with the Email/Password account whose UID has `role = owner`.
3. Click **Initialize / sync presenters** once. This creates P01-P30 in Firestore.
4. Use Edit beside a presenter to change the name/title. Rooms default to P01-P10 Room 1, P11-P20 Room 2, P21-P30 Room 3.
5. Keep voting CLOSED while testing/setup. Open it from the dashboard when the event begins.

## Additional moderators
Create each moderator under Firebase Authentication > Users with Email/Password. Copy their UID, then as owner create `moderators/<THEIR_UID>` in Firestore with `name`, `email`, `role = "moderator"`. Do not share passwords.

## GitHub Pages
Upload these files to the repository root:
- `index.html`
- `admin.html`
- `style.css`
- `app.js`
- `admin.js`
- `presenters.js`
- `firebase-config.js`
- `README.md`

You may also commit `firestore.rules` for version control. It contains no password/private service-account key.

Then GitHub > repository Settings > Pages > Deploy from branch > `main` / root.

In Firebase Authentication > Settings > Authorized domains, add your GitHub Pages hostname, e.g. `yourusername.github.io`.

## Room QR links
Use these as the QR destinations after deployment:
- Room 1: `https://YOURUSERNAME.github.io/YOURREPO/?room=1`
- Room 2: `https://YOURUSERNAME.github.io/YOURREPO/?room=2`
- Room 3: `https://YOURUSERNAME.github.io/YOURREPO/?room=3`

## Important limitation
Anonymous authentication identifies a browser installation, not a physical human. A determined person can use another browser/device or clear site data and receive another anonymous UID. IP blocking is not recommended because many attendees may share the same campus/network public IP. For stronger identity-bound voting, require attendee sign-in or unique credentials.
