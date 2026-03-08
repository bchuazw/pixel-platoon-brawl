## Suggested Improvements for a Spectator-Focused Battle Royale

Here's what I'd recommend adding, grouped by impact:

---

### 2. Live Commentator / Event Ticker (High Impact, Medium Effort)

Replace or enhance the monospace log with a styled "broadcast commentator" overlay — large cinematic text that appears center-screen for key moments:

- "FIRST BLOOD!" on first kill
- "DOUBLE KILL!" if a unit gets 2 kills in one turn
- "LAST STAND!" when a team is down to 1 unit
- "ZONE CLOSING!" with dramatic overlay
- Round announcements with team standings

**Changes:** New `BroadcastOverlay` component, track milestones in `useGameStore`, add announcement queue with timed display.

---

### 4. Camera Auto-Follow Active Unit (Medium Impact, Low Effort)

During auto-play, smoothly pan the camera to follow whoever is currently acting. Right now the camera stays static and you can miss action happening off-screen.

**Changes:** Pass `selectedUnitId` position to a new `AutoFollowCamera` component inside the Canvas that lerps the OrbitControls target.

---

### 5. Betting / Prediction System (High Impact, Medium Effort)

Let spectators "bet" their sponsor points on which team will win before the battle starts. Correct predictions multiply points. This gives spectators a stake in the outcome.

**Changes:** Pre-game team selection UI, payout calculation on game over, integrate with existing sponsor points system.

---

