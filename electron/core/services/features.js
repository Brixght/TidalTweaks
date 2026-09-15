'use strict';
/* Section 6: FEATURE SERVICES (Disable if unused). All Safe badge. Per-user
 * template services (CDPUserSvc, OneSyncSvc, …) are addressed by template
 * name; absent ones report "not installed" instead of failing. Reuses
 * svc-touchkbd-off (Touch Keyboard) and svc-geo-off (Geolocation) via
 * row refs in index.js. */
const S = (n, label) => ({ n, label });

const ITEMS = [
  { id: 'svc-ajrouter-off', t: 'Disable AllJoyn Router', badge: 'safe', impact: 1, d: 'IoT device protocol, rarely used.', services: [S('AJRouter', 'AllJoyn Router')] },
  { id: 'svc-assignedaccess-off', t: 'Disable Assigned Access Manager', badge: 'safe', impact: 1, d: 'Kiosk mode support.', services: [S('AssignedAccessManagerSvc', 'Assigned Access')] },
  { id: 'svc-branchcache-off', t: 'Disable BranchCache', badge: 'safe', impact: 1, d: 'Enterprise content caching.', services: [S('PeerDistSvc', 'BranchCache')] },
  { id: 'svc-capture-off', t: 'Disable Capture Service', badge: 'safe', impact: 1, d: 'Screen capture broker.', services: [S('CaptureService', 'Capture Service')] },
  { id: 'svc-cdp-off', t: 'Disable Connected Devices user service', badge: 'safe', impact: 1, d: 'Nearby-device platform.', services: [S('CDPUserSvc', 'Connected Devices')] },
  { id: 'svc-pimindex-off', t: 'Disable Contact Data indexing', badge: 'safe', impact: 1, d: 'Contact data index maintenance.', services: [S('PimIndexMaintenanceSvc', 'Contact Data Index')] },
  { id: 'svc-devicepicker-off', t: 'Disable Device Picker', badge: 'safe', impact: 1, d: 'Device picker UI backend.', services: [S('DevicePickerUserSvc', 'Device Picker')] },
  { id: 'svc-devicesflow-off', t: 'Disable Devices Flow', badge: 'safe', impact: 1, d: 'Device connection flows.', services: [S('DevicesFlow', 'Devices Flow')] },
  { id: 'svc-entapp-off', t: 'Disable Enterprise App Management', badge: 'safe', impact: 1, d: 'Enterprise app provisioning.', services: [S('EntAppSvc', 'Enterprise App Mgmt')] },
  { id: 'svc-homegroup-listener-off', t: 'Disable HomeGroup Listener', badge: 'safe', impact: 1, d: 'Dead since HomeGroup removal (1803).', services: [S('HomeGroupListener', 'HomeGroup Listener')] },
  { id: 'svc-homegroup-provider-off', t: 'Disable HomeGroup Provider', badge: 'safe', impact: 1, d: 'Dead since HomeGroup removal (1803).', services: [S('HomeGroupProvider', 'HomeGroup Provider')] },
  { id: 'svc-msg-off', t: 'Disable Messaging Service', badge: 'safe', impact: 1, d: 'SMS routing, unused on desktops.', services: [S('MessagingService', 'Messaging Service')] },
  { id: 'svc-mixedreality-off', t: 'Disable Mixed Reality OpenXR', badge: 'safe', impact: 1, d: 'Unused without a VR headset.', services: [S('MixedRealityOpenXRSvc', 'Mixed Reality OpenXR')] },
  { id: 'svc-wpdbusenum-off', t: 'Disable Portable Device Enumerator', badge: 'safe', impact: 1, d: 'Enumerates phones/cameras for apps.', services: [S('WPDBusEnum', 'Portable Device Enumerator')] },
  { id: 'svc-printnotify-off', t: 'Disable Printer Extensions and Notifications', badge: 'safe', impact: 1, d: 'Printer app extensions.', services: [S('PrintNotify', 'Printer Extensions')] },
  { id: 'svc-sensordata-off', t: 'Disable Sensor Data Service', badge: 'safe', impact: 1, d: 'Sensor data broker.', services: [S('SensorDataService', 'Sensor Data')] },
  { id: 'svc-sensr-off', t: 'Disable Sensor Monitoring', badge: 'safe', impact: 1, d: 'Sensor monitoring service.', services: [S('SensrSvc', 'Sensor Monitoring')] },
  { id: 'svc-sensor-off', t: 'Disable Sensor Service', badge: 'safe', impact: 1, d: 'Unused without ambient light or orientation sensors.', services: [S('SensorService', 'Sensor Service')] },
  { id: 'svc-sharedpc-off', t: 'Disable Shared PC Account Manager', badge: 'safe', impact: 1, d: 'Shared/school PC account mode.', services: [S('SharedPCAccountManager', 'Shared PC Accounts')] },
  { id: 'svc-scdeviceenum-off', t: 'Disable Smart Card Device Enumeration', badge: 'safe', impact: 1, d: 'Smart card readers.', services: [S('SCDeviceEnum', 'Smart Card Enumeration')] },
  { id: 'svc-scpolicy-off', t: 'Disable Smart Card Removal Policy', badge: 'safe', impact: 1, d: 'Lock-on-smart-card-removal.', services: [S('SCPolicySvc', 'Smart Card Policy')] },
  { id: 'svc-spatial-off', t: 'Disable Spatial Data Service', badge: 'safe', impact: 1, d: 'Holographic spatial data.', services: [S('SharedRealitySvc', 'Spatial Data')] },
  { id: 'svc-sti-off', t: 'Disable Still Image Acquisition Events', badge: 'safe', impact: 1, d: 'Scanner/camera event monitor.', services: [S('StiSvc', 'Still Image Acquisition')] },
  { id: 'svc-onesync-off', t: 'Disable Sync Host', badge: 'safe', impact: 1, d: 'Syncs mail, contacts and calendar tiles.', services: [S('OneSyncSvc', 'Sync Host')] },
  { id: 'svc-sgrm-off', t: 'Disable System Guard Runtime Monitor', badge: 'safe', impact: 1, d: 'System Guard attestation broker.', services: [S('SgrmBroker', 'System Guard Monitor')] },
  { id: 'svc-userdata-off', t: 'Disable User Data Access', badge: 'safe', impact: 1, d: 'App access to user data stores.', services: [S('UserDataSvc', 'User Data Access')] },
  { id: 'svc-unistore-off', t: 'Disable User Data Storage', badge: 'safe', impact: 1, d: 'User data storage backend.', services: [S('UnistoreSvc', 'User Data Storage')] },
  { id: 'svc-wallet-off', t: 'Disable Wallet Service', badge: 'safe', impact: 1, d: 'Wallet/NFC payment objects.', services: [S('WalletService', 'Wallet Service')] },
];

module.exports = { ITEMS };
