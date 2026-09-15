'use strict';
/* Section 4: XBOX SERVICES. Per-service rows (the bundle lives on as
 * svc-xbox-off in Debloat). Every row auto-checks for the Xbox app via Appx:
 * if the app that needs these services is installed, the row SKIPS with an
 * explanation instead of breaking gaming. */
const S = (n, label) => ({ n, label });
const XBOX_WARN = 'Only proceed if you never use Xbox app games.';

const ITEMS = [
  {
    id: 'svc-xbox-auth', t: 'Disable Xbox Live Auth Manager', badge: 'caution', impact: 2,
    d: 'Only if you never use Xbox app games.', xboxCheck: true, warn: XBOX_WARN,
    services: [S('XblAuthManager', 'Xbox Live Auth Manager')],
  },
  {
    id: 'svc-xbox-save', t: 'Disable Xbox Live Game Save', badge: 'caution', impact: 2,
    d: 'Only if you never use Xbox app games.', xboxCheck: true, warn: XBOX_WARN,
    services: [S('XblGameSave', 'Xbox Live Game Save')],
  },
  {
    id: 'svc-xbox-net', t: 'Disable Xbox Live Networking', badge: 'caution', impact: 2,
    d: 'Only if you never use Xbox app games.', xboxCheck: true, warn: XBOX_WARN,
    services: [S('XboxNetApiSvc', 'Xbox Live Networking')],
  },
];

module.exports = { ITEMS };
