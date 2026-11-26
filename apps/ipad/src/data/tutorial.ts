/**
 * The "How to use SkillsLab" walkthrough: shown once on first launch, and
 * again whenever someone taps the help button.
 */

export type TutorialArt = "welcome" | "find" | "skill" | "video" | "storyboard" | "practice" | "documents" | "updates";

export interface TutorialSlide {
  id: TutorialArt;
  eyebrow: string;
  title: string;
  body: string;
  tips: string[];
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    id: "welcome",
    eyebrow: "Welcome",
    title: "Clinical skills, ready offline",
    body: "SkillsLab holds the videos, step-by-step storyboards and guides for each clinical skill. Everything is stored on this iPad, so it works without Wi-Fi.",
    tips: [
      "This short tour shows the main features.",
      "Open it again at any time with the ? button.",
    ],
  },
  {
    id: "find",
    eyebrow: "Library",
    title: "Find a skill",
    body: "Search by skill, procedure or category, or browse by group.",
    tips: [
      "Turn the iPad sideways for the library sidebar of groups and categories.",
      "Held upright, use the filter chips above the skills.",
      "Tap any skill card to open it.",
    ],
  },
  {
    id: "skill",
    eyebrow: "Skill page",
    title: "Start with the key points",
    body: "Each skill opens on its key points: indications, cautions, equipment, red flags and common errors. Red flags are shown in red.",
    tips: [
      "The contents list (or the tabs, held upright) switches between key points, videos, storyboards and documents.",
      "Tap Skills, top left, to go back to the library.",
    ],
  },
  {
    id: "video",
    eyebrow: "Videos",
    title: "Watch, slow down, repeat",
    body: "The controls under each video are made for learning a technique.",
    tips: [
      "0.5× and 0.75× slow the video down.",
      "Back 5 s replays the moment you just missed.",
      "Loop: tap at the start of a movement and again at its end to repeat that part. Tap once more to stop.",
      "Chapters jump straight to each step.",
    ],
  },
  {
    id: "storyboard",
    eyebrow: "Storyboards",
    title: "Step through the procedure",
    body: "Storyboards show a skill as a series of photos, each with a caption.",
    tips: [
      "Swipe, or use the arrow buttons, to move between steps.",
      "Tap a segment of the progress bar to jump to that step.",
    ],
  },
  {
    id: "practice",
    eyebrow: "Practice mode",
    title: "Practise with a checklist",
    body: "Tap Practise under a storyboard to turn its steps into a checklist while you perform the skill.",
    tips: [
      "Gather the equipment listed at the top first.",
      "Tick each step as you do it. The timer starts on the first tick and stops on the last.",
      "Turn Pictures off to test yourself from the captions alone.",
      "Reset clears the ticks and the timer for the next student.",
    ],
  },
  {
    id: "documents",
    eyebrow: "Guides and images",
    title: "Zoom in on the detail",
    body: "PDF guides and images open in the app.",
    tips: [
      "Pinch, or double-tap, to zoom in.",
      "Full screen gives a document or image the whole display.",
    ],
  },
  {
    id: "updates",
    eyebrow: "Staying up to date",
    title: "New content, when it’s ready",
    body: "Staff publish content updates from the SkillsLab server. The iPad checks for them quietly, and a tutor installs them.",
    tips: [
      "After an update, a What’s new card on the home screen lists the skills that changed.",
      "Settings and updates are for staff, and may be protected by a PIN.",
    ],
  },
];

const SEEN_KEY = "skillslab_tutorial_seen";
/** Bump to show the tour again to everyone after it changes substantially. */
export const TUTORIAL_VERSION = "1";

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === TUTORIAL_VERSION;
  } catch {
    // Without storage, don't show it on every launch.
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, TUTORIAL_VERSION);
  } catch {
    // Storage unavailable.
  }
}
