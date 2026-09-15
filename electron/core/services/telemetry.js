'use strict';
/* Section 2: DIAGNOSTIC & TELEMETRY SERVICES. All Safe badge. Mostly single
 * services/tasks; each reports missing targets honestly (Win10/11 variance)
 * instead of failing. */
const S = (n, label) => ({ n, label });

const ITEMS = [
  { id: 'svc-dps-off', t: 'Disable Diagnostic Policy Service', badge: 'safe', impact: 2, d: 'Problem-detection backend for troubleshooters.', services: [S('DPS', 'Diagnostic Policy')] },
  { id: 'svc-wappush-off', t: 'Disable WAP Push Message Routing', badge: 'safe', impact: 2, d: 'Push-message routing for telemetry and sync.', services: [S('dmwappushservice', 'WAP Push')] },
  { id: 'task-ait-agent', t: 'Disable Application Impact Telemetry', badge: 'safe', impact: 1, d: 'Application telemetry agent task.', tasks: ['\\Microsoft\\Windows\\Application Experience\\AitAgent'] },
  { id: 'task-autochk-proxy', t: 'Disable Autochk Proxy', badge: 'safe', impact: 1, d: 'Boot-time disk-check proxy task.', tasks: ['\\Microsoft\\Windows\\Autochk\\Proxy'] },
  { id: 'task-device-metadata', t: 'Disable Block device metadata downloads', badge: 'safe', impact: 1, d: 'Stops fetching device icons/metadata online.', tasks: ['\\Microsoft\\Windows\\Device Setup\\Metadata Refresh'] },
  { id: 'svc-sense-atp', t: 'Disable Windows Defender Advanced Threat Protection', badge: 'safe', impact: 1, d: 'Enterprise ATP sensor. Useless without Defender for Endpoint.', services: [S('Sense', 'ATP sensor')] },
  { id: 'svc-wecsvc', t: 'Disable Windows Event Collector', badge: 'safe', impact: 1, d: 'Forwards event logs to collectors. Enterprise-only.', services: [S('Wecsvc', 'Event Collector')] },
  { id: 'svc-graphicsperf', t: 'Disable Graphics Performance Monitor', badge: 'safe', impact: 1, d: 'GPU performance counters for diagnostics.', services: [S('GraphicsPerfSvc', 'Graphics Perf Monitor')] },
  { id: 'svc-wdi-host', t: 'Disable Diagnostic Service Host', badge: 'safe', impact: 1, d: 'Hosts diagnostic troubleshooters.', services: [S('WdiServiceHost', 'Diagnostic Host')] },
  { id: 'svc-wdi-sys', t: 'Disable Diagnostic System Host', badge: 'safe', impact: 1, d: 'System-context diagnostic host.', services: [S('WdiSystemHost', 'Diagnostic System Host')] },
  { id: 'svc-dshub', t: 'Disable Diagnostics Hub Collector', badge: 'safe', impact: 1, d: 'Developer diagnostics hub backend.', services: [S('Dshsvc', 'Diagnostics Hub')] },
  { id: 'task-error-queue', t: 'Disable Error Report Queue', badge: 'safe', impact: 1, d: 'Queues crash reports for upload.', tasks: ['\\Microsoft\\Windows\\Windows Error Reporting\\QueueReporting'] },
  { id: 'task-dmclient', t: 'Disable Feedback DmClient', badge: 'safe', impact: 1, d: 'Feedback Hub data collector.', tasks: ['\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient'] },
  { id: 'task-dmclient-dl', t: 'Disable Feedback scenario download', badge: 'safe', impact: 1, d: 'Downloads Feedback Hub scenarios.', tasks: ['\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload'] },
  { id: 'task-kernel-ceip', t: 'Disable Kernel CEIP', badge: 'safe', impact: 1, d: 'Kernel telemetry upload task.', tasks: ['\\Microsoft\\Windows\\Customer Experience Improvement Program\\KernelCeipTask'] },
  { id: 'task-winsat-power', t: 'Disable Power Efficiency Analysis', badge: 'safe', impact: 1, d: 'Periodic power-efficiency scoring (WinSAT).', tasks: ['\\Microsoft\\Windows\\Maintenance\\WinSAT'] },
  { id: 'task-progdata-upd', t: 'Disable Program Data Updater', badge: 'safe', impact: 1, d: 'Program telemetry inventory task.', tasks: ['\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater'] },
  { id: 'task-diag-scheduled', t: 'Disable Scheduled Diagnosis', badge: 'safe', impact: 1, d: 'Scheduled diagnostic runs.', tasks: ['\\Microsoft\\Windows\\Diagnosis\\Scheduled'] },
  { id: 'task-setup-cleanup', t: 'Disable Setup Cleanup', badge: 'safe', impact: 1, d: 'Post-setup cleanup task.', tasks: ['\\Microsoft\\Windows\\Setup\\SetupCleanupTask'] },
  { id: 'task-pi-sqm', t: 'Disable PI SQM Tasks', badge: 'safe', impact: 1, d: 'Software Quality Metrics uploads.', tasks: ['\\Microsoft\\Windows\\PI\\Sqm-Tasks'] },
  { id: 'task-device-info', t: 'Disable Device Information task', badge: 'safe', impact: 1, d: 'Device inventory reporting.', tasks: ['\\Microsoft\\Windows\\Device Information\\Device'] },
  { id: 'task-device-user', t: 'Disable Device User Information', badge: 'safe', impact: 1, d: 'Device-user inventory reporting.', tasks: ['\\Microsoft\\Windows\\Device Information\\Device User'] },
  { id: 'task-disk-collector', t: 'Disable Disk Diagnostic Collector', badge: 'safe', impact: 1, d: 'Collects disk failure telemetry.', tasks: ['\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector'] },
  { id: 'task-disk-resolver', t: 'Disable Disk Diagnostic Resolver', badge: 'safe', impact: 1, d: 'Resolves disk diagnostic faults.', tasks: ['\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticResolver'] },
  { id: 'task-disk-footprint', t: 'Disable Disk Footprint Diagnostics', badge: 'safe', impact: 1, d: 'Disk footprint measurements.', tasks: ['\\Microsoft\\Windows\\DiskFootprint\\Diagnostics'] },
  { id: 'task-usb-ceip', t: 'Disable USB CEIP', badge: 'safe', impact: 1, d: 'USB telemetry upload task.', tasks: ['\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip'] },
];

module.exports = { ITEMS };
