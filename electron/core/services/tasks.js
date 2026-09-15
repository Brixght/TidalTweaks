'use strict';
/* Section 5: SCHEDULED TASKS (Safe for everyone). One id per task so each
 * carries its own Undo entry; missing tasks report as "not present" (Win10
 * vs Win11 variance) instead of failing. */
const T = (p) => p;

const ITEMS = [
  { id: 'task-auto-join', t: 'Disable Automatic Device Join', badge: 'safe', impact: 1, d: 'Workplace auto-join task.', tasks: [T('\\Microsoft\\Windows\\Workplace Join\\Automatic-Device-Join')] },
  { id: 'task-bt-uninstall', t: 'Disable Bluetooth Uninstall Task', badge: 'safe', impact: 1, d: 'Removes unused Bluetooth drivers.', tasks: [T('\\Microsoft\\Windows\\Bluetooth\\UninstallDeviceTask')] },
  { id: 'task-cloudhost', t: 'Disable Cloud Experience Host task', badge: 'safe', impact: 1, d: 'OOBE cloud content task.', tasks: [T('\\Microsoft\\Windows\\CloudExperienceHost\\CreateObjectTask')] },
  { id: 'svc-dusm-off', t: 'Disable Data Usage service', badge: 'safe', impact: 1, d: 'Feeds the Settings data-usage page.', services: [{ n: 'DusmSvc', label: 'Data Usage' }] },
  { id: 'task-family-monitor', t: 'Disable Family Safety Monitor', badge: 'safe', impact: 1, d: 'Family Safety monitoring task.', tasks: [T('\\Microsoft\\Windows\\Shell\\FamilySafetyMonitor')] },
  { id: 'task-family-refresh', t: 'Disable Family Safety Refresh', badge: 'safe', impact: 1, d: 'Family Safety refresh task.', tasks: [T('\\Microsoft\\Windows\\Shell\\FamilySafetyRefresh')] },
  { id: 'task-location-dialog', t: 'Disable Location Action Dialog', badge: 'safe', impact: 1, d: 'Location consent dialog task.', tasks: [T('\\Microsoft\\Windows\\Location\\Notifications')] },
  { id: 'task-location-notif', t: 'Disable Location Notifications', badge: 'safe', impact: 1, d: 'Location notification task.', tasks: [T('\\Microsoft\\Windows\\Location\\WindowsActionDialog')] },
  { id: 'task-mrt-offer', t: 'Disable Malicious Removal Tool offers', badge: 'safe', impact: 1, d: 'MRT heartbeat offers.', tasks: [T('\\Microsoft\\Windows\\RemovalTools\\MRT_HB')] },
  { id: 'task-maps-toast', t: 'Disable Maps Toast', badge: 'safe', impact: 1, d: 'Maps toast notifications.', tasks: [T('\\Microsoft\\Windows\\Maps\\MapsToastTask')] },
  { id: 'task-maps-update', t: 'Disable Maps Update', badge: 'safe', impact: 1, d: 'Offline maps updater.', tasks: [T('\\Microsoft\\Windows\\Maps\\MapsUpdateTask')] },
  { id: 'task-offline-sync', t: 'Disable Offline Files Sync', badge: 'safe', impact: 1, d: 'Offline Files background sync.', tasks: [T('\\Microsoft\\Windows\\Offline Files\\Background Synchronization')] },
  { id: 'task-pca-patchdb', t: 'Disable PCA Patch DB Task', badge: 'safe', impact: 1, d: 'Compatibility patch database.', tasks: [T('\\Microsoft\\Windows\\Application Experience\\PcaPatchDbTask')] },
  { id: 'task-push-login', t: 'Disable PushToInstall Login Check', badge: 'safe', impact: 1, d: 'Push-install login check.', tasks: [T('\\Microsoft\\Windows\\PushToInstall\\LoginCheck')] },
  { id: 'task-push-reg', t: 'Disable PushToInstall Registration', badge: 'safe', impact: 1, d: 'Push-install registration.', tasks: [T('\\Microsoft\\Windows\\PushToInstall\\Registration')] },
  { id: 'task-retail-cleanup', t: 'Disable Retail Demo cleanup', badge: 'safe', impact: 1, d: 'Retail demo content cleanup.', tasks: [T('\\Microsoft\\Windows\\RetailDemo\\CleanupOfflineContent')] },
  { id: 'task-speech-model', t: 'Disable Speech Model Download', badge: 'safe', impact: 1, d: 'Speech recognition model downloads.', tasks: [T('\\Microsoft\\Windows\\Speech\\SpeechModelDownloadTask')] },
  { id: 'task-startup-app', t: 'Disable Startup App Task', badge: 'safe', impact: 1, d: 'Startup app telemetry.', tasks: [T('\\Microsoft\\Windows\\Application Experience\\StartupAppTask')] },
  { id: 'task-clip-license', t: 'Disable Subscription License Acquisition', badge: 'safe', impact: 1, d: 'Clip license validation task.', tasks: [T('\\Microsoft\\Windows\\Clip\\License Validation')] },
  { id: 'task-tz-sync', t: 'Disable Time Zone Sync', badge: 'safe', impact: 1, d: 'Automatic time-zone sync.', tasks: [T('\\Microsoft\\Windows\\Time Zone\\SynchronizeTimeZone')] },
];

module.exports = { ITEMS };
