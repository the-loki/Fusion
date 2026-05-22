---
"@fusion/dashboard": patch
---

fix(dashboard): stop ChatView's body scroll-lock from instantly dismissing the Android soft keyboard

The body scroll-lock applied while the keyboard is open in main chat was an iOS-specific workaround for visualViewport drift. On Android Chrome it does the opposite of what we want — mutating `body { position: fixed; ... }` while the keyboard is opening causes Chrome to treat it as a focus-target relayout and immediately dismisses the keyboard, making the main chat composer unusable on Android.

`useMobileScrollLock` is now gated to iOS UAs. Android Chrome doesn't need it (with `interactive-widget=resizes-content` the layout viewport shrinks with the keyboard, so no drift compensation is required).
