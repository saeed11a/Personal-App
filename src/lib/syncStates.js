// The three synchronization states, in one place so the indicator and the panel
// never disagree about what green, amber and red mean.
//
//   live    — backend verified AND every eligible local change confirmed uploaded,
//             nothing failed, nothing waiting.
//   syncing — an upload, download or reconciliation is running right now.
//   offline — backend unreachable, or work still waiting, or an upload failed.
export const SYNC_STATES = {
  live: {
    label: "LIVE",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    hint: "Synced",
  },
  syncing: {
    label: "SYNCING",
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-600 dark:text-amber-400",
    hint: "Synchronising",
  },
  offline: {
    label: "OFFLINE",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    hint: "Not synced",
  },
};
