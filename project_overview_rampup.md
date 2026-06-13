# Slate — Project Ramp-Up for the Next Developer / AI

> **You are picking up an in-progress product post-MVP.** Slate now ships on two platforms: an Android app (sections 1–31, canonical reference) and a Desktop web/Tauri app (sections 32–34, currently lagging behind mobile). Read top-to-bottom before touching code. After reading, you should be able to continue collaborating with Elad without him re-explaining anything.
>
> **Last updated:** 2026-06-12 (desktop Tier 1 + Tier 2 gap-closure + Linear-minimal design overhaul)
> **Mobile version:** 1.0.0 (versionCode 2) — see `app/build.gradle.kts` in the Android repo
> **Desktop version:** 0.1.0 (pre-Tauri / Firebase Hosting) — see `package.json` in `D:\slate-webapp`
> **Mobile state:** All 6 phases shipped + multiple post-MVP iterations (bottom-nav refactor, global archive, default-board seeding, per-board/column colors, urgent dashboard, note archive, "added at" date, system-bar inset fix, archive real-time + description-preserve fix, **email-based sharing with pendingInvites**, **per-card assignment with creator/assignee gating**, **board pinch+button zoom**, **inline subtasks with done/total badge**, **archive restore gated by creator/assignee with toast on failure**, **UI/Design refresh — see §17**, **Dark mode — see §18**, **AI Smart Assistant on `feature/ai-assistant` — see §19**, **linked notes on tasks — see §20**, **firestore.rules `isEditor` simplification — see §21**, **"לוח תעדוף" → "לוח משימות" rename — see §22**).
> **Desktop state:** Tier 1 closed (first-launch board seeding + `users/{uid}` profile upsert). Tier 2 mostly closed — dark mode, URL routing with `?card=` deep-link, assignee avatars on Kanban cards, share-dialog email-history autocomplete, persistent marked-urgent set with collapsible "משימות דחופות" section. Cross-device sync of marked-urgent moved from `localStorage` → `users/{uid}.markedUrgentCardIds` in Firestore (Android needs a parallel migration). **Linear-minimal design overhaul shipped — see §35.** Remaining gaps: notifications system, card reminder bell, assistant polish (persistent history / prompt editor / usage display / retired-model guard / dynamic greeting), checklist done-items partitioning, Tauri native integrations.

---

## 0. TL;DR

- **Product:** Slate — a personal Hebrew-RTL Android app for tasks (Kanban boards) + notes (3 types). Sharing with one's partner via deep-link invite. Light mode only. Fully offline-capable via Firestore persistence.
- **Onboarding:** On first sign-in, **4 default boards × 4 default columns are auto-created**. Users can rename or delete any of them. Manually-created boards also pre-fill those 4 columns.
- **State:** Functional MVP plus several user-driven iterations. Compiles, installs, signs in, all features wired end-to-end.
- **What's next:** Bug fixes from real-world use; v1.1 backlog (see §12).

---

## 1. About Elad

- **Email:** `info@alternabe.co.il`
- **Hebrew speaker.** App is Hebrew RTL only.
- **Working alone, on the side.** Speed and clarity > over-engineering.
- **Honest scoping > false completeness.** When something's risky in one shot, prefer to defer.
- **Pushes back well.** He'll ask "is this the right architecture?" or "what's left?" — give a real answer.
- **Iterates UI direction mid-build.** Has redirected from drawer→bottom-nav, per-board archive→global, single accent→per-board colors. Expect more.

### How he likes to work
- Direct, terse responses. Long preamble annoys him.
- Show files I'm changing + the why + trade-offs.
- For Firebase/console changes, give exact text/clicks.
- He pastes log/error output verbatim. Diagnose from that.

---

## 2. Product in one paragraph

Slate is a calm, minimalist Hebrew life hub on Android. The user creates boards (Kanban with columns + task cards) and notes (checklist / bullets / free-text). On first sign-in, 4 default boards (`עבודה` / `אישי` / `פיננסי` / `בית`) are seeded — each with its own color and 4 standard columns (`דחוף` / `מתוכנן` / `רשימת משימות` / `ממתין`). Sharing happens via `slate://share/<linkId>` deep links with editor or view-only roles. There's a single global archive with two tabs (tasks across all boards, whole notes). Navigation: sticky 5-tab bottom nav. Home: dashboard showing total urgent task count + per-board breakdown. FAB at bottom-left for Quick Add. Free, runs entirely on Firebase Spark plan.

---

## 3. Working environment

| Thing | Value |
|---|---|
| OS | Windows (PowerShell) |
| Project root | `D:\Slate\` |
| IDE | Android Studio (installed on Elad's machine) |
| Java | Bundled JBR at `C:\Program Files\Android\Android Studio\jbr\bin\` |
| Package name | `com.slate.app` |
| Min SDK | 26 / Target SDK | 35 |
| Test device | API 34 emulator with **Google Play** image |
| Debug SHA-1 | `5D:1F:3D:88:09:61:CC:08:58:A4:99:C0:5C:FE:0F:71:C9:2F:91:E7` (already in Firebase) |

### Files Elad keeps locally (gitignored)
- `app/google-services.json`
- `~/.android/debug.keystore`
- `keystore.properties` (when release keystore is created)

---

## 4. Firebase backend

**Project:** "Slate" (Firebase). Spark plan only — no Cloud Functions ever (would force Blaze).

- ✅ Authentication: Google provider enabled, support email = `info@alternabe.co.il`
- ✅ Firestore: standard edition, `eur3` region
- ✅ Security rules: at `D:\Slate\firestore.rules`. Edits to the file do **not** auto-deploy — copy contents into Firebase Console → Rules tab → Publish.
- ❌ Crashlytics / Analytics — not yet added (deferred to v1.1)

### Critical rule details
- `users/{uid}` is publicly readable to authenticated users (so share-members display name resolution + email-based invite lookup work). `findUserByEmail` does a `whereEqualTo("email", lowercased).limit(1)` which is permitted by the existing `read` rule.
- `boards` and `notes` allow `update` either by editors OR by `isSelfJoining(...)` — a non-member adding ONLY themselves to memberIds via a share link redemption OR via a queued pendingInvite consumed on first sign-in. The `affectedKeys().hasOnly([...])` constraint keeps that path safe.
- `pendingInvites/{id}` (new): readable + deletable by inviter (`uid == invitedBy`) OR invitee (`request.auth.token.email == resource.data.email`). The invitee's `whereEqualTo("email", auth.token.email)` query is rule-compatible because every result satisfies `isInvitee()`. Create requires `invitedBy == self`; no update path (immutable).
- `cards/{cardId}` (split in 7.3): `create` requires the writer be `createdBy == self` and `assigneeId == self` (auto-assign-to-creator). `update` allows two paths — *reassignOnly* (any board editor; diff hasOnly `['assigneeId']`) OR *creator/assignee* of the existing doc. `delete` requires creator/assignee. Cross-column moves work because the moved doc preserves `createdBy`/`assigneeId`, so the create at the target passes for the same user who satisfied the source delete.
- The `seededAt` field on `users/{uid}` doc is the lock used by `BoardRepository.seedDefaultsIfNeeded`. Updating it requires user-self-write, which is permitted.

---

## 5. Where we are in development

| Phase | Content | Status |
|---|---|---|
| 1 | Project scaffold + Google Sign-In + theme | ✅ |
| 2 | Boards + data models + Kanban | ✅ |
| 3 | Archive + FAB + menu-based moves | ✅ |
| 3.1 | Drag-and-drop (native Compose) | ✅ |
| 4 | Notes (3 types) | ✅ |
| 5 | Sharing | ✅ |
| 6 | Polish | ✅ |
| 6.5 | Bottom nav, dashboard, global archive | ✅ |
| 6.6 | Note archive (whole-note, with tabs in archive screen) | ✅ |
| 6.7 | "נוסף בתאריך" date label on task card sheet | ✅ |
| 6.8 | Default 4 boards × 4 columns + colors + urgent dashboard | ✅ |
| 6.9 | Bug fix: write order for createBoard (board-first, then columns) | ✅ |
| 7.0 | System-bar insets (status bar + nav bar no longer overlapped) | ✅ |
| 7.1 | Archive real-time + description-preserve fix on archive-from-menu | ✅ |
| 7.2 | Email-based sharing + `pendingInvites` (Path A direct add, Path B queued) | ✅ |
| 7.3 | Per-card assignment (`Card.assigneeId`) + creator/assignee gating in UI and rules | ✅ |
| 7.4 | Board pinch-to-zoom + floating zoom toolbar (with fit-all); DnD works at any zoom | ✅ |
| 7.5 | Inline subtasks (`Card.subtasks`) with tap-to-edit dialog, done-state via 3-dot menu, "done/total" pill on card | ✅ |
| 7.6 | Archive restore button gated by creator/assignee + toast on rules failure (was silently failing post-7.3) | ✅ |

---

## 6. Tech stack

- Kotlin 2.1, Compose BoM 2024.12, Material 3
- Hilt 2.53 for DI
- Navigation Compose 2.8.5 with type-safe routes (kotlinx.serialization)
- Coroutines + Flow (StateFlow everywhere)
- Firebase BoM 33.7.0 (Auth + Firestore KTX)
- AndroidX Credentials + googleid for Sign-In
- Compose foundation native drag-and-drop (`@ExperimentalFoundationApi`)
- Coil 2.7 for avatar images
- **No** Room, Retrofit, Reorderable lib, etc. Firestore is the single source of truth.

### Deliberate omissions
- No Domain/UseCase layer (over-engineering for 2-user scale)
- No Cloud Functions (Blaze plan)
- No third-party D&D lib (native Compose API is enough)

---

## 7. Codebase layout

```
D:\Slate\
├── README.md                      (build & release-APK instructions)
├── Slate-app_specification.md     (Hebrew spec, source of truth)
├── Slate-design_brief.md          (English design brief, source of truth)
├── project_overview_rampup.md     ← THIS FILE
├── App_Design/                    (original mockup folders)
├── firestore.rules                (production rules — must be re-published manually)
├── settings.gradle.kts / build.gradle.kts / gradle.properties
├── gradle/libs.versions.toml      (version catalog)
├── .gitignore
└── app/
    ├── build.gradle.kts
    ├── google-services.json       (gitignored)
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/
        │   ├── values/
        │   │   ├── strings.xml    (every UI string, all Hebrew)
        │   │   ├── colors.xml
        │   │   └── themes.xml     (forces RTL + light)
        │   ├── drawable/, mipmap-anydpi-v26/, xml/
        └── java/com/slate/app/
            ├── SlateApplication.kt    (@HiltAndroidApp)
            ├── MainActivity.kt        (single activity; reads share-link intents)
            ├── data/
            │   ├── model/             (Board, BoardColumn, Card, Subtask, Note, NoteItem, ShareLink, PendingInvite, User, BoardMember)
            │   ├── AuthRepository.kt  (lowercases email on user-doc upsert)
            │   ├── BoardRepository.kt (selfJoinBoard, setCardAssignee, createCard auto-assigns to creator, subtask CRUD via mutateSubtasks RMW)
            │   ├── NoteRepository.kt  (selfJoinNote)
            │   ├── ShareRepository.kt (shareByEmail, consumePendingInvitesFor, ShareByEmailResult sealed)
            │   ├── UserRepository.kt  (findUserByEmail)
            │   ├── ShareIntentBuffer.kt
            │   └── SeedDefaults.kt    ← 4 boards × 4 columns + their hex colors
            ├── di/FirebaseModule.kt
            ├── navigation/Routes.kt
            └── ui/
                ├── theme/             (Color + parseHexOr helper, Type, Theme)
                ├── auth/              (LoginScreen + AuthViewModel)
                ├── home/              (HomeScreen dashboard + HomeViewModel)
                ├── boards/            (BoardsListScreen)
                ├── notes/             (NotesListScreen)
                ├── board/             (BoardDetailScreen [hosts pinch+button zoom] + BoardListViewModel + BoardDetailViewModel [exposes boardMembers, currentUid, canModifyCard])
                │   └── components/    (TaskCardView [zoom + assignee chip + subtask done/total pill], BoardColumnView [zoom-aware], CardDetailSheet [assignee picker + creator/assignee gating + SubtasksSection + SubtaskDetailDialog], BoardZoomControls)
                ├── note/              (NoteDetailScreen + NoteListViewModel + NoteDetailViewModel)
                │   └── components/    (ItemListView, FreeTextView, NoteTypeChooser, CreateNoteDialog)
                ├── archive/           (ArchiveScreen + ArchiveViewModel — global + 2 tabs)
                ├── share/             (ShareDialog [now has email-invite section], ShareViewModel, RedemptionViewModel, PendingInviteViewModel ← consumed once per sign-in via AuthedShell LaunchedEffect)
                ├── settings/          (SettingsScreen)
                ├── quickadd/          (QuickAddSheet, QuickAddViewModel)
                ├── components/        (BottomNavBar, SlateTopBar, TextInputDialog, ConfirmDialog)
                ├── drawer/            (orphan: SlateDrawer/NavPanel/ActionRail; ALSO BoardDrawerCard + NoteDrawerCard which are still used)
                ├── AuthedShell.kt     ★ root scaffold for authed UI: TopBar + NavHost + BottomNav + FAB + seedDefaultsIfNeeded LaunchedEffect
                └── SlateApp.kt        ★ outer Login ↔ AuthedShell switcher
```

### Files most worth reading first
1. **`AuthedShell.kt`** — orchestrates the entire authed experience. Owns: bottom nav state, FAB visibility rules, deep-link redemption hook, share dialog hosting, create-board/note dialog hosting, **the seedDefaultsIfNeeded LaunchedEffect**.
2. **`BoardRepository.kt`** — largest repo. Maintains `activeCardCount`, handles cross-collection card moves via WriteBatch, observes archived cards via nested flatMapLatest+combine, **performs default-board seeding inside a Firestore transaction**, **and `createBoard` now writes board-first then column-first to satisfy security rules**.
3. **`SeedDefaults.kt`** — the 4 boards × 4 columns + colors. Single source of truth for these defaults.

---

## 8. Data model & Firestore

### Collections (top-level)
- `users/{uid}` — profile + `seededAt: Timestamp?` (lock for first-launch seeding). `email` is stored **lowercased** on every sign-in (used by `findUserByEmail` and `pendingInvites` matching).
- `boards/{boardId}` — owns subcollections `columns/{columnId}/cards/{cardId}`
- `notes/{noteId}` — items live in an array on the doc itself
- `shareLinks/{linkId}` — invitation tokens (legacy slate://share/<id> flow, still active)
- `pendingInvites/{autoId}` — *(new in 7.2)* email-keyed invitations for users who haven't signed up yet. Consumed once on the invitee's next sign-in by `ShareRepository.consumePendingInvitesFor`. Schema: `{ email (lowercased), resourceType, resourceId, resourceName, role, invitedBy, invitedAt }`.

### Notable fields
- `Board.color: String` — hex like `"#5B8DEF"`. Empty = brand amber fallback.
- `Board.urgentColumnId: String?` — id of the column that feeds the home dashboard urgent count. Set by seeding (= first column id) and `createBoard` (= first auto-created column). Manually-added columns can become this only via code (UI hook deferred to v1.2).
- `Board.activeCardCount: Long` — best-effort counter, maintained on card create/delete/status-change.
- `BoardColumn.color: String` — hex. Renders as a 10dp dot before the column name.
- `Note.archivedAt: Timestamp?` — null = active; non-null = in the global archive's notes tab. The whole note (with all items / content) is preserved for restore.
- `Card.archivedAt: Timestamp?` + `Card.status: "active" | "completed" | "irrelevant"` — task cards' archive state.
- `Card.assigneeId: String` — *(new in 7.3)* uid of the responsible board member. Defaults to `createdBy` on create. Any board editor may reassign (rules carve-out: `reassignOnly` allows updates whose diff is exactly `assigneeId`). Editing title/description, archiving, deleting, and moving between columns are restricted to **creator OR current assignee**, enforced in both UI and `firestore.rules`.
- `Card.subtasks: List<Subtask>` — *(new in 7.5)* inline array of `{ id, title, description, done }`. Stored on the card doc (no subcollection) — small N, always loaded with the parent, and the existing cards `update` rule already gates these mutations by creator/assignee. All four mutations (`addSubtask` / `updateSubtask` / `setSubtaskDone` / `deleteSubtask` in `BoardRepository`) round-trip the whole array via read-modify-write because Firestore can't address array elements by id.

### Security model essentials
- Membership: `memberIds` flat array for queries + `members: [{userId, role}]` for the editor check.
- Self-join: a non-member can append themselves to `memberIds` (and `members`) only when the diff affects ONLY membership-related fields. The `linkId` is unguessable.
- All other writes require editor role.

### Counters caveat
`activeCardCount` is monotonic via `FieldValue.increment()` — it can drift if writes are interrupted but is fine in practice. If it ever matters, add a debug-mode "recompute counters" action under Settings.

---

## 9. UX / architecture decisions worth knowing

### Why the 4 default boards × 4 columns?
- Direct user request. The seeded set is opinionated but immediately usable.
- Implementation: `SeedDefaults.kt` (constants) + `BoardRepository.seedDefaultsIfNeeded(uid)` (transactional lock on `users/{uid}.seededAt`) + a `LaunchedEffect(user?.uid)` in `AuthedShell` that fires it after sign-in.
- **Important pitfall already fixed:** writing columns into a `boards/{boardId}/columns` subcollection BEFORE the parent board doc exists fails the security rules (the column rule does `get(/boards/$boardId)` to verify membership). Both `seedDefaultsIfNeeded` and `createBoard` now write the board doc first (with pre-allocated column IDs in `columnOrder` and `urgentColumnId`), then write the columns.

### Why per-board colors?
- User request. Each board gets its own identity color (used in drawer cards, dashboard breakdown, column dots in the first column).
- Manually-created boards default to brand amber.
- Hex strings stored on Board/BoardColumn; parsed at render time via `parseHexOr(hex, fallback)` in `ui/theme/Color.kt`.

### Why a global archive with two tabs?
- User request. Tasks tab = archived task cards across all boards (with board pill). Notes tab = archived **whole** notes.
- Note archiving sets `archivedAt`; UI filters notes lists client-side by `archivedAt == null`. No new index needed.

### Why drag-and-drop appended to end on cross-column moves?
- Simplification. Cross-collection moves require copy + delete; chaining a precise reorder against the live flow is racy. User can drag again within the new column.
- Documented as known limitation in the spec.

### Why Compose native D&D over Reorderable lib?
- Cleaner cross-column gesture model. Single API for both within-column and cross-column. The Reorderable dep is still in `libs.versions.toml` but unused — safe to remove.

### Why no domain layer / type-safe routes / no Cloud Functions?
- Domain layer = pass-through bloat for two-user scale.
- Type-safe routes via Nav 2.8 + kotlinx-serialization.
- Cloud Functions would force Blaze plan; not worth the cost for MVP scope.

---

## 10. Build & run

```powershell
# Open in Android Studio
File → Open → D:\Slate

# First Gradle sync downloads ~5–15 min of deps. Watch Build panel for errors.

# Build and install on the running emulator
./gradlew installDebug   # from the integrated Terminal panel
```

Debug Logcat tags to filter on: `tag:Slate` covers SlateAuth, SlateBoardList, SlateBoardDetail, SlateNoteList, SlateNoteDetail, SlateQuickAdd, SlateShare, SlateRedemption, SlateArchive, SlateArchiveDbg.

For release builds (signed APK Elad can sideload to his partner's phone), see `README.md` — keystore + Firebase SHA-1 registration steps.

---

## 11. Known issues / deferred work

In priority order:

1. **Cross-column drag drops at end of target column** (within-column drops are precise). Workaround: drag again within column.
2. **Column drag-and-drop** is menu-only (`העבר שמאלה` / `העבר ימינה`). Same Compose D&D primitives could be applied to the horizontal LazyRow.
3. **No way to designate a manually-added column as "urgent column"** — only the first auto-created column on each board (seeded or `createBoard`-created) is wired into `urgentColumnId`. Adding a UI hook (e.g., column 3-dot → "סמן כעמודה דחופה") is straightforward.
4. **Drawer orphans** — `SlateDrawer.kt`, `NavPanel.kt`, `ActionRail.kt` no longer wired. Compile-clean. Safe to delete. (`BoardDrawerCard` / `NoteDrawerCard` ARE still used by list screens.)
5. **Reorderable dependency** still in `libs.versions.toml` and `app/build.gradle.kts`. Unused. Remove.
6. **No Crashlytics / Analytics**. ~15 min to add: Firebase plugin + dep + one-line init.
7. **No accessibility audit pass**. `contentDescription` exists on most icons but focus rings, screen-reader semantics, and 48dp tap targets haven't been verified end-to-end.
8. **`activeCardCount` drift** (theoretical). Worth a "recompute counters" debug action eventually.
9. **No DataStore-backed preferences** (e.g. last-opened tab). Dashboard always recomputes from current data.
10. **Some debug log strings still in English** (e.g. `Log.e(TAG, "createBoard failed", it)`). Not user-facing.
11. **Existing accounts that signed in before the seeding feature** will get the 4 default boards on next launch (because their `seededAt` is null). Their pre-existing manually-created boards remain untouched. If this is undesirable for an existing user, consider setting `seededAt` for them via the Firebase console first.
12. **Card-reorder gap in rules** *(7.3)* — within-column reorder mutates the column doc's `cardOrder` array, gated only by `isEditor` (not by per-card creator/assignee). Rules can't cleanly diff which card moved inside an array. UI suppresses the drag handle for non-creator/assignee, which is sufficient for two-user scale.
13. **Email-invite emails aren't actually sent** — `pendingInvites` queues the permission grant; the invitee discovers it on their next sign-in. There's no SMTP path because Spark plan doesn't include Cloud Functions. Future option: third-party email relay (Resend / SendGrid) called from a tiny Cloud Function on Blaze, or have the inviter ping the recipient out-of-band.
14. **Board zoom doesn't persist** *(7.4)* — resets to 100% on every navigation in/out of a board. Cheap to add a DataStore key per-board if needed, but lower priority than v1.1 items.
15. **Old test cards lacking `assigneeId`** — any cards created before 7.3 have `assigneeId == ""`. After publishing the new card rules, only the original `createdBy` can edit/archive/delete them; partner editors are locked out. Easiest fix: wipe test data, or run a one-shot Firestore Console edit to set `assigneeId = createdBy` on existing card docs.
16. **Subtask array races** *(7.5)* — every subtask mutation does a `get()` + in-memory edit + `update("subtasks", list)`. Two simultaneous edits from two devices on the same card can clobber each other (last write wins, intermediate change lost). Tolerable at two-user scale; if it bites, switch to per-field array updates or a transaction. No subcollection migration needed.

---

## 12. v1.1 backlog (suggested order)

1. **Crashlytics + Analytics** — quick add, high value
2. **Accessibility audit pass** — 1–2 hours
3. **Cross-column precise drop position** — 1–2 hours
4. **Column drag-and-drop** — 2–3 hours
5. **UI to designate any column as the urgent one** — small but visible win
6. **Settings: dark mode toggle** — only if Elad reverses his "Light only" decision
7. **Push notifications for share invites** — needs Cloud Functions OR Firestore listener pattern. Scope carefully.
8. **Search** — out of MVP per spec, but a likely v2 ask.

---

## 13. How to talk to Elad

### Do
- Greet briefly, get to the point
- Lead with what changed and why
- Quote file paths exactly (he'll click them)
- Push back if a request conflicts with prior decisions
- Run `keytool` / `adb` / `gradlew` on his behalf when stuck and you're confident
- Verify Firebase state assumptions — he may have done console changes you don't know about

### Don't
- Dump entire file contents in a message — show diff or describe
- Spawn agents for things you can do inline
- Claim to have built something you couldn't test
- Quietly add new dependencies — mention size and rationale
- Propose optional polish when he asked a specific question

### Patterns from past sessions
- "continue" or "finish" = execute the previously-discussed thing, no preamble
- He pastes raw error output verbatim — diagnose from the first error, not warning noise
- "what we have left?" = give a tight phase-status summary
- He's reversed direction multiple times mid-build (drawer→bottom-nav, per-board archive→global, single accent→per-board colors). Stay flexible.

---

## 14. Self-check before saying "I'm caught up"

Confirm you can answer these without re-reading:

- [ ] What's the package name? (`com.slate.app`)
- [ ] What 4 boards seed on first launch? (`עבודה` / `אישי` / `פיננסי` / `בית`)
- [ ] What 4 columns seed on every board? (`דחוף` / `מתוכנן` / `רשימת משימות` / `ממתין`)
- [ ] Why must `createBoard` write the board doc BEFORE its columns? (Column rules call `get(/boards/$boardId)` for membership check — fails if parent doesn't exist)
- [ ] What field locks first-launch seeding? (`users/{uid}.seededAt`)
- [ ] How does the home dashboard count "urgent"? (Sums active card count of each board's `urgentColumnId` column)
- [ ] How does the archive screen show notes vs tasks? (Top tab switcher: משימות / פתקים)
- [ ] Why does cross-column drag drop at end? (Documented in §9; precise position would require race-prone post-write reorder)
- [ ] Where do per-board colors render? (BoardDrawerCard stripe + tint + text; home dashboard breakdown row dot + count; column-1 dot of seeded boards)
- [ ] How is the column dot rendered? (10dp circle filled with column.color, rendered in BoardColumnView column header before name)
- [ ] What field is the lock for first-launch pending invites? (Each invite doc deletes itself once consumed; the user's `users/{uid}` doc is upserted before consumption so `findUserByEmail` works for subsequent invites)
- [ ] Why does cross-column move still pass the cards rules under creator/assignee gating? (The moved doc preserves the original `createdBy` and `assigneeId`, so the create at the target satisfies `isCreatorOrAssignee(request.resource.data)` for the same user who satisfied the source delete)
- [ ] Why doesn't board zoom break drag-and-drop? (Zoom is implemented by changing column/card *dimensions*, not via `graphicsLayer` scale, so touch coordinates remain accurate)
- [ ] Where does the floating zoom toolbar live? (Bottom-end overlay inside a `BoxWithConstraints` wrapping the LazyRow in BoardDetailScreen)
- [ ] How are subtasks stored, and why no subcollection? (Inline array on the card doc — small N, always loaded with parent, and the existing cards `update` rule already gates by creator/assignee with no extra rules work)
- [ ] How does a user mark a subtask done? (Tap the row → SubtaskDetailDialog → 3-dot → "סמן כהושלם" / "סמן כפעיל". No checkbox in the list view; the row shows a small status dot only.)
- [ ] Why is the restore (↻) button hidden on some archived task rows? (Same creator/assignee gate as the in-board archive menu — non-owners see the row but no button, since the rules would deny their `update`. Notes are unaffected — their rule still permits any editor.)

If any answer is fuzzy, re-read the relevant section.

---

## 15. Reference docs in this repo

- `Slate-app_specification.md` — Hebrew, canonical "what does the app do." Reflects shipped reality.
- `Slate-design_brief.md` — English, canonical "how does the app look/feel."
- `firestore.rules` — published rules. Editing here doesn't auto-deploy.
- `README.md` — build & release-APK instructions.

---

## 16. First action when you arrive

1. Acknowledge to Elad in 2-3 sentences what you understand the current state to be.
2. Ask what he wants to work on next. **Don't** propose work he didn't ask for.
3. If he says "anything from the v1.1 backlog", point at §12 and let him pick.
4. If he reports a bug, diagnose from logs first (he'll paste them), don't speculate.

Welcome to the project. Be careful, be honest, ship small.

---

## 17. UI / Design refresh (2026-05-03)

A focused front-end pass. **No backend or data-model changes** unless noted.

### New canonical design source
- **`DESIGN.md`** at repo root is now the single source of truth for palette / typography / shape / elevation / layout. Old `Slate-design_brief.md` predates it; treat DESIGN.md as authoritative when they conflict.

### Theme tokens aligned to DESIGN.md
- `ui/theme/Color.kt` rewritten:
  - Surfaces: `SlateBackground=#FDF8F8`, `SlateSurface=#FFFFFF`, `SlateSurfaceVariant=#F2F2EC`, `SlateOutline=#E5E2E1`.
  - Text: `SlateTextPrimary=#1C1B1B`, `SlateTextSecondary=#444748`, `SlateTextTertiary=#747878`.
  - Brand families: `BoardsAmber=#E08A3C` / tint `#FCEBD8`; `NotesTeal=#3CA39A` / tint `#D8F0EE`.
  - Urgency tokens (NEW): `UrgencyUrgent=#D64545`, `UrgencyPlanned=#E0A23C`, `UrgencyBacklog=#6B7280`, `UrgencyWaiting=#7C5CD3` (each with a `*Tint` companion).
  - Status: `StatusSuccess=#4A9D5F`, `StatusWarning=#D4A24A`, `StatusError=#BA1A1A`, `StatusInfo=#5B8DEF`.
  - Legacy aliases (`StatusCompleted`, `StatusIrrelevant`, `StatusDestructive`) re-map to the new tokens so existing call sites compile unchanged.
- `ui/theme/Theme.kt` updated to wire the new tokens into M3 `lightColorScheme` (incl. `outlineVariant`).
- `res/values/colors.xml` background + text-primary updated to match.

### Typography (Heebo + Inter, real font files)
- New folder `app/src/main/res/font/` with the 6 weights actually referenced: `heebo_regular/medium/semibold/bold.ttf` and `inter_regular/medium.ttf`. Variable fonts and unused weights were intentionally removed.
- `Type.kt` defines `Heebo` and `Inter` `FontFamily`s and applies them per style.
- **Type scale stepped one level smaller than DESIGN.md spec** per Elad's feedback (everything reads ~one level lighter): display 32→24, headline 24→20, title 20→18, body 16→14, label 14→12.
- Heebo handles Hebrew natively for headings/RTL; Inter is Latin only — Android's font fallback handles Hebrew chars in body styles.

### Seeded urgency columns
- `data/SeedDefaults.kt` `ColumnColor` constants renamed and re-coloured to the urgency palette: `URGENT/PLANNED/BACKLOG/WAITING`. Existing user boards keep whatever they have — only newly seeded boards use the new hexes. To re-seed an existing user, wipe `users/{uid}.seededAt` in Firebase Console.

### Top bar (`ui/components/SlateTopBar.kt`)
- Removed: Google avatar (AsyncImage) and AccountCircle icon.
- Added: app logo (`R.drawable.slate_logo`) + wordmark "Slate - Simply Managed" (string `app_title_with_tagline`).
- The logo+wordmark Row is wrapped in `CompositionLocalProvider(LocalLayoutDirection provides Ltr)` so the logo sits visually to the **left** of the Latin wordmark even though the rest of the app is RTL.
- Signature simplified to `SlateTopBar(modifier: Modifier = Modifier)` — `user`/`onAccountClick` removed. Settings is reachable via the bottom nav.

### Home screen (`ui/home/HomeScreen.kt`)
- Urgent summary card: icon "!" and the "יש לך X משימות דחופות" text now share one Row.
- "פירוט לפי לוח" subtitle removed from inside the card; rendered above the breakdown list as a SemiBold heading.
- Breakdown list is now a **2-column grid of square-ish tiles**, not a vertical list. Each tile: bold board name (top), big colored count (`displaySmall.Bold` in board accent), "משימות" label. The orange dot indicator was removed. Tiles hug content (no `aspectRatio(1f)`), so the bottom edge sits right under "משימות" with no trailing whitespace.

### Drawer cards (`ui/drawer/BoardDrawerCard.kt`, `NoteDrawerCard.kt`)
- The accent stripe on the leading (RTL: right) edge is now `fillMaxHeight()` instead of fixed 28dp — it now spans the full 56dp card edge-to-edge for a cleaner visual anchor.
- Inner padding shifted: stripe sits flush against the card edge, with a 12dp spacer before the icon.

### Cards (board view)
- `ui/board/components/CardDetailSheet.kt`: title `OutlinedTextField` and the 3-dot menu now share one Row (title with `weight(1f)`, menu trailing). Removes the empty top strip that previously sat above the title when `canModify` was true.
- `BoardZoomControls.kt`: the toolbar was simplified to a single magnifier `IconButton` that toggles `expanded`. When expanded, the [−] [%] [+] [fit] cluster reveals via `AnimatedVisibility(expandHorizontally + fadeIn)`. Behaviour is unchanged when expanded.

### Note creation
- `NoteTypeChooser.kt`: chip label uses `maxLines = 1, softWrap = false` so labels never break across two rows.
- `R.string.note_type_free_text` shortened from "טקסט חופשי" → "טקסט".

### Navigation / chrome
- `AuthedShell.kt`: NavHost transitions disabled (`enterTransition = { EnterTransition.None }` etc.) — screen switches are now instant, no fade.
- FAB visibility narrowed to **Home only** (`currentRoute.contains("HomeRoute")`). Boards / Notes / Archive / Settings have no FAB.

### Board delete bug fix (rules + UI feedback)
- **Root cause**: cascading board-delete tried to delete every card on the board; the cards `delete` rule from feature 7.3 only allows the card's `createdBy` or `assigneeId` to delete it. Any card the partner created on the owner's board failed → `await()` threw → cascade aborted → board doc never deleted, leaving partial state.
- **Rules fix** (in `firestore.rules`): added a board-owner carve-out on the cards `delete` rule. The owner can now delete any card on their own board. Other editors still can't delete cards they don't own/aren't assigned to. Boards still only deletable by owner.
- **UI fix**: `BoardDetailViewModel` exposes `deleteErrors: SharedFlow<Unit>`; `BoardDetailScreen` collects it into a Toast `מחיקת הלוח נכשלה` so future failures aren't silent.
- **Action required**: rules must be re-published manually in Firebase Console — repo edits don't auto-deploy.

### Things deferred from this pass (Pass 4 in the plan)
- Component sweep: card padding standardisation to 20dp, OutlinedTextField → underline-style inputs with teal/amber focus accent, list dividers using `outline` token, checkbox active colour = `StatusSuccess`, button Ghost/Tonal pattern.
- Dark mode (explicitly out of scope per product decision). **Update — now shipped, see §18.**

---

## 18. Dark mode (2026-05-03)

User-selectable theme (system / light / dark), controlled from Settings, persisted via DataStore.

### New / modified files
- **`data/SettingsRepository.kt`** *(new)* — wraps `DataStore<Preferences>`, exposes `themeMode: Flow<ThemeMode>` and `suspend setThemeMode(...)`. `enum ThemeMode { SYSTEM, LIGHT, DARK }` defined here.
- **`di/AppModule.kt`** *(new)* — `@Provides @Singleton DataStore<Preferences>` backed by `preferencesDataStore("slate_settings")`.
- **`ui/settings/SettingsViewModel.kt`** *(new)* — Hilt VM, exposes `themeMode: StateFlow<ThemeMode>` (Eagerly), `setTheme(...)`.
- **`ui/settings/SettingsScreen.kt`** — added "מראה" section above About, with a 3-pill selector (`מערכת / בהיר / כהה`) styled like `RoleChip` from ShareDialog.
- **`ui/theme/Color.kt`** — added dark-mode tokens (`SlateBackgroundDark`, `SlateSurfaceDark`, `SlateSurfaceVariantDark`, `SlateOutlineDark`, `SlateText*Dark`, `SlatePrimaryDark`, `SlateOnPrimaryDark`). Brand and urgency colors are shared across both modes.
- **`ui/theme/Theme.kt`** — added `SlateDarkColorScheme`. `SlateTheme(darkTheme: Boolean = isSystemInDarkTheme(), content)` picks the scheme.
- **`MainActivity.kt`** — injects `SettingsRepository`, collects `themeMode`, resolves to `darkTheme: Boolean`, and flips `WindowInsetsController.isAppearanceLight{Status,Navigation}Bars` so system bars follow the chosen mode at runtime.
- **`res/values/themes.xml`** — removed hardcoded `windowLightStatusBar/NavBar`; bars now driven by the controller. Made bars transparent (handled via `enableEdgeToEdge`). RTL preserved.
- **`res/values-night/colors.xml`** *(new)* — dark mirror of `slate_background`/`slate_surface`/`slate_text_primary` so the pre-Compose splash matches when system is dark.
- **`res/values/strings.xml`** — added `settings_appearance_section`, `theme_system`, `theme_light`, `theme_dark`.
- **`DESIGN.md`** — appended a "Dark mode" section listing the new tokens.

### Behaviour
- First launch: defaults to `SYSTEM` (follows device).
- Tapping a chip in Settings flips the theme instantly across the whole app and persists the choice across restarts.
- Brand / urgency / status colors are shared between modes — fine-tune on a per-screen basis later if any accent reads too saturated on dark.

### Constraints respected
- Light-only `Color.kt` tokens unchanged → no risk to existing light-mode rendering.
- No new dependencies (DataStore was already in `libs.versions.toml`).
- RTL still hard-locked via `themes.xml` + `CompositionLocalProvider` in `SlateTheme`.

### Settings UI follow-ups
- "מערכת" (System) chip removed from the appearance selector — only "בהיר" / "כהה" are shown. `ThemeMode.SYSTEM` remains in the enum and is the silent default for users who haven't tapped a chip yet (keeps backward compatibility).

### Drawer-card contrast: per-mode background
- `BoardDrawerCard` and `NoteDrawerCard` switch their inactive container by mode:
  - **Light**: original colorful tint (`accent.copy(alpha = 0.12f)` for boards, `NotesTealTint` for notes) — preserves the warm identity.
  - **Dark**: `MaterialTheme.colorScheme.surfaceVariant` so titles stay legible against the warm-near-black surface.
- Mode is detected per-render via `MaterialTheme.colorScheme.background.luminance() < 0.5f`, so it follows whatever theme is active.

### App version
- `app/build.gradle.kts`: `versionName = "1.0.0"`, `versionCode = 2`. Settings → "אודות" reads versionName at runtime, so it auto-displays after rebuild.

### Fix: in-app theme overrides system mode
- **Symptom**: when the device system is in dark mode and the user picks "בהיר" inside the app, the screens still showed dark backgrounds because the Android resource system resolved `values-night/colors.xml` for `slate_background` (used by `themes.xml` as the activity windowBackground), regardless of Compose's runtime theme.
- **Fix**:
  1. `AuthedShell.kt` outer Column now paints `MaterialTheme.colorScheme.background` explicitly. Compose owns the background, no leak from the activity window.
  2. `app/src/main/res/values-night/colors.xml` deleted. `slate_background` is a single light value now; the user's in-app choice fully drives rendering.
- **Tradeoff**: when system is light and user picks "כהה", the brief pre-Compose splash is cream (Compose then paints dark a fraction of a second later). Acceptable because mode is explicit.
- `themes.xml` keeps `statusBarColor` / `navigationBarColor` referencing `@color/slate_background` — both are cream now, and `MainActivity` flips the icon tint at runtime via `WindowInsetsController` to remain legible against whichever Compose theme is active.

---

## 19. AI Smart Assistant (2026-05-05 → 2026-05-09, branch `feature/ai-assistant`)

Conversational Hebrew assistant. **Not yet merged to `main`** — lives on `feature/ai-assistant`. Canonical spec: [`Slate_AI_Assistant_Spec.md`](Slate_AI_Assistant_Spec.md) v3.1. Read that for the full picture; this section is the rampup-style cheat sheet.

### What it does
- **Brain-dump intake.** User dictates free-form Hebrew; bot routes each item via a JSON action vocabulary.
- **Action kinds:** `INSERT_CARD`, `INSERT_NOTE_ITEM`, `APPEND_NOTE_TEXT`, `MOVE_CARD` (cross-column AND cross-board), `LINK_NOTE_TO_CARD` (attach existing note to existing task), `SHOW_STATUS` (formatted Hebrew breakdown), `PROPOSE_NEW_BOARD`, `PROPOSE_NEW_NOTE`, `ASK_CLARIFICATION`.
- **Confirmations:** PROPOSE_* renders Yes/No chips; new-board flow then asks for a column from the 4 seeded names. ASK_CLARIFICATION renders the question and lets the next user message be the reply.
- **Undo:** 30s snackbar [בטל] for inserts (soft-archive cards / pop note items / restore prior free-text content).

### Architecture (one-paragraph version)
`AssistantScreen` (Compose `ModalBottomSheet`, opened from a violet→magenta→amber gradient ✨ icon in `SlateTopBar`) talks to `AssistantViewModel`, which holds the entire chat session in an in-memory `MutableStateFlow<TransientState>` — **no Firestore persistence, no DataStore retention of history.** On `sendMessage` the VM forwards the full conversation as Gemini's multi-turn `contents` array via `AssistantApiClient.generate(apiKey, ...)`. The API key is per-user BYO, read from DataStore (`assistant_api_key`) on each call — never embedded in the APK, never written to Firestore. `AssistantRepository` builds the boards/notes context JSON, gates the daily message cap, filters returned actions by user capability flags, and delegates execution to existing `BoardRepository` / `NoteRepository` methods (so existing security rules and offline persistence apply unchanged). New repo method: `BoardRepository.moveCardBetweenBoards` (batch copy + delete; preserves `createdBy`/`assigneeId` so destination's create rule passes for the same user who satisfied the source's delete). Default model is `gemini-1.5-flash` (free-tier-available everywhere; 2.x flash variants returned `limit:0` on new projects).

### Memory model — session only
Each tap of the ✨ icon = fresh session via `AssistantViewModel.onOpened()` which resets `transient` to a new `TransientState` and seeds a Hebrew greeting message listing the bot's currently-enabled capabilities. Closing the sheet drops everything. **No `users/{uid}/assistantHistory/*` collection** (existed briefly in v2.1 of the spec; reversed before merge per the user's preference for in-memory + multi-turn).

### Capabilities are user-toggleable
7 switches in **chat ⚙️ → AssistantSettingsScreen → יכולות**, persisted as `AssistantCapabilities` in DataStore. Disabled kinds are filtered out of the system prompt (so the model doesn't even propose them) AND dropped client-side as a backstop. `ASK_CLARIFICATION` is intentionally not togglable.

### System prompt is user-editable
`AssistantRepository.buildSystemPrompt(instructions, contextJson, capabilities)` stitches three layers:
1. **Instructions** — user-editable on `AssistantPromptScreen` (default Hebrew, stored in DataStore).
2. **Context block** — auto-injected boards/notes JSON. Not editable.
3. **Output format** — JSON schema with the dynamically-filtered enabled-kinds list. Locked in code.

User edits to `instructions` cannot break the JSON contract because the schema spec is appended after.

### Settings hierarchy — entry from chat, not from main Settings
```
✨ chat sheet header → ⚙️ gear → AssistantSettingsScreen → "הוראות לעוזר ›" → AssistantPromptScreen
```
The global "הגדרות" tab does **not** include any AI controls — it's intentionally lean (Account / Appearance / About). All AI settings (BYO key field, model display, usage counter, capability toggles, prompt editor link, privacy panel) live exclusively on the chat surface. Tapping the gear closes the chat session and navigates to `AssistantSettingsRoute`; re-opening the chat starts a fresh session. Routes: `SettingsRoute`, `AssistantSettingsRoute`, `AssistantPromptRoute`.

### Files
| File | Purpose |
|---|---|
| `data/assistant/AssistantModels.kt` | `AssistantAction` sealed type + `ChatTurn` + `AssistantUndoTarget` |
| `data/assistant/AssistantApiClient.kt` | Gemini REST (multi-turn `contents`) + tolerant JSON parser |
| `data/assistant/AssistantRepository.kt` | Context builder + executor + cap + capability filter |
| `data/SettingsRepository.kt` | Adds `assistantSystemPrompt`, `assistantCapabilities`, `assistantUsage`, `assistantPrivacyAcknowledged`, `assistantModel` |
| `ui/assistant/AssistantViewModel.kt` | In-memory chat + multi-turn + greeting |
| `ui/assistant/AssistantScreen.kt` | ModalBottomSheet UI; status-bar padded; user/assistant/status bubbles |
| `ui/assistant/AssistantSettingsScreen.kt` | Dedicated AI settings (model + usage + capability toggles + privacy) |
| `ui/assistant/AssistantPromptScreen.kt` | Dedicated prompt editor |
| `ui/assistant/AssistantEntry.kt` | First-launch privacy disclosure dialog + `AssistantEntryViewModel` |
| `ui/components/SlateTopBar.kt` | Adds optional `onAssistantClick` with gradient icon |

### API key (per-user BYO, DataStore-backed) — *2026-05-08*
Each user pastes their own Gemini key in-app at **AI chat → ⚙️ → "מפתח API של Gemini"**. Stored in DataStore (`assistant_api_key`), never written to Firestore, never embedded in the APK. Reverted from the v3.0 BuildConfig path so anyone can run their own build without editing source.

- Get a free key at https://aistudio.google.com/apikey (linked from the Settings field).
- Empty / unset → red MISSING_KEY banner in chat. Chat refuses to send.
- `app/build.gradle.kts` no longer reads `local.properties` and `buildConfig` is back to default-off (no other consumers).

### Key invariants worth remembering
- The bot **always acts as the current user** — `createdBy = assigneeId = uid` on inserts. Existing card rules (`isCreatorOrAssignee`) are satisfied without modification.
- `MOVE_CARD` cross-board uses `BoardRepository.moveCardBetweenBoards` (batch copy + delete preserves IDs).
- Greeting is a "model" turn but Gemini requires `contents` to start with `user` — `toChatTurns()` does `dropWhile { role != USER }` to stay compliant.
- Daily cap (100 msg/user) is checked **before** appending to the in-memory transcript so over-cap users don't pollute the session with attempts.
- Privacy disclosure is shown once (DataStore-backed `assistantPrivacyAcknowledged` flag) before the first sheet open.

### Known limitations
- Per-user BYO key sits in DataStore. Uninstall wipes it; reinstall = re-enter once.
- No persistent history — design intent, not a bug. Closing the sheet wipes the session.
- Free-tier Gemini may use prompts for training. Disclosed in Settings → "פרטיות".
- `MOVE_CARD` undo isn't wired to the snackbar (the user can ask the bot to move it back).
- Cap counter is client-side only; will harden in the proxy migration.
- Free-tier model availability is opaque per-account. We default to `gemini-1.5-flash`; if a user's project returns `limit:0` even for that, swap `SettingsRepository.DEFAULT_MODEL` to `gemini-1.5-flash-8b` or wire the model dropdown.

---

## 20. Linked notes on tasks (2026-05-08, branch `feature/ai-assistant`)

A Card can soft-reference one or more existing Notes. The reference is just an array of note IDs on the card document — the Note itself stays in the top-level `notes/{noteId}` collection and can be linked to many cards.

### Why "soft reference" and not embed
- Renaming/archiving/deleting the Note auto-reflects everywhere without backfilling.
- Same Note can power multiple tasks (e.g. one "Project X meeting notes" Note linked to three task cards).
- Tiny diff on the card doc — single `update("linkedNoteIds", arrayUnion/arrayRemove)`.

### Data model
```kotlin
data class Card(
    ...
    val linkedNoteIds: List<String> = emptyList(),
)
```

### Repository
```kotlin
BoardRepository.addLinkedNote(boardId, columnId, cardId, noteId)
BoardRepository.removeLinkedNote(boardId, columnId, cardId, noteId)
```
Both are single-field `update`s; the existing cards `update` rule (`isCardEditor() && (isReassignOnly || isCreatorOrAssignee)`) gates by creator/assignee — exactly the permission model we want for attach/detach. **No `firestore.rules` change.**

### UI
`CardDetailSheet` now has a "פתקים מקושרים" section between Subtasks and the Assignee picker:
- Each linked note renders as a row (dot + name + click-to-open + "x" to unlink when canModify).
- A "+ קשר פתק" affordance opens `LinkedNotePickerDialog`, listing the user's available (non-archived) notes with already-linked ones filtered out.
- Notes whose ID can't be resolved (deleted/archived) render muted with an unlink-only control — no broken state on screen.

`BoardDetailScreen` passes `availableNotes` (from `BoardDetailViewModel.availableNotes` — non-archived notes via `NoteRepository.observeNotes(uid)`) and an `onOpenNote(noteId)` callback that pops the card sheet then navigates to `NoteRoute(noteId)`. Wired through `AuthedShell`.

### AI assistant integration
New action kind `LINK_NOTE_TO_CARD` with required fields `{boardId, columnId, cardId, noteId}`. Capability toggle "קישור פתקים למשימות" in Settings → עוזר חכם → יכולות. The model picks both the card ID and the note ID from the same context block already used for `MOVE_CARD`. Failed links surface as `⚠️ {text}`; successful ones as `🔗 {text}`.

### Files
| File | Change |
|---|---|
| `data/model/Card.kt` | Added `linkedNoteIds: List<String>` |
| `data/BoardRepository.kt` | `addLinkedNote` / `removeLinkedNote` |
| `data/SettingsRepository.kt` | New `linkNoteToCard` capability flag |
| `data/assistant/AssistantModels.kt` | New `AssistantAction.LinkNoteToCard` |
| `data/assistant/AssistantApiClient.kt` | Parser branch for `LINK_NOTE_TO_CARD` |
| `data/assistant/AssistantRepository.kt` | Executor branch; prompt advertisement; `allows()` mapping |
| `ui/board/BoardDetailViewModel.kt` | `availableNotes` flow; `linkNote` / `unlinkNote` |
| `ui/board/BoardDetailScreen.kt` | New `onOpenNote` param; passes notes + callbacks to sheet |
| `ui/board/components/CardDetailSheet.kt` | New `LinkedNotesSection` + picker dialog |
| `ui/AuthedShell.kt` | Wires `onOpenNote` from board detail to NoteRoute |
| `ui/assistant/AssistantViewModel.kt` | `processAction` handles `LinkNoteToCard` |
| `ui/assistant/AssistantSettingsScreen.kt` | New capability toggle row |
| `res/values/strings.xml` | Hebrew copy for the section + capability toggle |

### Things to remember
- Linking and unlinking are gated by **creator/assignee** of the card (same rule as edit/archive/delete). A board editor who isn't either sees the linked-notes list but no add/remove controls.
- The AI bot acts as the current user — `BoardRepository.addLinkedNote` doesn't change `assigneeId`, so the diff stays within the existing creator/assignee gate.
- Linked notes live across board sharing: if you link your private Note to a card on a shared board, partners see *the link* but only the partner-shared notes resolve to a name. Unresolvable IDs render as "פתק לא זמין".

---

## 21. firestore.rules `isEditor` simplification (2026-05-09)

### Symptom
On a board the partner shared with you (you join via `pendingInvite` → `selfJoinBoard`), tapping "+ הוסף משימה" caused the card detail sheet to **flash and immediately disappear**. Logcat:

```
PERMISSION_DENIED: Missing or insufficient permissions.
Write failed at boards/{boardId}/columns/{columnId}/cards/{cardId}
```

The "flash" was the Firestore client's optimistic local write, then the server rolled it back.

### Root cause
The `isEditor(boardData)` rule used `members.hasAny([{userId: ..., role: "editor"}])` to enforce viewer vs editor at the rules layer. **Firestore Rules' `hasAny` over a list-of-maps literal does not reliably match stored maps**, even when fields are structurally identical (verified in Rules Playground — denying for correctly-stored editor entries).

It only worked for the board's **owner**, because `isEditor` short-circuited via the first clause `ownerId == auth.uid`. As soon as a non-owner tried to write, the broken `hasAny` was the only path and it always returned false.

### Fix
Simplified `isEditor` to drop role differentiation at the rules layer:

```
function isEditor(resourceData) {
  return resourceData.ownerId == request.auth.uid ||
         request.auth.uid in resourceData.memberIds;
}
```

Any member of a board is now treated as a writer. Viewer-vs-editor distinction lives in the UI (Share dialog still shows the role radio; client checks role and hides write affordances). For Slate's two-user scope this matches reality — wife shares as editor, full stop.

### When you'd want to revert
If Slate ever needs server-enforced viewer role (e.g. a third user shared as view-only), the canonical fix is to add an `editorIds: List<String>` field on `Board`, populate it in parallel with `members`, and check `request.auth.uid in d.editorIds`. Migration is one-time over existing boards.

### Files
- `firestore.rules` (committed) + Firebase Console rules tab (manually published).

---

## 22. Rename: "לוח תעדוף" → "לוח משימות" (2026-05-09)

Pure string change. Five entries in `app/src/main/res/values/strings.xml` plus two doc references (`Slate-app_specification.md`, `Slate-design_brief.md`). Product concept is unchanged (still a Kanban prioritization board); only the user-facing label simplified to "task board." No data, schema, or behavior change.

---

## 23. Weekly-completed counter on Home (2026-05-11)

Small green badge on the Home header, visually opposite the `היי {username}` greeting (left side under RTL): `N הושלמו השבוע` wrapped in the standard surface card. Counts cards the **current user** marked `סמן כהושלם` since the start of the local week (Sunday 00:00). Real-time, derived from Firestore — un-completing decrements; old completions before this build aren't counted (no backfill).

**Schema**
- `Card`: added `completedAt: Timestamp?` and `completedBy: String?`. `BoardRepository.setCardStatus` writes both when `status` becomes `completed`, clears them otherwise. `archivedAt` semantics unchanged (covers all non-active states).
- No `firestore.rules` change — extra fields ride on the existing `isCreatorOrAssignee` card-update rule.

**Wiring**
- `BoardRepository.observeMyWeeklyCompletions(uid): Flow<Int>` — local aggregation across `observeArchivedCards(boardId)` for every board the user is a member of, filtered to `status == COMPLETED && completedBy == uid && completedAt >= startOfWeek`. We tried a `collectionGroup("cards")` query first; it requires a composite Firestore index that wasn't auto-created and silently returned 0, so we switched to per-board aggregation (~16 listeners worst-case for 4 boards × 4 columns — fine at this scale).
- `HomeViewModel`: 4-arg `combine(boardsFlow, notesFlow, urgentFlow, weeklyCompletedFlow)`. Weekly flow wrapped in `.onStart { emit(0) }.catch { emit(0) }` so a transient Firestore error can't tear down home state.
- `HomeScreen`: greeting wrapped in a `Row` with `WeeklyCompletedBadge` as the second child (renders left under RTL).

**Files**: `data/model/Card.kt`, `data/BoardRepository.kt`, `ui/home/HomeViewModel.kt`, `ui/home/HomeScreen.kt`, `res/values/strings.xml`.

---

## 24. Assignee Google avatars on task cards (2026-05-11)

Visual differentiator for "mine vs. shared with me" tasks on the Kanban view. `TaskCardView`'s 28dp `AssigneeAvatar` chip was an initials-only Box; now renders the assignee's actual Google photo via `coil.compose.AsyncImage` when `User.photoUrl` is set. Same composable is reused in `CardDetailSheet`'s assignee picker, so the treatment carries over there for free.

**Fallback**: when `photoUrl` is null/blank, render a colored initial chip with hue derived from `user.uid.hashCode() % 360` — gives every uid a stable, distinct color.

**Files**: `ui/board/components/TaskCardView.kt`.

---

## 25. Checklist UX overhaul (2026-05-11)

Several focused improvements to `ui/note/components/ChecklistView.kt` (the backbone for both `TYPE_CHECKLIST` and `TYPE_BULLETS` notes):

1. **Done items sink to bottom with extra spacing** — checklist items partitioned into active + done; done items render after the add-row, separated by a 24dp `Spacer`. Bullets keep their original ordering.
2. **`+ הוסף פריט` row sits above the done section**, between active items and the spacer.
3. **Drag-to-reorder via `sh.calvin.reorderable`** — each active item gets a 6-dot `Icons.Outlined.DragIndicator` handle (trailing). Drag persists via `NoteRepository.reorderItems(noteId, orderedIds)`. Done items are non-draggable (auto-sorted to bottom).
4. **No more X (delete) buttons** — to remove an item, tap it, clear the text, press Done. Empty commit deletes (`onCommitEdit` → `onItemDeleted`).
5. **No more ✓ (commit) button** — keyboard Done is the only commit affordance.
6. **Multi-line edit field** — `singleLine = false` so long text wraps and is fully visible while editing.

**New repo method**: `NoteRepository.reorderItems(noteId, orderedIds: List<String>)` — validates that the new ordering covers every existing item, then writes the reordered array.

**Files**: `data/NoteRepository.kt`, `ui/note/NoteDetailViewModel.kt`, `ui/note/NoteDetailScreen.kt`, `ui/note/components/ChecklistView.kt`.

---

## 26. AI Assistant: persistent chat history (2026-05-11)

Per the original spec, the assistant chat was strictly session-scoped — closing the sheet wiped everything. Per user request, the conversation now persists across app restarts. Storage is **DataStore + JSON** (single key `assistant_history_json`), purely on-device. Wiped only by Android Settings → Apps → Slate → Storage → Clear data.

**Behavior**
- First-ever open: greeting seeded with active capabilities (as before).
- Subsequent opens: previous thread renders immediately; transient UI state (pending undo / confirmation / errors / `isThinking`) is cleared but messages stay.
- Every message-list change is encoded to JSON and written to DataStore. `Confirm` rows (UI-only) are excluded; `User`, `Assistant`, and `Status` rows are persisted with their ids.
- Format is forward-compatible: unknown `k` values are skipped on decode.

**Init guard**: a `historyLoaded: MutableStateFlow<Boolean>` flag prevents the persist-on-change collector from race-clobbering the saved value with the empty initial state, and prevents `onOpened` from seeding a greeting on top of a populated thread.

**Files**: `data/SettingsRepository.kt`, `ui/assistant/AssistantViewModel.kt`.

---

## 27. AI Assistant: default model swap + retired-model auto-upgrade (2026-05-11)

Google retired `gemini-1.5-flash` from the v1beta endpoint mid-2026 — the API now returns 404 NOT_FOUND. Slate's default was that model, so every chat call failed with a generic error.

**Fix**
- `SettingsRepository.DEFAULT_MODEL` → `gemini-2.5-flash`.
- New `RETIRED_MODELS` set covering `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-pro`. The `assistantModel` flow auto-upgrades any stored value matching this set to `DEFAULT_MODEL`, so existing installs recover without the user clearing app data.

**Reactive API-key check (related fix)**: `AssistantViewModel.hasApiKey()` was a one-shot snapshot read, so the chat input's "צריך להגדיר מפתח" banner didn't disappear when the user pasted a key in Settings. `keyAvailable` is now public and `AssistantScreen` collects it via `collectAsStateWithLifecycle()`.

**Files**: `data/SettingsRepository.kt`, `ui/assistant/AssistantViewModel.kt`, `ui/assistant/AssistantScreen.kt`.

---

## 28. AI Assistant: prompt rule for empty-urgent boards (2026-05-11)

Added a rule to `DEFAULT_SYSTEM_PROMPT`: SHOW_STATUS must skip boards that have no urgent tasks; if no board has any urgent tasks, return a single short "אין משימות דחופות" instead of a per-board breakdown. Only applies to users who haven't customized the system prompt via Settings → AI → "הוראות מערכת".

**Files**: `data/SettingsRepository.kt`.

---

## 29. Share dialog: email autocomplete history (2026-05-11)

Each successful invite (`Granted` or `Pending`) records the email to a local DataStore-backed MRU list (newest first, deduped case-insensitively, capped at `SHARE_EMAIL_HISTORY_CAP = 20`). The share-dialog email field is now an `ExposedDropdownMenuBox` — tap to see the full history; type to narrow by substring. Selecting a suggestion fills the field. Local-only; wiped on Clear data. No backfill from Firestore.

**Files**: `data/SettingsRepository.kt`, `ui/share/ShareViewModel.kt`, `ui/share/ShareDialog.kt`.

---

## 30. Home-screen widget (Glance, 4×2) (2026-05-11)

First Slate widget. Mirrors the dashboard's two top-line numbers (urgent + weekly-completed) with a richer treatment: greeting + brand on top, an amber-tinted "urgent tasks" pill in the middle (with a circled `!` icon and a chevron), and a teal weekly progress bar at the bottom (`weeklyCompleted / weeklyGoal=15`). Tap → opens `MainActivity` (Home).

**Architecture**
- `WidgetStatsRepository` (DataStore-backed): caches `urgent`, `weeklyCompleted`, `displayName`. The widget reads from this cache — never directly from Firestore — so it can render even when the app process is dead.
- `WidgetStatsBridge` (`@Singleton`, started from `SlateApplication.onCreate`): process-wide collector that mirrors the same flows `HomeViewModel` consumes (`observeBoards` → urgent column counts; `observeMyWeeklyCompletions(uid)`; auth user displayName) and writes the snapshot to DataStore on every change. Calls `SlateStatsWidget().updateAll(context)` to push new RemoteViews to all instances.
- `SlateStatsWidget : GlanceAppWidget` + `SlateStatsWidgetReceiver : GlanceAppWidgetReceiver`. Uses `EntryPointAccessors.fromApplication(context, Deps::class.java)` to fetch the repository (Glance composables can't `@Inject` directly).
- `androidx.glance:glance-appwidget` + `glance-material3` 1.1.1 added to `libs.versions.toml`.

**RTL handling**: Glance widgets render via RemoteViews on the launcher process, which doesn't always inherit the app's RTL config. Each row in the widget uses an `isRtl = ctx.resources.configuration.layoutDirection == LAYOUT_DIRECTION_RTL` check to **explicitly order children** so the greeting, urgent pill content, and bottom captions land on the correct side regardless of host. The chevron drawable is also swapped (`ic_chevron_right` under RTL, `ic_chevron_left` under LTR).

**Layout**
- Outer Column: `fillMaxWidth().wrapContentHeight()` — the white card shrinks to content rather than stretching to fill the launcher's whole cell.
- Top row: greeting on right (`textAlign = End` so it flushes against the right edge of its weighted area), brand `● Slate` on left.
- Urgent pill: amber-tinted bg (`#F59E0B` at ~8%), `!` icon in a 36dp amber-ring badge on the right, Hebrew text (right-aligned), chevron on the left.
- Bottom: muted "הושלמו השבוע: N" (right) and "יעד שבועי: 15" (left), then a 6dp `LinearProgressIndicator` showing the ratio.

**Files**
- `data/WidgetStatsRepository.kt` (new)
- `widget/WidgetStatsBridge.kt` (new)
- `widget/SlateStatsWidget.kt` (new — Glance composable + receiver)
- `res/xml/slate_stats_widget_info.xml` (provider config: 4×2 target, resizable horizontal+vertical, min 280×160dp)
- `res/drawable/ic_priority_high.xml`, `ic_chevron_left.xml`, `ic_chevron_right.xml` (new vector drawables)
- `AndroidManifest.xml` (receiver registration with `APPWIDGET_UPDATE` intent filter)
- `SlateApplication.kt` (`@Inject lateinit var widgetStatsBridge` + `widgetStatsBridge.start()` in `onCreate`)
- `app/build.gradle.kts` + `gradle/libs.versions.toml` (Glance 1.1.1 deps)

**Limitations**
- Counts are forward-looking only — pre-existing completed cards have `completedBy = null`.
- When the app process is killed, the widget shows the last cached snapshot. Re-priming happens the next time the app runs.
- `weeklyGoal` is hardcoded to 15. Future: surface as a Setting.

---

## 31. In-app notifications: share / assignment / reminder (2026-05-22, branch `mobile-home-page-change`)

First end-to-end notification system. **No FCM, no Cloud Functions** — purely Firestore-listener-driven, in keeping with the Spark-plan constraint. Producers (the inviter / re-assigner / pinger) write a doc to `users/{recipientUid}/notifications/{notifId}`; the recipient's process picks it up via a long-lived listener and posts an Android system notification. Tapping the system notification deep-links into the resource.

### Three event types
| Type | Trigger | Resource fields |
|---|---|---|
| `share_invite` | `ShareRepository.shareByEmail` Path A (recipient already registered) | `resourceType=board\|note`, `resourceId=board/note id`, `secondaryId=""` |
| `assignment` | `BoardRepository.setCardAssignees` for each newly-added uid (excludes the actor) | `resourceType="card"`, `resourceId=boardId`, `secondaryId=cardId` |
| `reminder` | Manual bell tap on `CardDetailSheet` → `BoardRepository.pingAssignees` (fan-out to all non-self assignees) | `resourceType="card"`, `resourceId=boardId`, `secondaryId=cardId` |

Path B (pending-invite consumed at sign-in) deliberately does **not** notify — comment in `ShareRepository.consumePendingInvitesFor` explains: the inviter is not the auth'd writer at consume time, so the rules wouldn't permit it; the recipient is actively signing in and discovers the new resource via their boards/notes list anyway.

### Data model
```kotlin
data class NotificationItem(
    val id, type, resourceType, resourceId, secondaryId, resourceName,
    val fromUid, fromName,
    val createdAt: Timestamp?, val readAt: Timestamp?,
)
```
Lives at `users/{uid}/notifications/{notifId}`. `fromName` is denormalized at write time (read from `users/{fromUid}.displayName`) so the bridge can compose "X shared Y with you" without the recipient needing a prior read on the inviter.

### Firestore rules (new block)
```
match /users/{userId}/notifications/{notifId} {
  allow read, update, delete: if request.auth.uid == userId;
  allow create: if request.auth != null
                   && request.resource.data.fromUid == request.auth.uid
                   && request.resource.data.fromUid != userId;
}
```
Any authenticated user can write to anyone else's inbox **provided they identify themselves honestly** (`fromUid == auth.uid`) and aren't writing to their own. This is the lightest model that lets card-assignment and share-invite events propagate without server-side code. Recipient owns reads / mark-as-read / delete. **Must be re-published manually in Firebase Console — repo edits don't auto-deploy.**

### Architecture
- **`data/model/NotificationItem.kt`** — POJO + companion constants.
- **`data/NotificationsRepository.kt`** — `observeNotifications(uid)` flow, `markRead`, plus producers `notifyShare` / `notifyAssignment` / `notifyReminder`. Each producer pre-resolves `fromName` then writes the doc.
- **`notifications/NotificationsBridge.kt`** — `@Singleton`, started from `SlateApplication.onCreate`. Process-wide collector: `authRepository.currentUser.flatMapLatest { observeNotifications(it.uid) }`. For each unread doc whose `createdAt` is newer than the locally-persisted watermark (`SettingsRepository.lastNotifPostedAt`), posts a `NotificationCompat` to the `slate_share_assign` channel and advances the watermark. Also keeps an in-memory `postedThisProcess` set as a foreground dedupe.
- **`data/NotificationIntentBuffer.kt`** — singleton mirror of `ShareIntentBuffer`. Holds a `Target(resourceType, resourceId, secondaryId, notifId)` between `MainActivity` (captures intent extras `slate.notif.*` in both `onCreate` and `onNewIntent`) and `AuthedShell` (consumes after auth completes).
- **`ui/notifications/NotificationNavViewModel.kt`** — Hilt VM exposing `pending: StateFlow<Target?>` and `markRead(uid, notifId)`.
- **`MainActivity.kt`** — adds POST_NOTIFICATIONS runtime request on Android 13+; `notifIntent(context, n)` factory used by the bridge to build the `contentIntent`.
- **`ui/AuthedShell.kt`** — new `LaunchedEffect(pendingNotifTarget, user?.uid)` consumes the buffer, marks the notif read, then navigates: board → `BoardRoute(resourceId)`, note → `NoteRoute(resourceId)`, card → `BoardRoute(resourceId, openCardId=secondaryId)`.
- **`navigation/Routes.kt`** — `BoardRoute` gains optional `openCardId: String? = null`.
- **`BoardDetailScreen.kt` / `BoardDetailViewModel.kt`** — VM emits `initialOpenCardRequests` from `savedStateHandle.toRoute<BoardRoute>().openCardId`. Screen scans `cardsByColumn` (retries up to ~3s while cards load) and auto-opens the detail sheet for the matched card. Column isn't known at navigation time.

### Cold-start replay + dedupe
The bridge uses a two-layer dedupe so each notif fires exactly once:
1. **Persisted watermark** (`lastNotifPostedAt`, epoch ms in DataStore) — survives process death. On (re-)attach, the bridge skips any doc with `createdAt <= watermark`. After posting, advances the watermark to the newest `createdAt` seen.
2. **In-memory `postedThisProcess: MutableSet<String>`** — clears on sign-out; protects against the listener re-emitting the same doc within a single process (e.g. when an unread doc is then marked read locally and the snapshot fires again).

Acknowledged limitation: **when the app process is killed by Android, no notifications fire until the process is started again** (typically when the user opens Slate). The docs persist so nothing is lost, but the device won't beep at the moment the partner shared/assigned. Documented in the class kdoc.

### Manual reminder ("bell" on card sheet)
- `CardDetailSheet`: when `canPing` is true (card has ≥1 assignee who isn't the current user), a `NotificationsActive` `IconButton` sits in the title row, tinted `UrgencyUrgent` when armed and 40%-alpha onSurfaceVariant when in cooldown.
- 24h cooldown is **per-card, per-device** — `SettingsRepository.cardLastPingAtMap: Flow<Map<String, Long>>` backed by a JSON object in DataStore. Stamped on successful `pingAssignees`. Partner's device tracks her own cooldowns independently.
- Cooldown enforcement is purely client-side. The producer (`BoardRepository.pingAssignees`) writes one notif per non-self assignee, gated only by the rules. We accept that a determined user could clear app data to bypass; not worth a server-side path for two-user scale.
- UI toasts: `card_remind_sent_toast` on send, `card_remind_cooldown_toast` (with hours-remaining int arg) on disabled tap.

### Home tweaks shipped on the same branch
Tied to the notifications redesign so users have a coherent "what's urgent" surface:

- **Marked-as-urgent set now persists.** Was a `MutableStateFlow<Set<String>>` in `HomeViewModel` — lost whenever Home left the back stack. Now stored in DataStore (`home_marked_urgent_card_ids_json`, JSON array) and read via `SettingsRepository.markedUrgentCardIds` / `toggleMarkedUrgentCardId`.
- **Urgent task row visual refresh.** `UrgentTaskRow` now: clips with 12dp rounded corners; renders `UrgencyUrgentTint` background when marked (was just an icon swap); is clickable to open the card; bookmark icon swapped for `PriorityHigh` tinted `UrgencyUrgent` (was `BoardsAmber`). Strings reworded from "today" to "urgent" framing (`home_task_mark_today_cd` etc — string keys preserved to avoid touching call sites).
- **Tap urgent row → open card.** `HomeScreen` gets a new `onOpenUrgentCard(boardId, cardId)` callback wired through `AuthedShell` to `navController.navigate(BoardRoute(boardId, openCardId=cardId))`. Same `initialOpenCardRequests` path that notification taps use.

### Strings (new)
11 Hebrew strings: `notif_channel_name`, `notif_channel_description`, `notif_unknown_sender`, `notif_share_board_title`, `notif_share_note_title`, `notif_share_generic_title`, `notif_share_body`, `notif_assignment_title`, `notif_assignment_body`, `notif_reminder_title`, `notif_reminder_body`, `notif_generic_title`, `card_remind_cd`, `card_remind_sent_toast`, `card_remind_cooldown_toast`.

### Manifest
`<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` — Android 13+ runtime permission. Denial is silently respected; docs queue in the inbox regardless and the bridge skips `notify()` calls (logged at INFO).

### Files
**New:**
- `data/model/NotificationItem.kt`
- `data/NotificationsRepository.kt`
- `data/NotificationIntentBuffer.kt`
- `notifications/NotificationsBridge.kt`
- `ui/notifications/NotificationNavViewModel.kt`

**Modified:**
- `AndroidManifest.xml` (POST_NOTIFICATIONS)
- `MainActivity.kt` (permission request + intent capture + `notifIntent` factory)
- `SlateApplication.kt` (start the bridge)
- `data/BoardRepository.kt` (assignment notif + `pingAssignees`)
- `data/ShareRepository.kt` (Path A share notif)
- `data/SettingsRepository.kt` (3 new keys: `lastNotifPostedAt`, `markedUrgentCardIds`, `cardLastPingAtMap`)
- `navigation/Routes.kt` (`BoardRoute.openCardId`)
- `ui/AuthedShell.kt` (notif nav effect + urgent-card open callback)
- `ui/board/BoardDetailScreen.kt` (auto-open card by id + bell wiring)
- `ui/board/BoardDetailViewModel.kt` (`initialOpenCardRequests` + `pingAssignees` + `cardPingCooldowns`)
- `ui/board/components/CardDetailSheet.kt` (bell IconButton)
- `ui/home/HomeScreen.kt` (`onOpenUrgentCard` threading)
- `ui/home/HomeViewModel.kt` (persistent marked set)
- `ui/home/UrgentTaskRow.kt` (visual refresh + clickable)
- `res/values/strings.xml`
- `firestore.rules` (notifications subcollection block)

### Things to remember
- **Bot/system actions act as the current user** — when the AI assistant moves or assigns a card, it goes through `BoardRepository.setCardAssignees`, which means the assistant can legitimately trigger an assignment notif to a partner. This is intentional.
- **No retroactive notifs.** Anything that happened before the recipient's device first started the bridge (or before the watermark was bumped past it) won't fire. Acceptable because the inbox is the authoritative record — there's no UI yet that surfaces the list of unread `NotificationItem`s, but the data is there if we want to add one later.
- **Rules carve-out is permissive by design.** Any auth'd user can write to any other user's `notifications/` subcollection as long as `fromUid == self`. If we ever need to defend against an abusive third user (currently impossible — sharing is the only way to know someone's uid), tighten by requiring the recipient share a resource with the sender first.

---

# Desktop (web + Tauri shell)

Sections 32–34 describe the desktop platform. Sections 1–31 are the mobile reference; treat them as the canonical product spec. When desktop and mobile disagree, mobile wins unless a divergence is called out explicitly here.

---

## 32. Desktop platform overview

The desktop app is a single-page React 19 + TypeScript app served from Firebase Hosting today, with a Tauri 2 shell scaffolded for a future native bundle. Both surfaces share the same Firestore backend (`slate-b245a`) and the same security rules as the Android app — there is no separate desktop backend. The desktop client is intentionally thin: zero domain layer, all state managed via React hooks + Firestore `onSnapshot` listeners.

### Working environment

| Thing | Value |
|---|---|
| Project root | `D:\slate-webapp` |
| Stack | React 19, TypeScript 6, Vite 8, Firebase JS SDK 12 |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Native shell | Tauri 2 (`src-tauri/`, identifier `co.alternabe.slate.desktop`, window 1280×800 min 900×600) |
| Hosting | Firebase Hosting (`firebase.json` → `dist/`, SPA rewrite to `index.html`) |
| Dev server | `npm run dev` (Vite on :5173) |
| Build | `npm run build` → `tsc && vite build` |
| Deploy | `npm run deploy` (build + `firebase deploy --only hosting`) |
| Tauri | `npm run tauri dev` / `npm run tauri build` |
| Firebase config | Hardcoded in `src/firebase.ts` (web app `1:953528152029:web:8942cc162aec18901dd034`) — same Firestore as Android |

### Codebase layout

```
D:\slate-webapp\
├── package.json / vite.config.ts / tsconfig.json
├── firebase.json                  (Hosting config; SPA rewrites)
├── index.html
├── DESIGN_SYSTEM.md               (desktop "Desert Study" token reference)
├── project_overview_rampup.md     ← THIS FILE (mobile §1–31 + desktop §32–34)
├── public/                        (favicon.svg, icons.svg)
├── src-tauri/                     (Rust shell; default capabilities only — no custom commands)
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── src/{main.rs, lib.rs}
└── src/
    ├── App.tsx                    ← single-file root: nav rail, sidebar, all top-level screens (Home/Boards/Notes/Archive/Settings) and dialogs (CreateBoard/CreateNote/QuickAdd)
    ├── main.tsx                   (React 19 root)
    ├── firebase.ts                (app + auth + db + googleProvider)
    ├── theme.ts                   ("Desert Study" tokens — terracotta/sage/ochre; diverges from mobile palette, see §34)
    ├── seedDefaults.ts            (DEFAULT_COLUMNS + COLUMN_COLORS — mirrors mobile SeedDefaults.kt)
    ├── types.ts                   (Board, BoardColumn, Card, Subtask, Note, NoteItem, ShareLink, PendingInvite, User; `effectiveAssignees` helper)
    ├── index.css
    ├── assets/                    (hero.png, vite.svg, typescript.svg)
    ├── repositories/
    │   ├── boardRepository.ts     (largest file; observe* + mutations; subtasks via RMW; cross-board moves)
    │   ├── noteRepository.ts      (note CRUD; items RMW; reorderItems)
    │   ├── shareRepository.ts     (shareLinks + pendingInvites + shareByEmail Path A/B)
    │   └── userRepository.ts      (observeUser, getUser, findUserByEmail)
    ├── assistant/
    │   ├── assistantModels.ts     (action sealed type, capabilities, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DAILY_MESSAGE_CAP)
    │   ├── assistantApiClient.ts  (Gemini REST + parser)
    │   ├── assistantRepository.ts (context builder + planActions + execute*/undoAction)
    │   └── assistantSettings.ts   (localStorage-backed BYO key/model/prompt/caps/usage/privacyAck)
    └── components/
        ├── AssistantPanel.tsx     (left-side sheet; settings nested inside)
        ├── CardDetail.tsx         (modal: title, description, subtasks, assignees, linked notes)
        ├── ShareDialog.tsx        (email invite + share-link generator)
        ├── Menu.tsx               (3-dot popover)
        └── Toast.tsx              (host + `toast.success/error()` helpers)
```

### Files worth reading first
1. **`src/App.tsx`** — 1700+ lines, owns the entire navigation shell + Home/Archive/Settings/QuickAdd + BoardView/ColumnView/CardView + NoteView/ItemList. If you're touching layout, start here.
2. **`src/repositories/boardRepository.ts`** — `observe*` flows for boards/columns/cards, archived-card aggregator (mirrors Android nested flatMapLatest+combine), `observeUrgentCountsPerBoard`, `observeMyWeeklyCompletions`, subtask RMW, multi-assignee writes, cross-column + cross-board move via WriteBatch.
3. **`src/assistant/assistantRepository.ts`** — context builder, system-prompt assembly, `planActions` (Gemini call), execute branches for INSERT_CARD/INSERT_NOTE_ITEM/MOVE_CARD/LINK_NOTE_TO_CARD/etc, undo path.

### Firestore + rules
- **Same project** (`slate-b245a`), **same `firestore.rules`** as mobile. The rules file is owned by the Android repo (`D:\Slate\firestore.rules`); this desktop repo does NOT contain its own copy. Whenever rules change, they're published from the mobile repo's Console workflow, and desktop picks them up automatically.
- All schema fields the desktop reads/writes match the mobile data model in §8 — including new fields like `Card.assigneeIds`, `Card.subtasks`, `Card.linkedNoteIds`, `Card.completedAt`/`completedBy`. See `types.ts`.
- Email-based sharing (Path A `granted` / Path B `pending`) is fully wired via `shareByEmail` and `consumePendingInvitesFor`, which the App.tsx auth effect runs on every sign-in.

---

## 33. Mobile ↔ Desktop parity matrix

What's already on desktop vs what's missing. Use this together with §34 to scope work.

### Implemented on desktop ✅
- Google sign-in via Firebase Auth (`signInWithPopup`)
- **First-launch board seeding** — `seedDefaultsIfNeeded(uid)` transactional lock on `users/{uid}.seededAt`; creates 4 default boards (עבודה / אישי / פיננסי / בית) × 4 columns on every new user's first sign-in. `DEFAULT_BOARDS` lives in `src/seedDefaults.ts` alongside `DEFAULT_COLUMNS`. Wired into `App.tsx` auth `useEffect`.
- **`users/{uid}` profile upsert on every sign-in** — `upsertUserProfile(user)` in `userRepository.ts`. Writes `email` (lowercased) + `displayName` + `photoUrl` via `setDoc({merge: true})`. Other users can now `findUserByEmail` this account, so email shares to a registered user go Path A `granted` directly.
- Boards list, columns, cards (Kanban) with real-time `onSnapshot`
- Notes (3 types: checklist / bullets / free_text)
- Global archive screen with 2 inner tabs (tasks across all boards + whole notes)
- Per-board accent colour + first-column dot + urgent-column "דחוף" badge
- Subtasks (inline array on `Card.subtasks` via read-modify-write)
- Linked notes on cards (`Card.linkedNoteIds` add/remove + `notesNotLinked` picker + "פתק לא זמין" fallback for deleted notes)
- Multi-assignee per card (`Card.assigneeIds: string[]` — picker is chip toggle; legacy `assigneeId` still written for compatibility)
- Creator/assignee gating in `CardDetail` (read-only fields + hidden delete/irrelevant footer when `canEdit` is false)
- Card status transitions: complete / irrelevant / restore with `completedAt`/`completedBy` stamping
- Drag-and-drop cards (within-column reorder + cross-column move) via `@dnd-kit`
- Drag-to-reorder note items (active items only)
- Sharing: email invite (Path A `granted` / Path B `pendingInvites`) + share-link generator (`?invite=<linkId>`)
- `consumePendingInvitesFor` runs on every sign-in
- **Share dialog: email autocomplete history** — `slate.share.emailHistory` MRU in `localStorage` (cap 20, deduped case-insensitively); rendered via `<datalist>` on the email field.
- Quick Add dialog (pick board + column, create card)
- Manually designate any column as the urgent one (column 3-dot menu → "סמן כעמודה דחופה")
- Move column up/down via 3-dot menu (no drag — same as mobile §11.2)
- Home dashboard: weekly-completed badge + total urgent + per-board tile breakdown
- **Urgent Task Rows on Home** — collapsible "משימות דחופות" section listing the actual cards in each board's urgent column. Click row → opens the card detail directly (uses URL routing). `observeUrgentCardsPerBoard(uid, cb)` repo method emits `Map<boardId, UrgentCard[]>`; same fan-out pattern as `observeUrgentCountsPerBoard`. Collapse state persisted to `localStorage` (`slate.home.urgentSectionOpen`).
- **Persisted "marked as urgent" set, Firestore-backed cross-device** — `users/{uid}.markedUrgentCardIds: string[]`. `observeMarkedUrgentCardIds` + `setCardMarkedUrgent` (arrayUnion / arrayRemove) in `userRepository.ts`. `useMarkedUrgent(uid)` hook returns the live set. **Mobile still writes to DataStore (per-device); Android needs a parallel migration to sync across platforms.**
- **Assignee Google avatars on Kanban cards** — `Avatar` + `AvatarStack` components in `src/components/Avatar.tsx`. Renders `User.photoUrl` when present; colored initial chip with hue derived from `hashCode(uid) % 360` otherwise. Stack shows first 3 + `+N` overflow chip. BoardView hydrates `memberProfiles: Map<uid, User>` from each member's `users/{uid}` doc and threads it through to `CardView`.
- **URL routing with `?card=` deep-link** — minimal hash router in `src/router.ts` (no new dep). URL shapes: `#/home`, `#/boards/<bid>`, `#/boards/<bid>?card=<cid>`, `#/notes/<nid>`, `#/archive`, `#/settings`. Refreshing the page preserves selection. `replaceRoute` clears `?card=` once the deep-link is consumed. `CardView.forceOpen` opens the modal when the URL matches its card id.
- **Dark mode** — three-mode selector in Settings ("מערכת" / "בהיר" / "כהה") persisted to `localStorage` (`slate.themeMode`). `ThemeProvider` in `src/theme.ts` writes `data-theme="dark"` to `<html>` at runtime, driving CSS variables defined in `index.css`. `useTheme()` hook returns the active variant. System mode follows `prefers-color-scheme` and reacts to OS changes.
- Cross-board card moves (`moveCardBetweenBoards`) used by the assistant
- AI Smart Assistant (left-side panel): planActions via Gemini, capability toggles, INSERT_CARD/INSERT_NOTE_ITEM/APPEND_NOTE_TEXT/MOVE_CARD/LINK_NOTE_TO_CARD/SHOW_STATUS/PROPOSE_NEW_*/ASK_CLARIFICATION, 30-second undo, BYO API key (localStorage), daily-cap enforcement
- Assistant privacy disclosure (lightweight one-shot status bubble in chat)
- Toast host with `toast.success/error/()` helpers
- **Linear-minimal design overhaul** — see §35 for the full token / typography / surface rewrite.

### Missing on desktop ❌ (numbered to match §34 work items)
1. **In-app notifications system** (mobile §31) — `users/{uid}/notifications/{notifId}` listener, NotificationsBridge equivalent, share/assignment/reminder producers, browser `Notification` API integration.
2. **Card reminder ("bell") with 24h cooldown** (mobile §31) — no `pingAssignees` repository method, no bell UI on `CardDetail`. Depends on #1 plumbing.
3. **Reminder cooldown DataStore equivalent** — depends on #2; mirror of mobile `cardLastPingAtMap` in `localStorage`.
4. **Assistant: persistent chat history** (mobile §26) — desktop assistant is in-memory only; closing the panel wipes the thread.
5. **Assistant: system-prompt editor UI** (mobile §19 `AssistantPromptScreen`) — `assistantSettings.getPrompt/setPrompt` exist in code but no UI.
6. **Assistant: usage counter visible to user** (mobile §19) — `getUsageToday` exists but isn't displayed anywhere.
7. **Assistant: retired-model auto-upgrade** (mobile §27) — no `RETIRED_MODELS` guard; stale `gemini-1.5-flash` values would 404.
8. **Assistant: dynamic greeting listing enabled capabilities** (mobile §19) — desktop greeting is static.
9. **Assistant prompt rule for empty-urgent boards** (mobile §28) — `DEFAULT_SYSTEM_PROMPT` should skip boards with zero urgent / return "אין משימות דחופות" if none.
10. **Mobile §25 checklist UX details** — desktop checklist already supports drag-to-reorder and empty-commit-deletes, but does NOT: (a) partition done items to the bottom with a 24dp gap, (b) auto-place the "+ הוסף פריט" row above the done section. Active and done items render in original order.
11. **Tauri native integration** — Tauri shell builds but has zero custom commands, no system-tray, no native OS notifications, no auto-update channel.
12. **Android-side migration of `markedUrgentCardIds` → Firestore.** Today mobile writes to DataStore; until it also reads/writes `users/{uid}.markedUrgentCardIds`, marks made on mobile don't appear on desktop and vice-versa. Desktop side is already on Firestore.
13. **Component-level theme migration for legacy `t` importers** — `ShareDialog.tsx`, `AssistantPanel.tsx`, and `CardDetail.tsx` import the static `t` object instead of using `useTheme()`. They now look correct in light mode and roughly-correct in dark (CSS variables drive the borders / surfaces in most spots), but a clean pass would swap them to the hook so brand-accent calls track the active theme tier.

### Differences-by-design (not gaps)
- **Per-board pinch+button zoom** (mobile §7.4) — N/A on desktop; browser zoom handles it.
- **Home-screen widget** (mobile §30 Glance 4×2) — no analogous surface yet on desktop (could become a Tauri tray widget or PWA notification, but that's a separate product call).
- **System-bar inset fix** (mobile §7.0) — N/A on desktop.
- **Android POST_NOTIFICATIONS runtime permission** (mobile §31) — replaced by the browser `Notification.requestPermission()` API if/when #4 ships.

### Design-system divergence (called out, not "missing")
- Mobile DESIGN.md palette uses **BoardsAmber** + **NotesTeal** + urgency tokens (`UrgencyUrgent/Planned/Backlog/Waiting`) + Heebo/Inter typography.
- Desktop `theme.ts` ("Desert Study") uses **terracotta primary** + **sage secondary** + **ochre tertiary** + cream surfaces — a related but distinct system. `DESIGN_SYSTEM.md` in this repo is the canonical desktop reference.
- The seeded column colours match mobile (`URGENT/PLANNED/BACKLOG/WAITING` hex values are identical in `seedDefaults.ts`).
- Treat as deliberate divergence today. If we want one shared palette, that's a Pass-5 design call (see §34 #21 below).

---

## 34. Desktop gap-list (remaining work)

Numbered to match §33. Items above the line block functionality; below the line are polish.

### Tier 1 — notifications + reminder (the next big push)
1. **Notifications system end-to-end** (mobile §31).
   - Add `NotificationItem` type, `notificationsRepository.ts` (`observeNotifications` + `notifyShare` / `notifyAssignment` / `notifyReminder` producers), and a process-wide listener started from `App.tsx` once the user is known.
   - Producers fire from `shareByEmail` Path A, `setCardAssignees` (for each new uid), and a new `pingAssignees` (see #2).
   - Surface in-app via a toast or unread badge; optionally browser `Notification.requestPermission()` for OS-level pops.
   - Rules block exists on mobile; no rules change needed (Android already published it).
2. **Card reminder bell + cooldown** (mobile §31).
   - Repo: `pingAssignees(boardId, columnId, cardId, currentUid)` — fan-out to each non-self assignee.
   - UI: bell button on `CardDetail` header; tinted by cooldown state.
   - `localStorage` JSON map keyed by cardId → last-ping ms (mirror of mobile `cardLastPingAtMap`). This is item #3 from §33.

### Tier 2 — assistant polish
4. **Persistent chat history** (mobile §26) — encode `bubbles` + `conversation` to JSON, persist under `slate.assistant.history` in `localStorage`, hydrate on open, exclude transient bubbles.
5. **System-prompt editor UI** (mobile §19) — textarea section in `AssistantSettings` that reads `assistantSettings.getPrompt()` and writes `setPrompt()`. Setter already exists.
6. **Usage counter display** — show "X/100 הודעות היום" using `getUsageToday()` and `DAILY_MESSAGE_CAP`.
7. **Retired-model guard** (mobile §27) — `RETIRED_MODELS` set in `assistantSettings.getModel()` that auto-upgrades stored `gemini-1.5-flash*` / `gemini-1.5-pro` to `DEFAULT_MODEL`.
8. **Dynamic greeting** listing active capability labels from `CAP_LABELS`.
9. **Prompt rule for empty-urgent boards** (mobile §28) — append to `DEFAULT_SYSTEM_PROMPT`.

### Tier 3 — UX / polish
10. **Checklist done-items partitioning** (mobile §25) — partition done items to the bottom with a 24dp gap; move "+ הוסף פריט" above the done section.
11. **Tauri native integrations** — system tray, OS notifications (different code path from in-app), single-instance lock, auto-update channel. Defer until web app is at full parity.
12. **Android-side migration of `markedUrgentCardIds` → Firestore** so marks sync cross-platform. Desktop already writes to `users/{uid}.markedUrgentCardIds`; the Android `SettingsRepository.markedUrgentCardIds` needs to switch from DataStore to a Firestore listener on the same field, with `arrayUnion`/`arrayRemove` on toggle. The Firestore rules already permit user-self-write to `users/{uid}`, so no rules change.
13. **Component-level theme migration** — `ShareDialog.tsx`, `AssistantPanel.tsx`, `CardDetail.tsx` import the static `t` object instead of `useTheme()`. The CSS-variable layer keeps them close-to-correct in dark mode, but a clean sweep would swap the imports.

### How to verify after each change
Desktop has no test suite. The verification loop is:
1. `npm run dev`, open `http://localhost:5173`, sign in.
2. Use the feature on a real board (`eladedi11391@gmail.com` is the test data account).
3. Cross-check the Firestore Console for the schema fields written.
4. If the change interacts with mobile (shared schema), launch the Android emulator from `D:\Slate` and confirm the change still renders correctly there.

### Out of scope for the next pass
- No backend / Cloud Functions work (Spark plan constraint still applies).
- No Firestore schema changes — every gap item above either reuses existing fields or adds purely client-side state.
- No new dependencies unless explicitly approved (current list: `firebase`, `react`, `@dnd-kit/*`).

---

## 35. Desktop design overhaul — Linear-minimal (2026-06-12)

A focused front-end pass to retire the warm-cream "Desert Study" identity in favour of a Linear-style minimal aesthetic: restrained color, generous whitespace, hairline borders, near-neutral surfaces. Brand accent (terracotta) is preserved but applied sparingly — focus rings, selected nav, primary CTAs only, never as a background fill.

**Direction confirmed with user:** Modern minimal (Linear-style). Defaults accepted: drop the serif heading family, keep terracotta as the single brand accent, use per-board user colours as small dots only (no left-edge stripes on cards).

### Token layer (the foundation)
- **`src/index.css`** — rewrote the `:root` and `html[data-theme="dark"]` CSS-variable blocks. Light is paper-white (`#fafaf9`) + neutral stone grays (`#f5f5f4` / `#ebe9e7` / `#e7e5e4`) + warm-brown-free text (`#1c1917` / `#44403c` / `#78716c`). Dark is near-pure black (`#0a0a0a`) + neutral charcoal surfaces (`#171717` / `#1f1f1f` / `#262626`). Added `--outline-strong` for hover/selected states; added `--selected-strong`, `--focus-ring`, `--shadow-popover`, `--shadow-modal`. Status colors are Tailwind-style (rose-600 `#dc2626`, emerald-700 `#15803d`).
- **`src/theme.ts`** — `lightTokens` + `darkTokens` were re-keyed to the same neutral palette so components that still import the static `t` object inherit the new look. `fontSerif` now points at the sans stack (no longer Noto Serif Hebrew) so legacy callers stop fragmenting type.
- Typography: sans-only (Inter + Heebo); headings semibold (600), not bold; tighter letter-spacing (`-0.015em`); body line-height `1.55`; `font-feature-settings: "cv02","cv03","cv04","cv11"` for Inter's alternate glyphs.

### Surface-level rewrites
- **Nav rail (`App.tsx` + `src/components/Icons.tsx`)** — replaced unicode glyphs (⌂, ▦, ✎, ⌫, ⚙) with inline Lucide-style SVG line-icons in a new `Icon` component (`home`, `kanban`, `note`, `archive`, `settings`, `plus`, `sparkles`). Width 76px, pill-shaped active background (no border stripe), hover state, accent treatment for the assistant button.
- **Sidebar (boards/notes list)** — rows are now pill-shaped (8px radius, 8px side margin). Selected row uses neutral `--selected-strong` (was warm cream / sage). Color dots represent board accent; truncation via `text-overflow: ellipsis`.
- **Home (`HomeScreen`)** — dropped the giant `urgentHero` card. New layout:
  - Greeting at 22px semibold with a subtler weekly badge (small outlined pill, hidden when count=0).
  - Empty-state message ("אין משימות דחופות כרגע 🎉") when no urgent items.
  - Urgent-tasks section is a single bordered card with hairline dividers between rows; collapsible via chevron with per-device persistence (`slate.home.urgentSectionOpen`).
  - "לפי לוח" tile grid: tiles are now clickable buttons (deep-link to board), tabular-nums on the count, neutral surface, no colored left-stripe.
- **Boards (Kanban)** — column container is **transparent** (no warm cream fill). Column header is a single row: dot + name + count + optional urgency badge + 3-dot menu. Cards default to flat (`box-shadow: none`); border strengthens on hover (`var(--outline-strong)`). Done/move buttons hide until hover so cards read cleanly; description clamped to 2 lines via `WebkitLineClamp`.
- **Card detail modal (`CardDetail.tsx`)** — borderless title input (focus reveals), description sits on a subtle `surface-low` field, section labels are 12px medium-weight (no caps), chips are full-pill 999-radius, ghost footer buttons. Delete is text-style danger (red `var(--error)`, not a red fill).
- **Top-of-card affordances** — subtask pill is a thin outline chip with `font-variant-numeric: tabular-nums`. Assignee avatar stack overflow `+N` chip uses neutral tokens (was warm cream).
- **Add Card / Add Column** — retired dashed borders. Add Card is a flat text affordance inside the column; Add Column is a subtle bordered button.
- **Buttons** — `primaryBtn` and `ghostBtn` standardized to 6px radius, smaller padding, removed inset shadows / inset highlights. Type chips in dialogs use an inverted dark-on-light selected state.

### Shorthand/longhand cleanup
React warned about mixing shorthand (`border`, `borderInlineStart`) with longhand overrides (`borderColor`, `borderInlineStartColor`). Fixed three callsites:
- `tileCard` → expanded to four side-specific borders (`borderBlockStart`/`End`, `borderInlineEnd`, plus longhand `borderInlineStartWidth`/`Style`/`Color`). Then the design rewrite removed the colored stripe entirely (tiles are uniform now), but the longhand pattern stays for safety.
- `railBtnActive` → uses the shorthand `borderInlineStart: "2px solid var(--primary)"`, matching `railBtn`. (Then the design rewrite dropped the stripe in favour of a pill background — so this is moot but kept the fix for the wider lesson.)
- `typeChipActive` → swapped `borderColor` for the full `border` shorthand.

### `effectiveAssignees` null-safety
Old cards lacking the `assigneeIds` array crashed `CardView`. Added a guard: `if (card.assigneeIds && card.assigneeIds.length > 0) return card.assigneeIds`. Mirrors the same defensive read already in `CardDetail.tsx`.

### Files touched in this pass
**Rewritten**
- `src/index.css` (CSS variables + typography)
- `src/theme.ts` (light + dark token objects)

**New**
- `src/components/Icons.tsx` (inline SVG line-icon set)

**Heavy edits**
- `src/App.tsx` — every style constant in the bottom block; `HomeScreen` body; `UrgentTaskRow`; `BoardView` toolbar; `ColumnView` header + card list; `CardView` body + hover-reveal action stack; nav rail render + new `NavRailButton` component; sidebar row treatment.
- `src/components/CardDetail.tsx` — every style constant; header label restyle.
- `src/components/Avatar.tsx` — overflow chip + photo chip use neutral tokens.

**No changes needed**
- `src/components/ShareDialog.tsx`, `src/components/AssistantPanel.tsx` — these import the static `t` object and inherit the refreshed token values. They look light-mode-correct and roughly-correct in dark; flagged as §34 #13 follow-up to swap them to `useTheme()` for full per-mode polish.

### Sidebar list redesign (2026-06-13 follow-up)
- Boards-list and notes-list sidebars rebuilt around a shared `SidebarHeader` + `SidebarRow` pair (`App.tsx`).
- Sticky header at top: section title (`13px / weight 600`), tabular muted count, hover-revealed `+` icon button (uses `Icon name="plus"`). Retired the bottom "+ לוח חדש" / "+ פתק חדש" text button.
- Rows: hover state (`var(--selected)`) distinct from selected (`var(--selected-strong)` + medium weight name). 3-dot menu fades in on hover or when the row is selected, keeping resting rows clean.
- Empty state ("אין עדיין לוחות" / "אין עדיין פתקים") when the list is empty.
- `Menu.tsx` aligned in the same pass — tokens for surface / border / shadow / text, destructive items use `var(--error)`. Popover uses `--shadow-popover`.

### Design work remaining (next pass)

The Linear-minimal pass intentionally scoped itself to the three highest-traffic surfaces: **Home, Boards (Kanban), and CardDetail** — plus the sidebar lists and Menu added in the follow-up above. Everything else inherits the new token layer and reads roughly-correct, but hasn't been *deliberately* redesigned. Punch list, in suggested order:

**Screens not yet structurally redesigned**
1. **NoteView (`App.tsx` → `NoteView` / `FreeTextEditor` / `ItemList` / `SortableNoteItem`).** Currently uses the shared `addInputStyle` / `itemRow` / `textareaStyle` constants. Works, but the active-vs-done partition from mobile §25 isn't here yet (also listed as §34 #10). The note title rendering could match CardDetail's borderless-until-focus pattern.
2. **ArchiveScreen.** Inner tabs already use the refreshed treatment; archive rows could move to the same single-bordered-card-with-hairline-dividers list pattern used by `UrgentTaskRow` on Home for visual consistency.
3. **SettingsScreen.** The appearance section (theme chips) is fine, but the account/about cards still feel like generic surfaces. Worth a Linear-style profile-row treatment with subtle dividers between sections.
4. **Login screen (`App.tsx` unauthenticated branch).** Hardcoded "Slate Desktop" title + "התחבר עם Google" button. Centered card layout is acceptable but unbranded. Wants a more confident lockup (mark + tagline + button hierarchy).
5. **CreateBoardDialog / CreateNoteDialog / QuickAddDialog.** They pick up the new `dialogPanel` / `dialogInput` / `typeChip` styles already, but the layout patterns (chip rows for type selection, etc.) deserve a deliberate look — especially the QuickAdd dialog which is the fastest-to-use surface.

**Components not yet restyled**
6. **`ShareDialog.tsx`.** Imports the static `t` object (so it inherits new color values but uses old radii + paddings). Visual structure (role chip row, link copy block) is sound; a refresh would tighten field padding, swap chip radii to match elsewhere, and update the link copy block.
7. **`AssistantPanel.tsx`.** Same `t`-import situation as ShareDialog, but more visible — the left-side sheet is a big surface. Bubbles, proposal cards, the input row, and the settings sub-screen all read "v1" against the new Linear aesthetic.
8. ~~**`Menu.tsx`** (3-dot popover used on board rows, note rows, columns, etc.).~~ **Done 2026-06-13** — swapped hardcoded warm hex for tokens, destructive items use `var(--error)`, popover uses `--shadow-popover`, dark-mode-correct.
9. **`Toast.tsx`** (success/error host). Inherits via the toast component's own inline styles. If the host hardcodes warm cream / brown hex, swap to neutral tokens.

**Architectural cleanups**
10. **Migrate `ShareDialog` + `AssistantPanel` + `CardDetail` from `import { t }` → `useTheme()`.** Same item as §34 #13. The static `t` export now points at the light-mode tokens; in dark mode they get *roughly* correct rendering via CSS variables, but per-mode polish (subtle shadows, borders strength) won't flow cleanly until they read the active variant.
11. **Drop the obsolete "Desert Study" naming.** The phrase still appears in `DESIGN_SYSTEM.md`, the `theme.ts` legacy `t` comment, and the Settings appearance helper text ("ערכת 'Desert Study'…"). Either rebrand the desktop identity (and update the doc) or just drop the name in favor of "Linear-minimal" (or no name at all).
12. **Rewrite `DESIGN_SYSTEM.md`** to match the new tokens. It currently describes the warm-cream palette and serif heading family. Until it's rewritten, `src/theme.ts` + `src/index.css` are the only source of truth for desktop tokens.

**Smaller polish items observed during the pass**
13. **Focus rings.** Defined `--focus-ring` in `index.css` and stripped the default browser outlines, but no element actually consumes the new ring yet. Pick a small set (buttons, inputs, the nav rail) and add `:focus-visible { box-shadow: var(--focus-ring); }` so keyboard navigation is visible without being noisy.
14. **Empty states across the app.** Home now has a friendly empty state for urgent tasks. Boards-without-cards, archive-empty, no-notes-yet could get the same treatment — a centered short message plus a primary action.
15. **Loading skeletons.** Currently every screen pops from blank → loaded with no transition. Linear-style would use thin shimmer skeletons or a stable "loading…" line.
16. **Per-board color usage.** The user's chosen board color now renders only as a small dot (sidebar, urgent row, tile, column header). If you want any more presence — e.g. as a border accent in the board toolbar or as a tint on the column count badge — that would be a deliberate next step.

