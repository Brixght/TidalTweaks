'use strict';
/* Section 7: CAUTION SERVICES (Break features). Every row carries an
 * explicit breakage warning in its modal — these are for hardware you
 * positively do not use. */
const S = (n, label) => ({ n, label });

const ITEMS = [
  {
    id: 'svc-btavctp-off', t: 'Disable Bluetooth AVCTP', badge: 'caution', impact: 2,
    d: 'Only if you use no Bluetooth audio.',
    warn: 'Bluetooth headphones/speakers stop working until re-enabled.',
    services: [S('BthAvctpSvc', 'Bluetooth AVCTP')],
  },
  {
    id: 'svc-cbdhsvc-off', t: 'Disable Clipboard User Service', badge: 'caution', impact: 2,
    d: 'Clipboard history and sync.',
    warn: 'Win+V history and cross-device clipboard sync stop working.',
    services: [S('cbdhsvc', 'Clipboard User Service')],
  },
  {
    id: 'svc-sessionenv-off', t: 'Disable Remote Desktop Configuration', badge: 'caution', impact: 2,
    d: 'Companion RDP component.',
    warn: 'Remote Desktop hosting breaks until re-enabled. Outbound RDP (you connecting elsewhere) is unaffected.',
    services: [S('SessionEnv', 'Remote Desktop Configuration')],
  },
  {
    id: 'svc-umrdp-off', t: 'Disable Remote Desktop redirector', badge: 'caution', impact: 2,
    d: 'Companion RDP component.',
    warn: 'RDP device/printer redirection breaks until re-enabled.',
    services: [S('UmRdpService', 'RDP Port Redirector')],
  },
  {
    id: 'svc-sstp-off', t: 'Disable SSTP VPN service', badge: 'caution', impact: 2,
    d: "Only if you don't use SSTP VPN.",
    warn: 'SSTP VPN connections fail until re-enabled. Other VPN types are unaffected.',
    services: [S('SstpSvc', 'SSTP VPN')],
  },
];

module.exports = { ITEMS };
