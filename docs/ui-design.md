# NAL visual system

The interface uses deep evergreen for primary actions, warm neutral page backgrounds, white content surfaces and charcoal text. Inter is the UI face; Space Grotesk supplies restrained headings. Numbers in tables, charts and key metrics use tabular figures. Gold is a supporting brand accent, not a financial status signal.

Public pages lead with the purpose and primary action. The mobile public navigation uses the existing Radix Sheet for focus trapping, Escape dismissal and close-on-navigation. Login preserves its existing validation and authenticated-profile flow, with current-password autocomplete and an accessible visibility toggle. Help retains localized topic content and saved reading progress.

Shared page headers, cards, controls and tables support all role portals. Mobile table cards retain field labels; desktop tables can scroll rather than clip columns. The existing approval, audit, identity and financial logic is unchanged. Printed agreements and financial statements retain their existing formatting. No fabricated chart data is introduced.

Keyboard users can skip to content. Focus remains visible, status borders retain their meaning, and reduced-motion preferences suppress decorative transitions. Main content retains the existing bottom-navigation clearance on mobile.

Validate with `npm run verify` and guarded `npm run test:acceptance`. The premium UI tests cover mobile menu re-entry and Escape, hero priority, keyboard navigation, reduced motion, light/dark login validation and password visibility. Authenticated fixtures inspect dashboard, user and report layouts at 390px and 1280px without exercising production transactions. Production account-specific acceptance still requires authorized sign-in.

Motion uses one decelerating curve, 220ms menus/dialogs, 320ms sheets and faster exits. Page navigation animates the title only, without remounting forms or delaying routing. Tab titles ease into place while numbers remain static. Landing sections reveal once on viewport entry with 18px travel, 700ms duration and a maximum 160ms stagger. Content stays visible in server HTML and without JavaScript. Keyboard entry, reduced motion, page lifecycle changes and printing cancel presentation animations.

Charts reveal their final SVG series from left to right over 900ms with gentle acceleration and deceleration, once per mounted chart. Recharts value interpolation is disabled: axes, tooltips, totals and final data are accurate throughout, and snapshot updates do not restart the reveal. Dashboard loading, empty and error states reserve the same height.
