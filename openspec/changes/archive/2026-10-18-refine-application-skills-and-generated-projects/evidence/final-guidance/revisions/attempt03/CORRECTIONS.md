# Parent browser correction after actual execution

The frontend production build passed with one worker. The browser reached the real backend greeting and the intentional backend-failure state, then its unscoped alert locator matched both the application's error and Next's built-in route announcer. This is a test locator failure, not a passing browser result or an application error-state defect.

The parent scoped that existing assertion to the labelled Greeting region. No application source, expected response or runtime policy changed. The original assertion, full failure log, screenshot and error context are retained here. A complete browser rerun is still required; success is not asserted by this correction.
