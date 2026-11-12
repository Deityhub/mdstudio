// When a sync round asks the cloud for changes. While the real-time channel is up, other devices'
// changes arrive by themselves, so a round only pushes. A pull happens when it is the only way to
// learn what happened: the first time, without a live connection (the old polling and nudges), once
// when the connection comes up (to catch what happened before it was ready), and when something
// said so: a draft too big to send over the channel, or one that had to wait for unsaved edits.
export function createPullPolicy() {
  let connected = false;
  let owed = true;
  return {
    setConnected(next: boolean) {
      connected = next;
      owed = true; // up: catch up on what came before; down: the next round is a poll anyway
    },
    /** The next round must pull, whatever the connection (a hint, or a draft that had to wait). */
    owePull() {
      owed = true;
    },
    /** Asked by each round as it starts; settles what was owed. */
    nextRoundPulls() {
      const pull = owed || !connected;
      owed = false;
      return pull;
    },
    /**
     * Whether coming back to the tab (`focus`) or the network (`online`) is worth a round. A live
     * connection kept receiving while the tab was away, so focus needs nothing; coming online is
     * always worth one (it pushes what was written offline, and pulls if the socket is not live).
     */
    nudgeWorthIt(kind: "focus" | "online") {
      return kind === "online" || !connected;
    },
  };
}
