# Compatible list filter backport

Target: ios preview; native runtime 1.1.10; live base 7961bd894867db0bef02493d10bba78376c99ff6.

Backports the accepted outside-map list category/time-count correction and content-sized Events time chips, preserving this target's native configuration, dependencies, Firebase environment and existing app features. The newer Upcoming date choices receive the list source where this target already supports them; no new native date UI is added.

Actual parent filter JSX/styles and category component were rendered with fixture counts for 106 outside-map events, selected categories, narrow width and Specials. Independently reviewed the large-count and Specials renders. Renderer limitations: RN Web, mocked store snapshot, fixture card placeholder; canonical pure count fixture calculation. Target-native interaction/device adoption is not verified. The target's actual store count methods are covered by four focused regression tests.
